#!/usr/bin/env bun

// qsm-langdev: per-language quality checks over one declarative registry.

import { readFileSync } from "node:fs";
import {
  type Call,
  flagArg,
  type Handler,
  optionalString,
  runCli,
  stringList,
} from "../../../lib/cli-base.ts";
import { fail, type Outcome, type OutcomeCode, ok } from "../../../lib/outcome.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import {
  compareTrees,
  type DoctorRow,
  doctorRows,
  headline,
  printRunLines,
  runOutcome,
  type StructuralCheckerStatus,
  structuralCheckerStatus,
  type Verdict,
} from "../lib/compare.ts";
import {
  alwaysOn,
  detectLanguages,
  findRepoRoot,
  type GatesConfig,
  isLangdevRepo,
  languageEnabled,
  readGatesConfig,
  writeGatesConfig,
} from "../lib/config.ts";
import { editFindings } from "../lib/edit-findings.ts";
import { type GateOutcome, gatesCode, runGates, SELF_GATES } from "../lib/gate-runner.ts";
import {
  HOOK_LANGS,
  HOOK_NAMES,
  type HookAction,
  type HookName,
  installHooks,
  uninstallHooks,
} from "../lib/git-hooks.ts";
import { resolveRef } from "../lib/gitref.ts";
import { errorMessage } from "../lib/json.ts";
import { profileGaps, type ScaffoldAction, scaffoldProfile } from "../lib/profiles.ts";
import {
  ENFORCEMENT_POINTS,
  LANGUAGES,
  type Language,
  REGISTRY,
  registryGaps,
  resolveLanguage,
} from "../lib/registry.ts";
import { semgrepLogin, semgrepLoginWarning } from "../lib/semgrep-login.ts";
import { type Editor, editedTrees, MAIN_AGENT, readStartPoint } from "../lib/state.ts";
import {
  compareWorktreeSince,
  type StructureResult,
  type StructureVerdict,
  verdict,
} from "../lib/structure.ts";
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = parseManifest(manifestJson);

function err(line: string): void {
  process.stderr.write(`${line}\n`);
}

/** A refusal raised from deep inside a verb's helpers. */
class Refuse extends Error {
  readonly outcome: Outcome;
  constructor(outcome: Outcome) {
    super(outcome.message ?? "");
    this.outcome = outcome;
  }
}

function refuse(code: Exclude<OutcomeCode, "ok">, message: string): never {
  throw new Refuse(fail(code, message));
}

function guarded(handler: Handler): Handler {
  return async (call) => {
    try {
      return await handler(call);
    } catch (error) {
      if (error instanceof Refuse) {
        return error.outcome;
      }
      throw error;
    }
  };
}

/** The argument when it is one of `values`, undefined when it was not given. */
function optOneOf<T extends string>(call: Call, name: string, values: readonly T[]): T | undefined {
  const value = optionalString(call, name);
  if (value === undefined) {
    return undefined;
  }
  const match = values.find((candidate) => candidate === value);
  return match ?? refuse("usage", `${name} must be one of ${values.join(", ")}`);
}

function required<T>(value: T | undefined, name: string): T {
  return value ?? refuse("usage", `${name} is required`);
}

function requireRepo(target: string): string {
  const root = findRepoRoot(target);
  if (root === null) {
    refuse("missing", `${target} is not inside a git repository`);
  }
  return root;
}

function parseLanguages(csv: string): Language[] {
  const named = csv.split(",").filter((f) => f.length > 0);
  const resolved = named.map((f) => resolveLanguage(f));
  const unknown = named.filter((_, i) => resolved[i] === null);
  if (unknown.length > 0) {
    refuse("usage", `unknown language: ${unknown.join(", ")} (known: ${LANGUAGES.join(", ")})`);
  }
  return [...new Set(resolved.filter((language): language is Language => language !== null))];
}

const dirOf = (call: Call): string => optionalString(call, "dir") ?? ".";

function printVerdicts(verdicts: readonly Verdict[], changedCount: number): void {
  if (verdicts.length === 0) {
    err(
      changedCount === 0
        ? "[qsm-langdev] nothing differs between the two sides: no checker ran"
        : `[qsm-langdev] ${changedCount} changed file(s), none of a type a selected checker covers: no checker ran`,
    );
    return;
  }
  for (const one of verdicts) {
    err(`  ${headline(one)}`);
    for (const line of one.lines ?? []) {
      err(`    ${line}`);
    }
  }
}

