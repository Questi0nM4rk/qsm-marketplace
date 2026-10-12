// The structural (architecture) comparison: the same reference-tree-versus- shipped-tree rule every
// language checker in compare.ts applies, scored by `sentrux check --json` instead of a
// per-language linter.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob, TOML } from "bun";
import { generatedPaths, gitPaths } from "./config.ts";
import { type Kept, leaveOut, withCommitTree, withWorktreeTree } from "./tree.ts";

const RULES_REL = join(".sentrux", "rules.toml");
const INSTALL_LINE = "install a qsm-patched sentrux: qsm-langdev doctor names the command";

/** How far the aggregate quality may fall before the verdict fails. */
const QUALITY_TOLERANCE = 20;

/**
 * What the structure score leaves out of both trees: test files and test fixtures, by each
 * language's own convention.
 */
const TEST_FILES = [
  // bun test, vitest, jest
  "**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}",
  "**/__tests__/**",
  "**/fixtures/**",
  // pytest and unittest; `tests/` is also where cargo keeps integration tests
  "**/test_*.py",
  "**/*_test.py",
  "**/conftest.py",
  "**/tests/**",
  // a .NET test project
  "**/*.Tests/**",
  // go test
  "**/*_test.go",
  "**/testdata/**",
].map((pattern) => new Glob(pattern));

/** Whether a repository-relative path is a test file or a test fixture. */
export function isTestFile(path: string): boolean {
  return TEST_FILES.some((glob) => glob.match(path));
}

/** The materialized tree without its test files and its generated files, the latter by the
 * repository's own `.gitattributes` marker, the definition the language checkers use. */
function leaveOutNonProduct(dir: string): Kept {
  const generated = generatedPaths(dir, gitPaths(dir, ["ls-files", "-z"]) ?? []);
  return leaveOut(dir, (path) => isTestFile(path) || generated.has(path));
}

/** Overlays the working tree's `.sentrux/rules.toml` onto a materialized
 * commit, so a past commit is judged under the rules being shipped, not its
 * own past ones — the same rule compare.ts applies to profile configs. */
function overlayRules(root: string, dir: string): void {
  const rulesSrc = join(root, RULES_REL);
  if (!existsSync(rulesSrc)) {
    return;
  }
  mkdirSync(join(dir, ".sentrux"), { recursive: true });
  copyFileSync(rulesSrc, join(dir, RULES_REL));
}

/** The tree at `ref` as an on-disk directory with its test files left out:
 * a scratch materialization of the working tree (never the live directory
 * itself — see lib/tree.ts), or a materialized commit with today's rules
 * overlaid on top of it. Both sides go through here, so both are filtered
 * by the one `isTestFile`. */
async function withTree<T>(
  root: string,
  ref: string | "worktree",
  fn: (dir: string, kept: Kept) => T,
): Promise<T> {
  if (ref === "worktree") {
    return withWorktreeTree(root, (dir) => fn(dir, leaveOutNonProduct(dir)));
  }
  return await withCommitTree(root, ref, (dir) => {
    overlayRules(root, dir);
    return fn(dir, leaveOutNonProduct(dir));
  });
}

/** The five terms under `quality`, and what each one measures in words an agent can act on. */
const CAUSE_GLOSS = {
  modularity: "how well the module graph clusters: edges inside a module, not across it",
  equality: "Gini of function complexity: one function far from the median size",
  redundancy: "dead or duplicate functions over total",
  depth: "the longest import chain",
  acyclicity: "files sitting in an import cycle",
} as const;

type Cause = keyof typeof CAUSE_GLOSS;
const CAUSES = Object.keys(CAUSE_GLOSS) as Cause[];

type Causes = Record<Cause, number>;

/** One tree's shape: the aggregate and the five terms it is the geometric mean of. */
interface TreeScore {
  quality: number;
  causes: Causes;
}

interface Edge {
  from: string;
  to: string;
  kind: string;
}
interface RawCause {
  score?: unknown;
}
interface CheckReport {
  quality?: unknown;
  cross_module_edges?: unknown;
  root_causes?: Record<string, RawCause>;
  rules?: { violations?: unknown };
}

/** One `[[layers]]` entry of `.sentrux/rules.toml`: which paths it owns and
 * where it sits. Lower order is lower layer. */
export interface Layer {
  readonly name: string;
  readonly paths: readonly string[];
  readonly order: number;
}

function isLayer(value: unknown): value is Layer {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { name, paths, order } = value as Record<string, unknown>;
  return (
    typeof name === "string" &&
    typeof order === "number" &&
    Array.isArray(paths) &&
    paths.every((p) => typeof p === "string")
  );
}

/** The layers a rules file declares, or none: the same TOML sentrux reads,
 * so the gate and the checker agree on what a layer is. */
export function readLayers(rulesText: string): Layer[] {
  let parsed: unknown;
  try {
    parsed = TOML.parse(rulesText);
  } catch {
    return [];
  }
  const { layers } = parsed as { layers?: unknown };
  return Array.isArray(layers) ? layers.filter(isLayer) : [];
}

