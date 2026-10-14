#!/usr/bin/env bun
// The always-loaded instructions every agent on this machine reads: the CLAUDE.md block, the two
// rules, and the output style, written into the user's Claude home by choice.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  type Activation,
  type ActivationContext,
  type ActivationState,
  activationMain,
  type InstallResult,
  type Step,
} from "../../../lib/install-contract.ts";
import { isRecord } from "../lib/json.ts";

const NAME = "instructions";
const SRC = resolve(import.meta.dir, "../instructions");
const BEGIN = "<!-- qsm-setup-begin -->";
const END = "<!-- qsm-setup-end -->";
/** The block qsm-essentials wrote before setup owned the instructions; removed before writing. */
const OLD_BEGIN = "<!-- qsm-essentials-begin -->";
const OLD_END = "<!-- qsm-essentials-end -->";
const STYLE = "qsm";

function claudeHome(env: ActivationContext["env"]): string {
  return env.CLAUDE_CONFIG_DIR ?? resolve(env.HOME ?? homedir(), ".claude");
}

const INSTRUCTIONS_CHOICES = ["replace", "overwrite", "skip"] as const;
export type InstructionsChoice = (typeof INSTRUCTIONS_CHOICES)[number];

function isInstructionsChoice(s: string | undefined): s is InstructionsChoice {
  return INSTRUCTIONS_CHOICES.some((c) => c === s);
}

/** CLAUDE.md without the older qsm-essentials block, or unchanged when it has none. */
function withoutOldBlock(text: string): string {
  const start = text.indexOf(OLD_BEGIN);
  const end = text.indexOf(OLD_END);
  if (start === -1 || end < start) {
    return text;
  }
  return (text.slice(0, start) + text.slice(end + OLD_END.length).replace(/^\n/, "")).replace(
    /\n{3,}/g,
    "\n\n",
  );
}

/** The CLAUDE.md content for a choice, or null for skip. */
export function mergeBlock(
  current: string | null,
  block: string,
  choice: InstructionsChoice,
): string | null {
  if (choice === "skip") {
    return null;
  }
  const existing = current === null ? null : withoutOldBlock(current);
  const managed = `${BEGIN}\n${block.trimEnd()}\n${END}\n`;
  if (choice === "overwrite" || existing === null || existing.trim() === "") {
    return managed;
  }
  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);
  if (start !== -1 && end > start) {
    return existing.slice(0, start) + managed + existing.slice(end + END.length).replace(/^\n/, "");
  }
  return `${existing.trimEnd()}\n\n${managed}`;
}

/** settings.json with outputStyle set. Everything else untouched. */
export function selectStyle(existing: string | null): string {
  const parsed: unknown = existing !== null && existing !== "" ? JSON.parse(existing) : {};
  if (!isRecord(parsed)) {
    throw new Error("settings.json is not a JSON object");
  }
  const settings = parsed;
  settings.outputStyle = STYLE;
  return `${JSON.stringify(settings, null, 2)}\n`;
}

interface Target {
  readonly path: string;
  readonly content: string;
}

function targets(home: string, choice: InstructionsChoice): Target[] {
  const read = (rel: string) => readFileSync(resolve(SRC, rel), "utf8");
  const existing = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);
  const claudeMd = resolve(home, "CLAUDE.md");
  const settings = resolve(home, "settings.json");
  const merged = mergeBlock(existing(claudeMd), read("CLAUDE.md"), choice);
  return [
    ...(merged === null ? [] : [{ path: claudeMd, content: merged }]),
    { path: resolve(home, "rules/implementation.md"), content: read("rules/implementation.md") },
    { path: resolve(home, "rules/context.md"), content: read("rules/context.md") },
    { path: resolve(home, "rules/git.md"), content: read("rules/git.md") },
    { path: resolve(home, "output-styles/qsm.md"), content: read("output-styles/qsm.md") },
    { path: settings, content: selectStyle(existing(settings)) },
  ];
}

/** What the Claude home never keeps in history: secrets, caches, logs, and per-session state. */
const GITIGNORE = `.credentials.json *.bak *.lock *.log .last-* history.jsonl stats-cache.json
*-cache.json policy-limits*.json remote-settings.json daemon* projects/ file-history/ session-env/
shell-snapshots/ sessions/ debug/ paste-cache/ cache/ backups/ chrome/ jobs/ state/ tasks/ teams/
feedback/ security/ usage-data/ cc-review-memory/ plugins/cache/ plugins/marketplaces/
plugins/repos/ plugins/data/`.split(/\s+/);

const GIT_BEFORE = "git-before";
const GIT_AFTER = "git-after";

/** Runs git in the Claude home, without the GIT_* variables of whatever repository called us. */
function git(home: string, env: ActivationContext["env"], args: string[]): string {
  const clean = Object.fromEntries(
    Object.entries({ ...process.env, ...env }).filter(
      ([k]) => !k.startsWith("GIT_") || k.startsWith("GIT_AUTHOR") || k.startsWith("GIT_COMMITTER"),
    ),
  );
  const run = spawnSync("git", args, { cwd: home, env: clean, encoding: "utf8" });
  if (run.error || run.status !== 0) {
    const cause = run.error?.message ?? (run.stderr.trim() || `exit ${run.status}`);
    throw new Error(`git ${args.join(" ")}: ${cause}`);
  }
  return run.stdout;
}

/** The .gitignore with the lines it lacks appended; the person's own lines stay. */
function completedGitignore(current: string | null): string | null {
  const have = new Set((current ?? "").split("\n").map((l) => l.trim()));
  const missing = GITIGNORE.filter((l) => !have.has(l));
  if (missing.length === 0) {
    return null;
  }
  const kept = current === null || current === "" ? "" : `${current.replace(/\n*$/, "")}\n`;
  return `${kept}${missing.join("\n")}\n`;
}