/**
 * `against` resolved to a commit id, or null when the tree has no previous commit yet — the
 * caller's own default, "HEAD".
 */
function resolveAgainst(root: string, against: string, explicit: boolean): string | null {
  const beforeRef = resolveRef(root, against);
  if (beforeRef === null && explicit) {
    refuse("usage", `unknown commit '${against}'`);
  }
  return beforeRef;
}

const check: Handler = guarded(async (call) => {
  const at = optOneOf(call, "at", ENFORCEMENT_POINTS) ?? "pre-commit";
  const root = requireRepo(dirOf(call));
  if (!isLangdevRepo(root)) {
    refuse("missing", `qsm-langdev is not set up in ${root}: run qsm-langdev init`);
  }
  const config = readGatesConfig(root);
  const named = optionalString(call, "against");
  const against = named ?? "HEAD";
  const beforeRef = resolveAgainst(root, against, named !== undefined);
  const lang = optionalString(call, "lang");

  const { changed, sets, verdicts, store, warnings } = await compareTrees(
    root,
    beforeRef,
    "worktree",
    {
      at,
      languages: lang === undefined ? config.languages : parseLanguages(lang),
      allFindings: flagArg(call, "allFindings"),
      given: stringList(call, "path"),
    },
  );

  if (beforeRef === null) {
    err("[qsm-langdev] no previous commit: the tree is new. Starting point:");
  }
  printRunLines(sets, warnings, store);
  printVerdicts(verdicts, changed.length);
  const data = {
    reference: { against, resolved: beforeRef },
    changed: changed.length,
    sets,
    store,
    verdicts,
    warnings,
  };
  const { code, deciding } = runOutcome(verdicts, beforeRef !== null);
  return code === "ok" ? ok(data) : fail(code, deciding.map((v) => v.summary).join("; "), data);
});

const list: Handler = () => {
  const rows = REGISTRY.map((spec) => ({
    name: spec.name,
    measures: spec.measures,
    language: spec.language,
    runsAt: spec.runsAt,
    extensions: spec.extensions,
    ...(spec.names ? { names: spec.names.source } : {}),
    binary: spec.binary,
    install: spec.install,
    ...(spec.thresholds ? { thresholds: spec.thresholds } : {}),
  }));
  const covers = (row: (typeof rows)[number]) =>
    [...row.extensions, ...(row.names === undefined ? [] : [row.names])].join(",");
  const text = rows
    .map((row) => [row.name, row.language, row.runsAt, covers(row)].join("\t"))
    .join("\n");
  return ok(rows, text);
};

function describeCheckRow(row: DoctorRow): string {
  return row.present
    ? `ok       ${row.check} (${row.binary})`
    : `MISSING  ${row.check} (${row.binary}) — install: ${row.install}`;
}

function describeStructuralCheck(structural: StructuralCheckerStatus): string {
  if (structural.patched) {
    return "ok       structural checker (sentrux, qsm-patched)";
  }
  if (structural.present) {
    return (
      "MISSING  structural checker (sentrux on PATH is unpatched upstream, not ready) — install: " +
      "bun plugins/qsm-langdev/scripts/build-sentrux.ts install"
    );
  }
  return (
    "MISSING  structural checker (sentrux not on PATH) — install: " +
    "bun plugins/qsm-langdev/scripts/build-sentrux.ts install"
  );
}

const doctor: Handler = guarded(async (call) => {
  const target = dirOf(call);
  const root = requireRepo(target);
  const config = readGatesConfig(root);
  const specs = REGISTRY.filter((spec) => languageEnabled(spec.language, config.languages));
  const rows = await doctorRows(specs);
  const gaps = [...registryGaps(), ...profileGaps()];
  const structural = await structuralCheckerStatus();
  const text = [...rows.map(describeCheckRow), describeStructuralCheck(structural)].join("\n");
  const warnings = gaps.map((gap) => `registry or profile gap: ${gap}`);
  // an absent semgrep is its MISSING row above, never a login question
  const semgrep = rows.some((row) => row.binary === "semgrep" && row.present);
  const login = semgrep ? semgrepLoginWarning(semgrepLogin()) : null;
  if (login !== null) {
    warnings.push(login);
  }
  const data = { checks: rows, gaps, structural };
  // a gate binary that is absent fails the hook, so it is the verdict, not a row
  const gone = rows.some((row) => !row.present) || !structural.patched;
  return { ...(gone ? fail("missing", text, data) : ok(data, text)), warnings };
});