/** `lib/*` owns `lib/cli-base.ts`: a layer path is a prefix once its
 * trailing glob is dropped. Null when no layer owns the path. */
function layerOrder(path: string, layers: readonly Layer[]): number | null {
  for (const layer of layers) {
    for (const pattern of layer.paths) {
      const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : `${pattern}/`;
      if (path.startsWith(prefix)) {
        return layer.order;
      }
    }
  }
  return null;
}

/** An edge from a higher layer into a lower one — a plugin calling root
 * lib/ — is the shape the layer rules prescribe, so a new one is never a
 * regression; without it no new plugin could ever land its first commit.
 * Every other new edge (upward, sideways, or outside the layers) still
 * fails on its own. */
export function isDownwardEdge(from: string, to: string, layers: readonly Layer[]): boolean {
  const fromOrder = layerOrder(from, layers);
  const toOrder = layerOrder(to, layers);
  return fromOrder !== null && toOrder !== null && fromOrder > toOrder;
}

function edgeName(edge: Edge): string {
  return `${edge.from} -> ${edge.to} (${edge.kind})`;
}

/** A rule violation as one line. */
function violationName(violation: unknown): string {
  if (typeof violation === "string") {
    return violation;
  }
  return JSON.stringify(violation);
}

/** The five scores, or null when sentrux named fewer than five — a build
 * whose root causes we cannot read must not be reported as if we could. */
function readCauses(raw: Record<string, RawCause> | undefined): Causes | null {
  if (raw === undefined) {
    return null;
  }
  const causes = {} as Causes;
  for (const cause of CAUSES) {
    const value = raw[cause]?.score;
    if (typeof value !== "number") {
      return null;
    }
    causes[cause] = value;
  }
  return causes;
}

interface DirReport {
  score: TreeScore;
  edges: string[];
  violations: string[];
}
type ScoreDir = DirReport | { reason: string };

/**
 * sentrux's report for a directory: the shape numbers, the cross-module edges, and the rule
 * violations.
 */
function scoreDir(dir: string): ScoreDir {
  // `env` named: Bun resolves the binary against the PATH the process
  // started with unless it is handed one, and a test puts a fake first.
  const result = spawnSync("sentrux", ["check", "--json", dir], {
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) {
    return { reason: `sentrux could not run: ${result.error.message}` };
  }
  let report: CheckReport;
  try {
    report = JSON.parse(result.stdout ?? "") as CheckReport;
  } catch {
    return { reason: "sentrux printed no JSON — this needs the qsm-patched build" };
  }
  if (typeof report.quality !== "number" || !Array.isArray(report.cross_module_edges)) {
    return { reason: "sentrux's JSON carries no quality or edge list" };
  }
  const causes = readCauses(report.root_causes);
  if (causes === null) {
    return { reason: "sentrux's JSON carries no root-cause breakdown" };
  }
  const violations = Array.isArray(report.rules?.violations) ? report.rules.violations : [];
  const layers = readLayers(readFileSync(join(dir, RULES_REL), "utf8"));
  return {
    score: { quality: report.quality, causes },
    edges: (report.cross_module_edges as Edge[])
      .filter((edge) => !isDownwardEdge(edge.from, edge.to, layers))
      .map(edgeName),
    violations: violations.map(violationName),
  };
}

export type StructureResult =
  | {
      status: "scored";
      reference: TreeScore;
      shipped: TreeScore;
      edgesAdded: string[];
      violationsAdded: string[];
      /** How many test files the shipped tree left out of the score. */
      testFiles: number;
    }
  | { status: "not-scored"; reason: string; install?: string };

/** Scores two already-on-disk directory trees against each other: never touches git. */
function score(referenceTree: string, shippedTree: string, testFiles: number): StructureResult {
  if (!(existsSync(join(referenceTree, RULES_REL)) && existsSync(join(shippedTree, RULES_REL)))) {
    return {
      status: "not-scored",
      reason: `${RULES_REL} is absent, so sentrux has no ruleset to score under`,
    };
  }
  const reference = scoreDir(referenceTree);
  if ("reason" in reference) {
    return {
      status: "not-scored",
      reason: `reference tree: ${reference.reason}`,
      install: INSTALL_LINE,
    };
  }
  const shipped = scoreDir(shippedTree);
  if ("reason" in shipped) {
    return {
      status: "not-scored",
      reason: `shipped tree: ${shipped.reason}`,
      install: INSTALL_LINE,
    };
  }
  const added = (before: string[], after: string[]): string[] => {
    const had = new Set(before);
    return after.filter((entry) => !had.has(entry)).sort((a, b) => a.localeCompare(b));
  };
  return {
    status: "scored",
    reference: reference.score,
    shipped: shipped.score,
    edgesAdded: added(reference.edges, shipped.edges),
    violationsAdded: added(reference.violations, shipped.violations),
    testFiles,
  };
}

/** The two root causes that moved most, as `name 0.605 -> 0.578`. */
function movedCauses(reference: Causes, shipped: Causes): string[] {
  return CAUSES.map((cause) => ({ cause, delta: shipped[cause] - reference[cause] }))
    .filter((moved) => Math.abs(moved.delta) >= 0.001)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 2)
    .map(({ cause }) => `${cause} ${reference[cause].toFixed(3)} -> ${shipped[cause].toFixed(3)}`);
}