function failed(name: string, e: unknown): Step {
  return { name, status: "error", detail: e instanceof Error ? e.message : String(e) };
}

/** First step: the Claude home is a local repository with its .gitignore and a clean tree. */
export function gitBeforeStep(ctx: ActivationContext): Step {
  const home = claudeHome(ctx.env);
  const ignorePath = resolve(home, ".gitignore");
  const isRepo = existsSync(resolve(home, ".git"));
  const ignore = completedGitignore(
    existsSync(ignorePath) ? readFileSync(ignorePath, "utf8") : null,
  );
  try {
    if (ctx.dryRun) {
      const plan = [
        ...(isRepo ? [] : ["git init"]),
        ...(ignore === null ? [] : ["complete .gitignore"]),
        "commit anything uncommitted as 'before qsm-setup activate'",
      ];
      return { name: GIT_BEFORE, status: "skipped", detail: `would ${plan.join(", ")} in ${home}` };
    }
    mkdirSync(home, { recursive: true });
    if (!isRepo) {
      git(home, ctx.env, ["init", "--quiet"]);
    }
    if (ignore !== null) {
      writeFileSync(ignorePath, ignore);
    }
    if (git(home, ctx.env, ["status", "--porcelain"]).trim() === "") {
      return {
        name: GIT_BEFORE,
        status: "already",
        detail: `${home} is a repository with nothing uncommitted`,
      };
    }
    git(home, ctx.env, ["add", "-A"]);
    git(home, ctx.env, ["commit", "--quiet", "-m", "before qsm-setup activate"]);
    return {
      name: GIT_BEFORE,
      status: "installed",
      detail: `committed ${home} as 'before qsm-setup activate'`,
    };
  } catch (e) {
    return failed(GIT_BEFORE, e);
  }
}

/** Last step: commit exactly what activation wrote. */
function gitAfterStep(ctx: ActivationContext, home: string, written: string[]): Step {
  if (written.length === 0) {
    return { name: GIT_AFTER, status: "already", detail: "nothing written, nothing to commit" };
  }
  const names = written.join(", ");
  if (ctx.dryRun) {
    return {
      name: GIT_AFTER,
      status: "skipped",
      detail: `would commit ${names} as 'qsm-setup activate: ${names}'`,
    };
  }
  try {
    git(home, ctx.env, ["add", "--", ...written]);
    git(home, ctx.env, [
      "commit",
      "--quiet",
      "-m",
      `qsm-setup activate: ${names}`,
      "--",
      ...written,
    ]);
    return { name: GIT_AFTER, status: "installed", detail: `committed ${names}` };
  } catch (e) {
    return failed(GIT_AFTER, e);
  }
}

/** The whole managed write, taken or not taken as one. */
export function instructionsStep(ctx: ActivationContext): Step {
  return writeInstructions(ctx).step;
}

function writeInstructions(ctx: ActivationContext): { step: Step; written: string[] } {
  const home = claudeHome(ctx.env);
  const choice = ctx.choices.instructions;
  if (!isInstructionsChoice(choice)) {
    throw new Error(`--instructions must be one of ${INSTRUCTIONS_CHOICES.join(", ")}`);
  }
  const changes = targets(home, choice).filter(
    (t) => !existsSync(t.path) || readFileSync(t.path, "utf8") !== t.content,
  );
  const written = changes.map((t) => t.path.slice(home.length + 1));
  if (changes.length === 0) {
    return {
      step: {
        name: NAME,
        status: "already",
        detail: `instructions in ${home} already match the plugin`,
      },
      written,
    };
  }
  const names = written.join(", ");
  if (ctx.dryRun) {
    return { step: { name: NAME, status: "skipped", detail: `would write ${names}` }, written };
  }
  for (const t of changes) {
    mkdirSync(dirname(t.path), { recursive: true });
    writeFileSync(t.path, t.content);
  }
  return { step: { name: NAME, status: "installed", detail: `wrote ${names}` }, written };
}

/** Absent without the rules file; differs when any managed file is not what activation writes. */
function instructionsState(env: ActivationContext["env"]): ActivationState {
  const home = claudeHome(env);
  if (!existsSync(resolve(home, "rules/implementation.md"))) {
    return "absent";
  }
  const stale = targets(home, "replace").some(
    (t) => !existsSync(t.path) || readFileSync(t.path, "utf8") !== t.content,
  );
  return stale ? "differs" : "activated";
}

export const activation: Activation = {
  status: instructionsState,
  options: [
    {
      name: "instructions",
      values: ["replace", "overwrite", "skip"],
      description:
        "what happens to your CLAUDE.md: our marked block replaced and everything outside it kept (the default), the whole file overwritten with the block (only when asked), or left alone",
    },
  ],
  activate: (ctx): InstallResult => {
    const home = claudeHome(ctx.env);
    const before = gitBeforeStep(ctx);
    if (before.status === "error") {
      return { tool: "qsm-setup", status: "error", detail: before.detail, steps: [before] };
    }
    const { step, written } = writeInstructions(ctx);
    const after =
      step.status === "installed"
        ? gitAfterStep(ctx, home, written)
        : gitAfterStep(ctx, home, ctx.dryRun ? written : []);
    const steps = [before, step, after];
    const status = steps.find((s) => s.status === "error")?.status ?? step.status;
    return {
      tool: "qsm-setup",
      status,
      detail: steps.map((s) => `${s.name}: ${s.detail}`).join("; "),
      steps,
    };
  },
};

if (import.meta.main) {
  process.exit(await activationMain(activation));
}