const LANGUAGES_ACTIONS = ["list", "add", "remove"] as const;
type LanguagesAction = (typeof LANGUAGES_ACTIONS)[number];

/** `config.languages` after applying `action` on `name`; writes the config back when it changed. */
function applyLanguagesEdit(
  root: string,
  config: GatesConfig,
  action: LanguagesAction,
  name: string | undefined,
): Language[] {
  if (action === "list") {
    return config.languages;
  }
  const one = name === undefined ? null : resolveLanguage(name);
  if (one === null) {
    refuse("usage", `unknown language '${name ?? ""}' (known: ${LANGUAGES.join(", ")})`);
  }
  const selected =
    action === "add"
      ? [...new Set([...config.languages, one])]
      : config.languages.filter((language) => language !== one);
  writeGatesConfig(root, { ...config, languages: selected });
  return selected;
}

const languages: Handler = guarded((call) => {
  const action = optOneOf(call, "action", LANGUAGES_ACTIONS) ?? "list";
  const root = requireRepo(".");
  const config = readGatesConfig(root);
  const selected = applyLanguagesEdit(root, config, action, optionalString(call, "name"));
  const text =
    selected.length === 0
      ? "(none — tree-derived mode: every language with matching files runs)"
      : selected.join("\n");
  return ok({ languages: selected }, text);
});

/** One scaffold action as the words the reader acts on. */
function describeScaffold(action: ScaffoldAction): string {
  if (action.status === "stale") {
    return `kept, but it is the '${action.from}' profile's file verbatim — delete it and re-run init to take this profile's`;
  }
  return `${action.status}${action.status === "kept" ? " (yours)" : ""}`;
}

/** `--target ts=browser`, repeatable, as the map gates.json records. */
function parseTargets(raw: readonly string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const pair of raw) {
    const sep = pair.indexOf("=");
    if (sep < 1) {
      refuse(
        "usage",
        `--target takes <language>=<target>, e.g. --target ts=browser (got '${pair}')`,
      );
    }
    parsed[pair.slice(0, sep)] = pair.slice(sep + 1);
  }
  return parsed;
}

/** The profile's config files written into `root`, each reported as it lands. */
function seedProfile(
  root: string,
  profile: string,
  detected: readonly Language[],
  targets: Readonly<Record<string, string>>,
): ReturnType<typeof scaffoldProfile> {
  let actions: ReturnType<typeof scaffoldProfile>;
  try {
    actions = scaffoldProfile(root, profile, detected, targets);
  } catch (error) {
    refuse("usage", errorMessage(error));
  }
  for (const action of actions) {
    err(`  ${action.file}: ${describeScaffold(action)}`);
  }
  return actions;
}

/** The recorded gate selection, or this tool's own gates when it names none at either point. */
function seedGates(hooks: GatesConfig["hooks"]): GatesConfig["hooks"] {
  const named = hooks["pre-commit"].length + hooks["pre-push"].length;
  if (named > 0) {
    return hooks;
  }
  err(`[qsm-langdev] no gates were selected, so both hooks take: ${SELF_GATES.join(", ")}`);
  return { "pre-commit": [...SELF_GATES], "pre-push": [...SELF_GATES] };
}

/** The recorded languages plus every detected one they do not name. */
function widenLanguages(
  recorded: readonly Language[],
  detected: readonly Language[],
): { languages: Language[]; added: Language[] } {
  const added = detected.filter((language) => !(recorded.includes(language) || alwaysOn(language)));
  return { languages: [...recorded, ...added], added };
}

