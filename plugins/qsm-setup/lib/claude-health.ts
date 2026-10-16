// Doctor's Claude Code group: how many installs there are and which one runs, whether the native
// launcher is on PATH, whether the hand-edited files still parse, and whether the installed version
// trails its channel.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Env, home } from "../../../lib/paths.ts";
import { agentChecks, type ClaudePaths, configChecks, skillChecks } from "./claude-files.ts";
import type { Check } from "./doctor.ts";
import { isRecord } from "../../../lib/outcome.ts";

export type Channel = "latest" | "stable";
export type Lookup =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly reason: string };

export interface ClaudeProbes {
  readonly env: Env;
  readonly cwd: string;
  /** every `claude` on PATH in PATH order, as `which -a claude` lists them */
  readonly whichAll: () => readonly string[];
  /** `claude --version` output, or null when it does not run */
  readonly version: () => string | null;
  /** the channel's latest version; called at most once, never retried */
  readonly latest: (channel: Channel) => Promise<Lookup>;
}

type InstallKind = "native" | "npm" | "local" | "other";

interface Install {
  readonly kind: InstallKind;
  readonly path: string;
}

/** What `installMethod` in `.claude.json` says for each kind of install. */
const METHOD: Readonly<Record<InstallKind, string>> = {
  native: "native",
  npm: "global",
  local: "local",
  other: "unknown",
};

interface Layout extends ClaudePaths {
  readonly launcher: string;
  readonly nativeData: string;
  readonly localDir: string;
}

function layout(p: ClaudeProbes): Layout {
  const h = home(p.env);
  const configDir = p.env.CLAUDE_CONFIG_DIR ?? join(h, ".claude");
  return {
    configDir,
    claudeJson:
      p.env.CLAUDE_CONFIG_DIR === undefined
        ? join(h, ".claude.json")
        : join(p.env.CLAUDE_CONFIG_DIR, ".claude.json"),
    cwd: p.cwd,
    launcher: join(h, ".local", "bin", "claude"),
    nativeData: join(h, ".local", "share", "claude"),
    localDir: join(configDir, "local"),
  };
}

function check(name: string, status: Check["status"], detail: string): Check {
  return { name, status, detail, output: "" };
}

function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function classify(path: string, l: Layout): InstallKind {
  const r = real(path);
  if (path === l.launcher || r.startsWith(`${l.nativeData}/`)) {
    return "native";
  }
  if (path.startsWith(`${l.localDir}/`) || r.startsWith(`${real(l.localDir)}/`)) {
    return "local";
  }
  return r.includes("/node_modules/") ? "npm" : "other";
}

/** One install per kind, first seen wins: the launcher and the leftover
 * local directory count even when PATH does not reach them. */
function installs(on: readonly string[], l: Layout): Install[] {
  const found = new Map<InstallKind, string>();
  const add = (kind: InstallKind, path: string): void => {
    if (!found.has(kind)) {
      found.set(kind, path);
    }
  };
  for (const path of on) {
    add(classify(path, l), path);
  }
  if (existsSync(l.launcher)) {
    add("native", l.launcher);
  }
  if (existsSync(l.localDir)) {
    add("local", l.localDir);
  }
  return [...found].map(([kind, path]) => ({ kind, path }));
}

const REMOVALS: Record<InstallKind, (i: Install, l: Layout) => string> = {
  native: (_i, l) => `rm ${l.launcher} && rm -rf ${l.nativeData}`,
  npm: () => "npm uninstall -g @anthropic-ai/claude-code",
  local: (_i, l) => `rm -rf ${l.localDir}`,
  other: (i) => `rm ${i.path}`,
};

function removal(i: Install, l: Layout): string {
  return REMOVALS[i.kind](i, l);
}

/** A key of `.claude.json` or settings, read alone; null when the file is
 * missing, does not parse, or lacks the key. Nothing else is kept. */
function readKey(file: string, key: string): unknown {
  if (!existsSync(file)) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return isRecord(parsed) ? (parsed[key] ?? null) : null;
  } catch {
    return null;
  }
}

