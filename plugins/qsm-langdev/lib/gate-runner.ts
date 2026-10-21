// The git-hook gates: what `qsm-langdev hook <name>` runs for one enforcement point.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { contentDenylistPath } from "../../../lib/paths.ts";
import { compareTrees, headline, runOutcome, type Verdict } from "./compare.ts";
import { readGatesConfig } from "./config.ts";
import { describeSets } from "./file-sets.ts";
import { fixFiles, isFixable } from "./fixers.ts";
import { resolveRef } from "./gitref.ts";
import { recordsOf } from "./json.ts";
import {
  commitCount,
  type PushedRef,
  parsePushLines,
  pushedRange,
  pushReference,
  remoteTipMissing,
} from "./push.ts";
import type { EnforcementPoint } from "./registry.ts";
import { describeStore } from "./result-store.ts";
import { compareStructure, type StructureResult, verdict } from "./structure.ts";

/** `regression` marks a failure the checkers measured, the one kind
 * QSM_LANGDEV_ALLOW lets pass; a check that could not run is never one. */
export type GateOutcome =
  | { gate: string; status: "pass"; note?: string }
  | { gate: string; status: "skipped"; reason: string }
  | { gate: string; status: "failed"; reason: string; remedy: string[]; regression?: true }
  | { gate: string; status: "blocked"; reason: string; remedy: string[] };

/** A passing gate may still carry a `note`: the structure gate prints the
 * quality delta and the root cause that moved on every commit, whether or
 * not it blocks, because a number nobody sees changes nobody's work. */
const pass = (gate: string, note?: string): GateOutcome =>
  note === undefined ? { gate, status: "pass" } : { gate, status: "pass", note };
const skip = (gate: string, reason: string): GateOutcome => ({ gate, status: "skipped", reason });
const fail = (gate: string, reason: string, remedy: string[], regression?: true): GateOutcome =>
  regression
    ? { gate, status: "failed", reason, remedy, regression }
    : { gate, status: "failed", reason, remedy };

type Spawned = { status: number; stdout: string; stderr: string } | { missing: true };

