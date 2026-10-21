// Runs `claude plugin eval` on one plugin: `bun run eval <plugin> [eval flags] [--force]`. The eval
// sandbox cannot resolve a manifest's `dependencies` (dependency-unsatisfied, Claude Code 2.1.289)
// and then loads no skill, so the eval runs on a temporary copy without them. Results land in the
// plugin's evals/results/ (gitignored). Every model is named, never inherited: the LLM graders are
// judged by haiku (claude-haiku-5-5, the cheapest model that grades well) and the agent under test
// runs on sonnet, unless a flag says otherwise.
//
// A run costs fewer model calls in three ways. Before any model runs, every regex grader (of the
// picked cases only, with `--case` or `--tag`; the others only warn) is broken on purpose: it must match samples/pass.md and not samples/fail.md of its case. Fire and negative
// cases run with no baseline arm, scenarios with the with-without ablation, in separate calls.
// A case whose files, and the plugin's skills/agents/instructions, are unchanged since it last met
// the bar is not run again; `--force` runs everything. `--case` or `--tag` from the caller runs
// one plain call with the caller's flags and skips nothing.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { YAML } from "bun";
import { isRecord, root, walk } from "./walk.ts";

const [name, ...args] = process.argv.slice(2);
if (name === undefined) {
  console.error("usage: bun run eval <plugin> [claude plugin eval flags] [--force]");
  process.exit(2);
}
const force = args.includes("--force");
const flags = args.filter((a) => a !== "--force");
const pick = flags.some((f) => f === "--case" || f === "--tag");

interface Arm {
  passed?: boolean | undefined;
  turns?: number | undefined;
}
interface Case {
  name: string;
  arms?: { with?: Arm[]; without?: Arm[] };
}
interface Verdict {
  name: string;
  ok: boolean;
  text: string;
}
interface Entry {
  dir: string;
  label: string;
  kind: string;
  name: string;
  tags: string[];
}

const KINDS = ["fire", "negative", "scenario"];
const plugin = join(root, "plugins", name);
const evals = join(plugin, "evals");
const hashFile = join(evals, "results", "case-hashes.json");

const str = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);

/** The YAML of a case.yaml, or the frontmatter block of a markdown file. */
function frontmatter(file: string): Record<string, unknown> {
  const text = readFileSync(file, "utf8");
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const doc: unknown = YAML.parse(file.endsWith(".md") ? block : text);
  if (doc === null || doc === undefined) {
    return {};
  }
  if (!isRecord(doc)) {
    throw new Error(`${file}: the top level must be a mapping`);
  }
  return doc;
}

/** The plugin's case directories: a directory with a case.yaml or a prompt.md. */
function caseDirs(): Entry[] {
  if (!existsSync(evals)) {
    return [];
  }
  return readdirSync(evals, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "results" && d.name !== "mocks")
    .map((d) => join(evals, d.name))
    .filter((dir) => existsSync(join(dir, "case.yaml")) || existsSync(join(dir, "prompt.md")))
    .map((dir) => {
      const file = existsSync(join(dir, "case.yaml")) ? "case.yaml" : "prompt.md";
      const meta = frontmatter(join(dir, file));
      const tags = Array.isArray(meta.tags) ? meta.tags.map(String) : [];
      const label = relative(evals, dir);
      return {
        dir,
        label,
        kind: KINDS.find((k) => tags.includes(k)) ?? "",
        name: str(meta.name, label),
        tags,
      };
    });
}

/** What is wrong with one grader file of a case, if it is a regex: the sample it breaks on. */
function brokenGrader(c: Entry, g: string): string[] {
  const meta = frontmatter(join(c.dir, "graders", g));
  if (meta.type !== "regex") {
    return [];
  }
  const who = `${c.label}, grader ${g}`;
  if (typeof meta.pattern !== "string") {
    return [`${who}: a regex grader needs a string pattern`];
  }
  let re: RegExp;
  try {
    re = new RegExp(meta.pattern, str(meta.flags, ""));
  } catch (e) {
    return [`${who}: the pattern does not compile (${e instanceof Error ? e.message : String(e)})`];
  }
  return (
    [
      ["pass.md", true],
      ["fail.md", false],
    ] as const
  ).flatMap(([sample, shouldMatch]) => {
    const file = join(c.dir, "samples", sample);
    if (!existsSync(file)) {
      return [`${who}: samples/${sample} is missing`];
    }
    if (re.test(readFileSync(file, "utf8")) === shouldMatch) {
      return [];
    }
    return [`${who}: ${re} ${shouldMatch ? "does not match" : "matches"} samples/${sample}`];
  });
}