/** The quality line: the aggregate, its delta, and what moved. Printed
 * under every verdict, whichever way the verdict went. */
function shapeLine(reference: TreeScore, shipped: TreeScore): string {
  const delta = shipped.quality - reference.quality;
  const signed = delta >= 0 ? `+${delta}` : `${delta}`;
  const moved = movedCauses(reference.causes, shipped.causes);
  const head = `structure quality: ${reference.quality} -> ${shipped.quality} (${signed})`;
  return moved.length === 0 ? head : `${head}; ${moved.join(", ")}`;
}

/** The gloss for every cause that moved down, so a reader knows what the
 * number is about without leaving the terminal. */
function shapeDetail(reference: Causes, shipped: Causes): string[] {
  return CAUSES.filter((cause) => shipped[cause] - reference[cause] <= -0.001).map(
    (cause) => `  ${cause}: ${CAUSE_GLOSS[cause]}`,
  );
}

export interface StructureVerdict {
  pass: boolean;
  summary: string;
  detail: string[];
}

/** The verdict for a tree pair that was not scored: it passes unless a tool is missing to install. */
function notScoredVerdict(
  result: Extract<StructureResult, { status: "not-scored" }>,
): StructureVerdict {
  const missing = result.install !== undefined;
  return {
    pass: !missing,
    summary: missing ? `structure: ${result.reason}` : `structure: ${result.reason} — not scored`,
    detail: missing ? [`Install: ${result.install}`] : [],
  };
}

/** What a failing verdict names: new violations, new edges, a quality drop past the tolerance. */
function faultsOf(violations: number, edges: number, qualityDrop: number): string[] {
  const faults: string[] = [];
  if (violations > 0) {
    faults.push(`${violations} new rule violation(s)`);
  }
  if (edges > 0) {
    faults.push(`${edges} new cross-module edge(s)`);
  }
  if (qualityDrop > QUALITY_TOLERANCE) {
    faults.push(`quality fell ${qualityDrop}, past the tolerance of ${QUALITY_TOLERANCE}`);
  }
  return faults;
}

/**
 * The one verdict every caller uses — the CLI verb, the gate runner and the stop hook — so the
 * three cannot drift apart.
 */
export function verdict(result: StructureResult): StructureVerdict {
  if (result.status === "not-scored") {
    return notScoredVerdict(result);
  }
  const { reference, shipped, edgesAdded, violationsAdded } = result;
  const shape = shapeLine(reference, shipped);
  const leftOut = `${result.testFiles} test file(s) left out of the score`;
  const qualityDrop = reference.quality - shipped.quality;
  const faults = faultsOf(violationsAdded.length, edgesAdded.length, qualityDrop);
  if (faults.length === 0) {
    return {
      pass: true,
      summary: shape,
      detail: [leftOut, ...shapeDetail(reference.causes, shipped.causes)],
    };
  }
  return {
    pass: false,
    summary: `structure: ${faults.join(", ")}`,
    detail: [
      ...violationsAdded.map((violation) => `  ${violation}`),
      ...edgesAdded.map((edge) => `  ${edge}`),
      ...(edgesAdded.length > 0 ? ["  a plugin imports from root lib/ and from itself only"] : []),
      shape,
      leftOut,
      ...(qualityDrop > QUALITY_TOLERANCE ? shapeDetail(reference.causes, shipped.causes) : []),
    ],
  };
}

/** The tree at `before` (a commit) against the tree at `after` (a commit, or
 * the working tree): materializes whichever side needs it, under the rules
 * being shipped and with test files left out, and scores them with `score`.
 * When what is left is the same on both sides, the change touched tests
 * only (or nothing), and that is said rather than scored: sentrux would
 * compare a tree with itself. */
export async function compareStructure(
  root: string,
  before: string,
  after: string | "worktree",
): Promise<StructureResult> {
  return await withTree(root, before, (referenceTree, referenceKept) =>
    withTree(root, after, (shippedTree, shippedKept): StructureResult => {
      if (referenceKept.listing === shippedKept.listing) {
        return {
          status: "not-scored",
          reason: `no product file changed (${shippedKept.leftOut} test file(s) left out of the score)`,
        };
      }
      return score(referenceTree, shippedTree, shippedKept.leftOut);
    }),
  );
}

/** The working tree against the commit at `before` — what a stop gate or
 * `structure` with no `--against` compares. */
export function compareWorktreeSince(root: string, before: string): Promise<StructureResult> {
  return compareStructure(root, before, "worktree");
}