function runOrMissing(binary: string, args: string[], cwd: string): Spawned {
  const result = spawnSync(binary, args, { cwd, encoding: "utf8" });
  if (result.error) {
    return { missing: true };
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function stagedPaths(root: string): string[] | null {
  const result = spawnSync("git", ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACM"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.split("\0").filter((path) => path.length > 0);
}

function isDirty(root: string, file: string): boolean {
  return spawnSync("git", ["diff", "--quiet", "--", file], { cwd: root }).status === 1;
}

/** Staged files are fixed and staged again before the check, so what a tool can rewrite never
 * blocks a commit. A file with unstaged changes is left alone: re-staging it would commit them. */
function fixStaged(root: string): string[] {
  const staged = stagedPaths(root) ?? [];
  const dirty = staged.filter((f) => isDirty(root, f));
  const fixed = fixFiles(
    root,
    staged.filter((f) => !dirty.includes(f)),
  );
  if (fixed.length > 0) {
    spawnSync("git", ["add", "--", ...fixed], { cwd: root });
  }
  return dirty.filter((f) => isFixable(root, f));
}

/** When the gate blocks, names each file a fixer skipped for its unstaged changes: the finding may
 * be one the fixer would have removed. */
function withSkipped(outcome: GateOutcome, skipped: readonly string[]): GateOutcome {
  if (skipped.length === 0 || (outcome.status !== "failed" && outcome.status !== "blocked")) {
    return outcome;
  }
  const lines = skipped.map(
    (f) => `${f}: not auto-fixed, it has unstaged changes. Stage or stash them, then commit again.`,
  );
  return { ...outcome, remedy: [...outcome.remedy, ...lines] };
}

function secretsGate(root: string, point: EnforcementPoint, pushLines?: string): GateOutcome {
  const config = ".gitleaks.toml";
  if (!existsSync(join(root, config))) {
    return fail("secrets", `${config} is not in this repo, so secrets cannot run`, [
      `Create ${config}, or remove 'secrets' from .qsm-langdev/gates.json.`,
    ]);
  }
  if (point === "pre-push") {
    return pushedSecretsGate(root, config, pushLines);
  }
  const result = runOrMissing(
    "gitleaks",
    ["git", "--staged", "--config", config, "--no-banner"],
    root,
  );
  if ("missing" in result) {
    return fail("secrets", "gitleaks is not installed", [
      "Install: https://github.com/gitleaks/gitleaks, or your package manager",
    ]);
  }
  if (result.status !== 0) {
    return fail("secrets", "staged changes carry a secret", [
      "If it is a false positive, add a tighter regex to .gitleaks.toml [allowlist].",
    ]);
  }
  return denylistGate(root);
}

/** The block for a pushed range gitleaks would scan as nothing and exit 0 over: a remote tip this
 * clone never fetched, or a range git cannot list. "empty" when it lists no commit, null when it can
 * be scanned. */
function rangeProblem(root: string, ref: PushedRef, range: string): GateOutcome | "empty" | null {
  if (remoteTipMissing(root, ref)) {
    return fail("secrets", `${ref.remoteRef} is at a commit this clone never fetched`, [
      "Run git fetch, then push again: the pushed commits cannot be scanned without the remote tip.",
    ]);
  }
  const count = commitCount(root, range);
  if (count === null) {
    return fail("secrets", `git cannot list the commits pushed to ${ref.remoteRef}`, [
      `Run git rev-list ${range} by hand and fix what it reports.`,
    ]);
  }
  return count === 0 ? "empty" : null;
}

/** The hits gitleaks reports over the commits one pushed ref adds, or the block when the range
 * cannot be scanned. A run that fails without a report is a run that never scanned. */
function scanPushedRef(root: string, config: string, ref: PushedRef): GateOutcome | string[] {
  const range = pushedRange(ref);
  if (range === null) {
    return [];
  }
  const problem = rangeProblem(root, ref, range);
  if (problem === "empty") {
    return [];
  }
  if (problem !== null) {
    return problem;
  }
  const result = runOrMissing(
    "gitleaks",
    [
      "git",
      `--log-opts=${range}`,
      "--config",
      config,
      "--no-banner",
      "--redact",
      "--report-format",
      "json",
      "--report-path",
      "-",
    ],
    root,
  );
  if ("missing" in result) {
    return fail("secrets", "gitleaks is not installed", [
      "Install: https://github.com/gitleaks/gitleaks, or your package manager",
    ]);
  }
  const found = findingsOf(result.stdout);
  if (result.status !== 0 && found.length === 0) {
    return fail("secrets", `gitleaks could not scan ${ref.localRef}`, [
      `Run gitleaks git --log-opts="${range}" --config ${config} --redact by hand and fix what it reports.`,
    ]);
  }
  return found.map(
    (hit) => `rule ${hit.rule} hit in ${hit.file}:${hit.line} (commit ${hit.commit})`,
  );
}

/** The commits each pushed ref adds, scanned redacted with the repo config: a hit names rule, file,
 * line and commit, never the value. */
function pushedSecretsGate(root: string, config: string, pushLines?: string): GateOutcome {
  if (pushLines === undefined) {
    return fail("secrets", "this gate needs git's pushed refs and none were handed to it", [
      "Reached through something other than the installed pre-push hook.",
    ]);
  }
  const hits: string[] = [];
  for (const ref of parsePushLines(pushLines)) {
    const scanned = scanPushedRef(root, config, ref);
    if (!Array.isArray(scanned)) {
      return scanned;
    }
    hits.push(...scanned);
  }
  if (hits.length === 0) {
    return pass("secrets");
  }
  return fail("secrets", "pushed commits carry a secret", [
    ...hits,
    "Rewrite the commits without the secret, and rotate it if it ever left this machine. If it is a false positive, add a tighter regex to .gitleaks.toml [allowlist].",
  ]);
}

const gateName = "secrets";
const notSetUp = "content denylist is not set up here (skill: qsm-secrets:content-denylist)";

/** The machine-local content denylist: a second gitleaks run, redacted, that names the rules
 * hit and never the patterns. Absent file: the gate still passes, with a note. */
function denylistGate(root: string): GateOutcome {
  const denylist = contentDenylistPath(process.env);
  if (!existsSync(denylist)) {
    return pass(gateName, notSetUp);
  }
  const result = runOrMissing(
    "gitleaks",
    [
      "git",
      "--staged",
      "--config",
      denylist,
      "--no-banner",
      "--redact",
      "--report-format",
      "json",
      "--report-path",
      "-",
    ],
    root,
  );
  if ("missing" in result || (result.status !== 0 && result.stdout.trim() === "")) {
    return fail("secrets", "the content denylist could not run", [
      `Run gitleaks with ${denylist} by hand and fix what it reports.`,
    ]);
  }
  if (result.status === 0) {
    return pass("secrets");
  }
  const hits = findingsOf(result.stdout);
  return fail("secrets", "staged changes match the content denylist", [
    ...hits.map((hit) => `rule ${hit.rule} hit in ${hit.file}:${hit.line}`),
    `Remove the content. The rules live in ${denylist}; a rule that is wrong is edited there.`,
  ]);
}

function findingsOf(json: string): { rule: string; file: string; line: number; commit: string }[] {
  try {
    const parsed = recordsOf(JSON.parse(json));
    return (parsed ?? []).map((f) => ({
      rule: String(f.RuleID),
      file: String(f.File),
      line: Number(f.StartLine),
      commit: typeof f.Commit === "string" ? f.Commit.slice(0, 8) : "",
    }));
  } catch {
    return [];
  }
}

function entropyGate(root: string): GateOutcome {
  const config = ".secrets.baseline";
  if (!existsSync(join(root, config))) {
    return fail("entropy", `${config} is not in this repo, so entropy cannot run`, [
      `Create ${config}, or remove 'entropy' from .qsm-langdev/gates.json.`,
    ]);
  }
  if (isDirty(root, config)) {
    return fail("entropy", `${config} has unstaged changes, so detect-secrets-hook will not run`, [
      `Stage it: git add ${config}`,
    ]);
  }
  const staged = stagedPaths(root);
  if (staged === null) {
    return fail("entropy", "git could not report the staged file list", [
      "Run `git diff --cached --name-only` here and fix what it reports.",
    ]);
  }
  if (staged.length === 0) {
    return skip("entropy", "nothing staged");
  }
  const result = runOrMissing("detect-secrets-hook", ["--baseline", config, ...staged], root);
  if ("missing" in result) {
    return fail("entropy", "detect-secrets-hook is not installed", [
      "uv tool install detect-secrets",
    ]);
  }
  if (result.status !== 0) {
    return fail("entropy", "staged changes carry a new high-entropy string", [
      "detect-secrets scan --baseline .secrets.baseline",
      "detect-secrets audit .secrets.baseline",
    ]);
  }
  return pass("entropy");
}

function describeVerdicts(verdicts: readonly Verdict[]): string[] {
  return verdicts.flatMap((v) => [headline(v), ...(v.lines ?? [])]);
}

/** The langdev gate over one run's verdicts: failed when a checker is worse,
 * a binary or a config missing included; blocked when a checker was not
 * measured, naming it and the retry; else passed with the set sizes. */
export function langdevOutcome(verdicts: readonly Verdict[], sizes: string): GateOutcome {
  const { code, deciding } = runOutcome(verdicts, true);
  if (code === "ok") {
    return pass("langdev", sizes);
  }
  const remedy = [sizes, ...describeVerdicts(deciding)];
  const measured = deciding.every((v) => v.missing !== true && v.missingConfig !== true)
    ? true
    : undefined;
  return code === "worse"
    ? fail("langdev", `${deciding.length} checker(s) worse`, remedy, measured)
    : {
        gate: "langdev",
        status: "blocked",
        reason: `${deciding.length} checker(s) not measured`,
        remedy,
      };
}

/** What a hook run comes to: a failed gate over a blocked one over ok. */
export function gatesCode(outcomes: readonly GateOutcome[]): "ok" | "failed" | "blocked" {
  if (outcomes.some((o) => o.status === "failed")) {
    return "failed";
  }
  return outcomes.some((o) => o.status === "blocked") ? "blocked" : "ok";
}

async function langdevAt(
  root: string,
  before: string | null,
  after: string,
  point: EnforcementPoint,
): Promise<GateOutcome> {
  const { languages } = readGatesConfig(root);
  const { sets, verdicts, store, warnings } = await compareTrees(root, before, after, {
    at: point,
    languages,
  });
  // The store's total only: the per-checker lines are `qsm-langdev check`'s.
  const total = describeStore(store).at(-1);
  const notes = [total, ...warnings].join("; ");
  return langdevOutcome(verdicts, `file sets: ${describeSets(sets)}; ${notes}`);
}

async function langdevGate(
  root: string,
  point: EnforcementPoint,
  pushLines?: string,
): Promise<GateOutcome> {
  if (point === "pre-commit") {
    const skipped = fixStaged(root);
    return withSkipped(await langdevAt(root, resolveRef(root, "HEAD"), "worktree", point), skipped);
  }
  if (pushLines === undefined) {
    return fail("langdev", "this gate needs git's pushed refs and none were handed to it", [
      "Reached through something other than the installed pre-push hook.",
    ]);
  }
  let blocked: GateOutcome | undefined;
  for (const ref of parsePushLines(pushLines)) {
    const before = pushReference(root, ref);
    if (before === null) {
      continue;
    }
    const outcome = await langdevAt(root, before, ref.localOid, point);
    if (outcome.status === "failed") {
      return outcome;
    }
    blocked ??= outcome.status === "blocked" ? outcome : undefined;
  }
  return blocked ?? pass("langdev");
}

/** The one verdict from lib/structure.ts, mapped onto a gate outcome. */
function structureOutcome(result: StructureResult): GateOutcome {
  if (result.status === "not-scored" && result.install === undefined) {
    return skip("structure", `${result.reason} — not scored`);
  }
  const { pass: ok, summary, detail } = verdict(result);
  if (ok) {
    return pass("structure", summary);
  }
  const remedy = [...detail, "`qsm-langdev structure` re-runs this comparison."];
  return fail("structure", summary, remedy, result.status === "scored" || undefined);
}

async function structureAt(root: string, before: string, after: string): Promise<GateOutcome> {
  return structureOutcome(await compareStructure(root, before, after));
}

async function structureGate(
  root: string,
  point: EnforcementPoint,
  pushLines?: string,
): Promise<GateOutcome> {
  if (point === "pre-commit") {
    const head = resolveRef(root, "HEAD");
    return head === null ? pass("structure") : structureAt(root, head, "worktree");
  }
  if (pushLines === undefined) {
    return fail("structure", "this gate needs git's pushed refs and none were handed to it", [
      "Reached through something other than the installed pre-push hook.",
    ]);
  }
  for (const ref of parsePushLines(pushLines)) {
    const before = pushReference(root, ref);
    if (before === null) {
      continue;
    }
    const outcome = await structureAt(root, before, ref.localOid);
    if (outcome.status === "failed") {
      return outcome;
    }
  }
  return pass("structure");
}

const KNOWN_GATES = ["secrets", "entropy", "langdev", "structure"] as const;

/** The gates this tool answers for on its own. */
export const SELF_GATES: readonly string[] = ["langdev", "structure"];

async function runGate(
  name: string,
  root: string,
  point: EnforcementPoint,
  pushLines?: string,
): Promise<GateOutcome> {
  switch (name) {
    case "secrets":
      return secretsGate(root, point, pushLines);
    case "entropy":
      return entropyGate(root);
    case "langdev":
      return langdevGate(root, point, pushLines);
    case "structure":
      return structureGate(root, point, pushLines);
    default:
      return fail(name, `unknown gate '${name}' in .qsm-langdev/gates.json`, [
        `Remove it, or name one of: ${KNOWN_GATES.join(", ")}.`,
      ]);
  }
}

/**
 * The gates whose measured regression QSM_LANGDEV_ALLOW lets pass for one run; the leak gates
 * never carry the flag.
 */
export function allowed(outcome: GateOutcome, reason?: string): GateOutcome {
  if (
    reason === undefined ||
    reason === "" ||
    outcome.status !== "failed" ||
    outcome.regression !== true
  ) {
    return outcome;
  }
  return pass(
    outcome.gate,
    [`${outcome.reason}, allowed once: ${reason}`, ...outcome.remedy].join("\n  "),
  );
}

export async function runGates(
  root: string,
  point: EnforcementPoint,
  names: readonly string[],
  { pushLines, allow }: { pushLines?: string | undefined; allow?: string | undefined } = {},
): Promise<GateOutcome[]> {
  const outcomes: GateOutcome[] = [];
  for (const name of names) {
    outcomes.push(allowed(await runGate(name, root, point, pushLines), allow));
  }
  return outcomes;
}