const init: Handler = guarded((call) => {
  const root = requireRepo(dirOf(call));
  const detected = detectLanguages(root);
  if (detected === null) {
    refuse("failed", `git could not list the files of ${root}`);
  }
  err(`[qsm-langdev] detected: ${detected.join(", ")}`);
  const config = readGatesConfig(root);
  const profile = optionalString(call, "profile") ?? config.profile ?? "general";
  const targets = { ...config.targets, ...parseTargets(stringList(call, "target")) };
  const actions = seedProfile(root, profile, detected, targets);
  const { languages: widened, added } = widenLanguages(config.languages, detected);
  const hooks = seedGates(config.hooks);
  const recorded = Object.keys(targets).length > 0 ? { targets } : {};
  writeGatesConfig(root, { ...config, ...recorded, hooks, languages: widened, profile });
  if (added.length > 0) {
    err(`[qsm-langdev] languages gained: ${added.join(", ")}`);
  }
  err(`[qsm-langdev] profile '${profile}' recorded in ${root}/.qsm-langdev/gates.json`);
  return ok({ profile, languages: widened, added, actions });
});

interface StructureTree {
  root: string;
  start: string;
}

/**
 * The commit `structure` compares against with no `--against`: the agent's own start point in this
 * tree when `--session` names one, else HEAD.
 */
function namedCommit(
  root: string,
  against: string | undefined,
  session: string | undefined,
  agent: string | undefined,
): string {
  if (against !== undefined) {
    return against;
  }
  if (session === undefined) {
    return "HEAD";
  }
  const editor: Editor = { sessionId: session, agentId: agent ?? MAIN_AGENT };
  const start = readStartPoint(editor, root);
  if (start !== null) {
    return start;
  }
  err(
    `[qsm-langdev] no start point for agent ${editor.agentId} of session ${session} in this tree` +
      " — comparing against HEAD. Commits the session already made here are not judged.",
  );
  return "HEAD";
}

/** The trees to judge: the single tree at `path` (or `.`), or, given
 * `--session`/`--agent` and no path, every tree that agent edited. */
function structureTreesToJudge(
  target: string | undefined,
  values: { against?: string; session?: string; agent?: string },
): StructureTree[] {
  if (target !== undefined || values.agent === undefined) {
    const root = requireRepo(target ?? ".");
    const named = namedCommit(root, values.against, values.session, values.agent);
    const start = resolveRef(root, named);
    if (start === null) {
      refuse("usage", `unknown commit '${named}'`);
    }
    return [{ root, start }];
  }
  if (values.session === undefined) {
    refuse("usage", "--agent names an agent of a session; pass --session too");
  }
  return editedTrees({ sessionId: values.session, agentId: values.agent });
}

/** The first failing tree's verdict, else the last tree's, else the
 * report of an agent that edited nothing. */
async function structureJudgeAll(trees: StructureTree[]): Promise<
  StructureVerdict & {
    tree: StructureTree | null;
    result: StructureResult | null;
  }
> {
  let last: (StructureVerdict & { tree: StructureTree; result: StructureResult }) | null = null;
  for (const tree of trees) {
    const result = await compareWorktreeSince(tree.root, tree.start);
    last = { tree, result, ...verdict(result) };
    if (!last.pass) {
      return last;
    }
  }
  return (
    last ?? {
      tree: null,
      result: null,
      pass: true,
      summary: "agent edited no tree in this session; nothing to score",
      detail: [],
    }
  );
}

const structure: Handler = guarded(async (call) => {
  const against = optionalString(call, "against");
  const session = optionalString(call, "session");
  const agent = optionalString(call, "agent");
  if (against !== undefined && session !== undefined) {
    return fail(
      "usage",
      "--against and --session both name the commit to compare against; pass one",
    );
  }
  const trees = structureTreesToJudge(optionalString(call, "path"), {
    ...(against === undefined ? {} : { against }),
    ...(session === undefined ? {} : { session }),
    ...(agent === undefined ? {} : { agent }),
  });
  const report = await structureJudgeAll(trees);
  err(`  ${report.summary}`);
  for (const line of report.detail) {
    err(`  ${line}`);
  }
  const data = {
    root: report.tree?.root ?? null,
    against: report.tree?.start ?? null,
    pass: report.pass,
    summary: report.summary,
    detail: report.detail,
    result: report.result,
  };
  return report.pass ? ok(data) : fail("worse", report.summary, data);
});

/** One installed-hook action as the line it prints, or nothing for a kind
 * `installGitHooks` doesn't report (uninstall-only kinds). */