function installCheck(all: readonly Install[], running: Install | null, l: Layout): Check {
  const name = "claude installs";
  if (all.length === 0) {
    return check(name, "WARN", "no claude on PATH and no native launcher");
  }
  const keep = running ?? all[0];
  if (all.length > 1 && keep !== undefined) {
    const listed = all.map((i) => `${i.kind} (${i.path})`).join(", ");
    const fixes = all.filter((i) => i.kind !== keep.kind).map((i) => removal(i, l));
    return check(
      name,
      "FAIL",
      `${all.length} installs: ${listed}; running: ${keep.kind}; remove the others: ${fixes.join("; ")}`,
    );
  }
  const method = readKey(l.claudeJson, "installMethod");
  if (running !== null && typeof method === "string" && method !== METHOD[running.kind]) {
    return check(
      name,
      "FAIL",
      `running install is ${running.kind} but installMethod in ${l.claudeJson} is ${method}; edit ${l.claudeJson}: set "installMethod": "${METHOD[running.kind]}"`,
    );
  }
  return check(name, "PASS", `one install: ${keep?.kind} (${keep?.path})`);
}

function pathCheck(p: ClaudeProbes, l: Layout): Check {
  const name = "claude path";
  if (!existsSync(l.launcher)) {
    return check(name, "SKIP", "no native launcher");
  }
  const dir = dirname(l.launcher);
  if ((p.env.PATH ?? "").split(":").includes(dir)) {
    return check(name, "PASS", `${dir} is on PATH`);
  }
  return check(
    name,
    "FAIL",
    `${dir} holds the native launcher but is not on PATH; add to your shell profile: export PATH="${dir}:$PATH" (fish: fish_add_path ${dir})`,
  );
}

function channelOf(l: Layout): Channel {
  const raw =
    readKey(join(l.configDir, "settings.json"), "autoUpdatesChannel") ??
    readKey(l.claudeJson, "autoUpdatesChannel");
  return raw === "stable" ? "stable" : "latest";
}

function semver(text: string): number[] | null {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  return m === null ? null : [Number(m[1]), Number(m[2]), Number(m[3])];
}

function behind(installed: readonly number[], latest: readonly number[]): boolean {
  for (let i = 0; i < 3; i += 1) {
    const a = installed[i] ?? 0;
    const b = latest[i] ?? 0;
    if (a !== b) {
      return a < b;
    }
  }
  return false;
}

/** The one release lookup: a failure is a WARN and is never retried. */
async function lookupCheck(
  p: ClaudeProbes,
  l: Layout,
  installed: readonly number[],
): Promise<Check> {
  const name = "claude version";
  const v = installed.join(".");
  const channel = channelOf(l);
  const found = await p.latest(channel);
  const latest = found.ok ? semver(found.version) : null;
  if (latest === null) {
    const reason = found.ok ? "no version in the reply" : found.reason;
    return check(name, "WARN", `installed ${v}; ${channel} lookup failed: ${reason}`);
  }
  const at = latest.join(".");
  return behind(installed, latest)
    ? check(name, "FAIL", `installed ${v} is behind ${channel} ${at}; run: claude update`)
    : check(name, "PASS", `installed ${v}, ${channel} ${at}`);
}

function versionCheck(p: ClaudeProbes, running: Install | null, l: Layout): Check | Promise<Check> {
  const name = "claude version";
  const installed = semver(p.version() ?? "");
  if (installed === null) {
    return check(name, "WARN", "claude --version did not report a version");
  }
  const v = installed.join(".");
  if (running?.kind !== "native") {
    return check(name, "SKIP", `installed ${v}; the channel lookup covers native installs only`);
  }
  if ((p.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ?? "") !== "") {
    return check(
      name,
      "SKIP",
      `installed ${v}; lookup skipped: CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC is set`,
    );
  }
  return lookupCheck(p, l, installed);
}

export async function claudeChecks(p: ClaudeProbes): Promise<Check[]> {
  const l = layout(p);
  const on = p.whichAll();
  const all = installs(on, l);
  const [first] = on;
  const running = first === undefined ? null : { kind: classify(first, l), path: first };
  return [
    installCheck(all, running, l),
    pathCheck(p, l),
    ...configChecks(l),
    ...agentChecks(l),
    ...skillChecks(l),
    await versionCheck(p, running, l),
  ];
}