/** Break the grader first: a regex must match samples/pass.md and not samples/fail.md. */
function brokenGraders(cases: Entry[]): string[] {
  return cases.flatMap((c) => {
    const graders = join(c.dir, "graders");
    const files = existsSync(graders) ? readdirSync(graders).filter((f) => f.endsWith(".md")) : [];
    return files.toSorted().flatMap((g) => brokenGrader(c, g));
  });
}

/** Hash of the case directory plus the plugin's skills, agents and instructions. */
function caseHash(dir: string): string {
  const h = createHash("sha256");
  for (const d of [dir, ...["skills", "agents", "instructions"].map((s) => join(plugin, s))]) {
    for (const f of [...walk(d)].toSorted()) {
      h.update(`${relative(plugin, f)}\0`);
      h.update(readFileSync(f));
    }
  }
  return h.digest("hex");
}

const armsOf = (v: unknown): Arm[] => {
  const out: Arm[] = [];
  for (const a of Array.isArray(v) ? v : []) {
    if (isRecord(a)) {
      out.push({
        passed: typeof a.passed === "boolean" ? a.passed : undefined,
        turns: typeof a.turns === "number" ? a.turns : undefined,
      });
    }
  }
  return out;
};

/** The cases of an aggregate-result.json; a file of another shape is a loud failure. */
function parseCases(file: string): Case[] {
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(raw) || (raw.cases !== undefined && !Array.isArray(raw.cases))) {
    throw new Error(`${file}: not an aggregate result with a cases array`);
  }
  return (raw.cases ?? [])
    .filter((c) => isRecord(c))
    .map((c) => {
      if (typeof c.name !== "string") {
        throw new TypeError(`${file}: a case has no name`);
      }
      const a = isRecord(c.arms) ? c.arms : {};
      return { name: c.name, arms: { with: armsOf(a.with), without: armsOf(a.without) } };
    });
}

/** The remembered verdicts of earlier runs; a malformed cache is a loud failure. */
function readHashes(file: string): Record<string, { hash: string; ok: boolean }> {
  if (!existsSync(file)) {
    return {};
  }
  const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(raw)) {
    throw new Error(`${file}: not an object of case hashes`);
  }
  const out: Record<string, { hash: string; ok: boolean }> = {};
  for (const [key, v] of Object.entries(raw)) {
    if (!isRecord(v) || typeof v.hash !== "string" || typeof v.ok !== "boolean") {
      throw new Error(`${file}: entry ${key} is not { hash, ok }`);
    }
    out[key] = { hash: v.hash, ok: v.ok };
  }
  return out;
}

function passed(arms: Arm[]): number {
  return arms.filter((a) => a.passed === true).length;
}

function turns(arms: Arm[]): string {
  return arms.length === 0
    ? "n/a"
    : String(Math.round(arms.reduce((n, a) => n + (a.turns ?? 0), 0) / arms.length));
}

/** A verdict per case from the aggregate results of the runs. */
function verdicts(files: string[]): Verdict[] {
  return files.flatMap((file) => {
    return parseCases(file).map((c) => {
      const w = c.arms?.with ?? [];
      const wo = c.arms?.without ?? [];
      const ablated = wo.length > 0;
      const ok =
        w.length > 0 &&
        passed(w) === w.length &&
        (c.name.endsWith("-negative") || !ablated || passed(wo) * 2 < wo.length);
      const without = ablated ? `${passed(wo)}/${wo.length}` : "n/a";
      const text = `${c.name}: ${ok ? "meets" : "below"} bar (with ${passed(w)}/${w.length}, without ${without}, turns ${turns(w)} vs ${turns(wo)})`;
      return { name: c.name, ok, text };
    });
  });
}

/** The values a repeatable flag carries, as `--case a --case b`. */
function flagValues(flag: string): string[] {
  return flags.flatMap((f, i) =>
    f === flag && flags[i + 1] !== undefined ? [flags[i + 1] ?? ""] : [],
  );
}