function describeInstallAction(action: HookAction): string | null {
  switch (action.kind) {
    case "written":
      return `installed ${action.path}`;
    case "already":
      return `already installed ${action.path}`;
    case "appended":
      return (
        `added our gate to your existing ${action.path}\n` +
        `  Your original is at ${action.backup}\n` +
        "  Our line runs last. If your hook exits before the end, the gate will not run."
      );
    case "manual":
      return (
        `${action.path} was NOT touched — ${action.why}.\n` +
        `  Add this line to it yourself:\n    ${action.line}`
      );
    case "absent":
    case "removed":
    case "unappended":
      break;
  }
  return null;
}

const installGitHooks: Handler = guarded((call) => {
  const lang = optOneOf(call, "lang", HOOK_LANGS) ?? "sh";
  const root = requireRepo(dirOf(call));
  const actions = installHooks(root, HOOK_NAMES, lang);
  const config = readGatesConfig(root);
  const lines = [
    ...actions.map(describeInstallAction).filter((line): line is string => line !== null),
    ...HOOK_NAMES.map((name) => `${name}: ${config.hooks[name].join(", ") || "(none configured)"}`),
    "A missing gate binary or config fails the hook. Change the selection in " +
      `${root}/.qsm-langdev/gates.json`,
  ];
  return ok({ root, lang, actions, hooks: config.hooks }, lines.join("\n"));
});

function describeUninstallAction(action: HookAction): string {
  if (action.kind === "removed") {
    return `removed ${action.path}`;
  }
  if (action.kind === "unappended") {
    return `took our gate back out of ${action.path}; the rest is untouched`;
  }
  if (action.kind === "manual") {
    return (
      `${action.path} was NOT touched — ${action.why}.\n` +
      `  Delete this line from it yourself:\n    ${action.line}`
    );
  }
  return `nothing installed at ${action.path}`;
}

const uninstallGitHooks: Handler = guarded((call) => {
  const root = requireRepo(dirOf(call));
  const actions = uninstallHooks(root);
  return ok({ root, actions }, actions.map(describeUninstallAction).join("\n"));
});

/** Git's pre-push payload, read once and handed to every gate that wants it. */
function pushedRefs(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function reportGateOutcomes(name: HookName, outcomes: readonly GateOutcome[]): void {
  for (const outcome of outcomes) {
    if (outcome.status === "pass") {
      err(`[${name}] ${outcome.gate}: ${outcome.note ?? "ok"}`);
    } else if (outcome.status === "skipped") {
      err(`[${name}] ${outcome.gate}: skipped — ${outcome.reason}`);
    } else {
      err(`\n[${name}] BLOCKED by ${outcome.gate}: ${outcome.reason}`);
      for (const line of outcome.remedy) {
        err(`  ${line}`);
      }
    }
  }
  if (gatesCode(outcomes) === "ok") {
    return;
  }
  if (outcomes.some((outcome) => outcome.status === "failed" && outcome.regression === true)) {
    const verb = name === "pre-push" ? "push" : "commit";
    err(`  To let this regression pass once: QSM_LANGDEV_ALLOW="<why>" git ${verb} ...`);
  }
}

const hook: Handler = guarded(async (call) => {
  const name = required(optOneOf(call, "name", HOOK_NAMES), "name");
  const root = requireRepo(".");
  if (!isLangdevRepo(root)) {
    return ok({ hook: name, root, outcomes: [] });
  }
  const config = readGatesConfig(root);
  const outcomes = await runGates(root, name, config.hooks[name], {
    pushLines: name === "pre-push" ? pushedRefs() : undefined,
    allow: process.env.QSM_LANGDEV_ALLOW?.trim(),
  });
  reportGateOutcomes(name, outcomes);
  const code = gatesCode(outcomes);
  const data = { hook: name, root, outcomes };
  if (code === "ok") {
    return ok(data);
  }
  const deciding = outcomes.filter((outcome) => outcome.status === code);
  return fail(code, deciding.map((outcome) => outcome.gate).join(", "), data);
});

const edited: Handler = guarded(async (call) => {
  const editor: Editor = {
    sessionId: required(optionalString(call, "session"), "session"),
    agentId: optionalString(call, "agent") ?? MAIN_AGENT,
  };
  const text = await editFindings(editor, required(optionalString(call, "file"), "file"));
  return ok({ text }, text ?? "");
});

if (import.meta.main) {
  process.exit(
    await runCli(manifest, "qsm-langdev", {
      check,
      list,
      doctor,
      languages,
      init,
      structure,
      install: installGitHooks,
      uninstall: uninstallGitHooks,
      hook,
      edited,
    }),
  );
}