const all = caseDirs();
const cases = flagValues("--case");
const tags = flagValues("--tag");
// `--case` is a name glob, as in `claude plugin eval --case <glob>`.
const caseGlobs = cases.map((pattern) => new Bun.Glob(pattern));
for (const [i, g] of caseGlobs.entries()) {
  if (!all.some((c) => g.match(c.name) || g.match(c.label))) {
    console.error(`--case ${cases[i]} matches no case of ${name}, no model was run`);
    process.exit(1);
  }
}
const picked = all.filter(
  (c) =>
    (cases.length === 0 && tags.length === 0) ||
    caseGlobs.some((g) => g.match(c.name) || g.match(c.label)) ||
    tags.some((t) => c.tags.includes(t)),
);
const bad = brokenGraders(picked);
if (bad.length > 0) {
  console.error(`regex graders broken, no model was run:\n${bad.map((b) => `  ${b}`).join("\n")}`);
  process.exit(1);
}
if (pick) {
  const others = brokenGraders(all.filter((c) => !picked.includes(c)));
  if (others.length > 0) {
    console.error(
      `warning: regex graders broken in cases not run:\n${others.map((b) => `  ${b}`).join("\n")}`,
    );
  }
}
const untagged = pick ? [] : all.filter((c) => c.kind === "");
if (untagged.length > 0) {
  const names = untagged.map((c) => c.label).join(", ");
  console.error(`cases without a fire, negative or scenario tag, no model was run: ${names}`);
  process.exit(1);
}

const hashes = readHashes(hashFile);
const current = new Map(all.map((c) => [c.name, caseHash(c.dir)]));
const skipped =
  pick || force
    ? []
    : all.filter((c) => {
        const entry = hashes[c.name];
        return entry?.ok === true && entry.hash === current.get(c.name);
      });
const todo = all.filter((c) => !skipped.includes(c));

const copy = mkdtempSync(join(tmpdir(), `eval-${name}-`));
let code = 0;
try {
  cpSync(plugin, copy, { recursive: true });
  const manifestPath = join(copy, ".claude-plugin", "plugin.json");
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error(`${manifestPath}: not an object`);
  }
  const { dependencies: _, ...manifest } = parsed;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  // A scaffold script gets a scrubbed env, so it finds the repository root in this file, two
  // levels above itself: `cat "$(dirname "$0")/../../.eval-repo"`.
  writeFileSync(join(copy, ".eval-repo"), root);
  // A skipped case is removed from the copy, so the eval never sees it.
  for (const c of skipped) {
    rmSync(join(copy, "evals", c.label), { recursive: true, force: true });
  }
  const has = (f: string) => flags.includes(f);
  const defaults = [
    "--trust-plugin",
    ...(has("--judge-model") ? [] : ["--judge-model", "haiku"]),
    ...(has("--model") ? [] : ["--model", "sonnet"]),
    ...(has("--scaffold") ? [] : ["--scaffold"]),
    ...(has("--allow-tools") ? [] : ["--allow-tools", "Bash", "Write", "Edit"]),
    ...(has("--max-cost-usd") ? [] : ["--max-cost-usd", "5"]),
  ];
  // --tag is repeatable but its AND/OR rule is undocumented, so each kind is its own call.
  const calls: string[][] = pick
    ? [[]]
    : [
        ["--tag", "fire", "--ablation", "none"],
        ["--tag", "negative", "--ablation", "none"],
        ["--tag", "scenario"],
      ].filter((c) => todo.some((t) => t.kind === c[1]));
  const results = join(copy, "evals", "results");
  const seen = new Set(existsSync(results) ? readdirSync(results) : []);
  for (const call of calls) {
    const run = spawnSync("claude", ["plugin", "eval", copy, ...defaults, ...call, ...flags], {
      stdio: "inherit",
    });
    code = code || (run.status ?? 1);
  }
  const fresh = (existsSync(results) ? readdirSync(results) : [])
    .filter((d) => !seen.has(d) && existsSync(join(results, d, "aggregate-result.json")))
    .toSorted()
    .map((d) => join(results, d, "aggregate-result.json"));
  const got = verdicts(fresh);
  if (todo.length > 0 && got.length === 0) {
    console.log("bar verdict: none, no aggregate-result.json");
  }
  const lines = [
    ...skipped.map((c) => ({ ok: true, text: `${c.name}: meets bar (unchanged, skipped)` })),
    ...got,
  ];
  for (const l of lines) {
    console.log(l.text);
  }
  console.log(`${lines.filter((l) => l.ok).length}/${lines.length} cases meet the bar`);
  if (existsSync(results)) {
    cpSync(results, join(evals, "results"), { recursive: true });
  }
  // Remember each judged case against the hash it ran with, for the next run's skip.
  if (!pick && got.length > 0) {
    const next = { ...hashes };
    for (const g of got) {
      next[g.name] = { hash: current.get(g.name) ?? "", ok: g.ok };
    }
    mkdirSync(join(evals, "results"), { recursive: true });
    writeFileSync(hashFile, `${JSON.stringify(next, null, 2)}\n`);
  }
} finally {
  rmSync(copy, { recursive: true, force: true });
}
process.exit(code);
