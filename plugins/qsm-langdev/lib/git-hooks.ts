// Per-project git hooks: wiring `qsm-langdev hook <name>` into pre-commit and pre-push, reversibly.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export const HOOK_NAMES = ["pre-commit", "pre-push"] as const;
export type HookName = (typeof HOOK_NAMES)[number];

/** The language a hook script is written in. */
export const HOOK_LANGS = ["sh", "py", "ts"] as const;
export type HookLang = (typeof HOOK_LANGS)[number];

const SHEBANG: Record<HookLang, string> = {
  sh: "#!/usr/bin/env bash",
  py: "#!/usr/bin/env python3",
  ts: "#!/usr/bin/env bun",
};
const COMMENT: Record<HookLang, string> = { sh: "#", py: "#", ts: "//" };

/** The call a hook makes. git hands pre-push the remote's name as its first argument, and the
 * gate needs it to know which remote's refs are not news, so the shim passes it on. */
function hookCallLine(name: HookName, lang: HookLang): string {
  return callLine(name, lang, name === "pre-push");
}

/** The call line a hook written before the remote name was passed holds, or null when it is the
 * current one, so a reinstall can replace that one line and keep what the person added. */
function earlierCallLine(name: HookName, lang: HookLang): string | null {
  return name === "pre-push" ? callLine(name, lang, false) : null;
}

function callLine(name: HookName, lang: HookLang, push: boolean): string {
  if (lang === "py") {
    return (
      "import subprocess, sys\n" +
      `if subprocess.run(["qsm-langdev", "hook", "${name}"${push ? ", *sys.argv[1:2]" : ""}]).returncode != 0:\n` +
      "    sys.exit(1)"
    );
  }
  if (lang === "ts") {
    return (
      `if (Bun.spawnSync(["qsm-langdev", "hook", "${name}"${push ? ", ...Bun.argv.slice(2, 3)" : ""}], ` +
      '{ stdio: ["inherit", "inherit", "inherit"] }).exitCode !== 0) process.exit(1);'
    );
  }
  return `qsm-langdev hook ${name}${push ? ' "${1:-}"' : ""} || exit 1`;
}

/** Which language an existing hook is written in, or null when we cannot
 * tell — its first line names no interpreter we recognise. */
function detectHookLang(body: string): HookLang | null {
  const first = body.split("\n", 1)[0] ?? "";
  if (!first.startsWith("#!")) {
    return null;
  }
  if (/\b(bash|sh|zsh|dash|ksh)$/.test(first)) {
    return "sh";
  }
  if (/python[0-9.]*$/.test(first)) {
    return "py";
  }
  if (/\b(bun|node|deno|tsx)$/.test(first)) {
    return "ts";
  }
  return null;
}

const MARKER = "installed by qsm-langdev";
const BLOCK_BEGIN = "--- qsm-langdev gate (added by qsm-langdev install) ---";
const BLOCK_END = "--- end qsm-langdev gate ---";

const blockBegin = (lang: HookLang): string => `${COMMENT[lang]} ${BLOCK_BEGIN}`;
const blockEnd = (lang: HookLang): string => `${COMMENT[lang]} ${BLOCK_END}`;
const gateBlock = (name: HookName, lang: HookLang): string =>
  `\n${blockBegin(lang)}\n${hookCallLine(name, lang)}\n${blockEnd(lang)}\n`;

/** Where our marked block sits in a hook, or null when it has none. */
function ownBlock(body: string, lang: HookLang): { start: number; end: number } | null {
  const start = body.indexOf(blockBegin(lang));
  const endMarker = blockEnd(lang);
  const end = body.indexOf(endMarker);
  return start !== -1 && end > start ? { start, end: end + endMarker.length } : null;
}

function hookBody(name: HookName, lang: HookLang): string {
  const comment = COMMENT[lang];
  return [
    SHEBANG[lang],
    `${comment} ${MARKER}`,
    `${comment} Remove with: qsm-langdev uninstall`,
    ...(lang === "sh" ? ["set -euo pipefail"] : []),
    "",
    hookCallLine(name, lang),
    "",
  ].join("\n");
}

/** True when this file is one we wrote whole and may therefore remove. */
function isOurs(path: string): boolean {
  return existsSync(path) && readFileSync(path, "utf8").includes(MARKER);
}

export type HookAction =
  | { hook: HookName; kind: "written"; path: string }
  | { hook: HookName; kind: "already"; path: string }
  | { hook: HookName; kind: "appended"; path: string; backup: string }
  | { hook: HookName; kind: "unappended"; path: string }
  | { hook: HookName; kind: "manual"; path: string; line: string; why: string }
  | { hook: HookName; kind: "removed"; path: string }
  | { hook: HookName; kind: "absent"; path: string };

/** Where git itself looks for hooks. */
function hooksDir(repoRoot: string): string {
  const result = spawnSync("git", ["rev-parse", "--git-path", "hooks"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const path = result.status === 0 ? result.stdout.trim() : join(".git", "hooks");
  return isAbsolute(path) ? path : join(repoRoot, path);
}

/** Brings a hook we wrote whole up to the current call by replacing only its earlier call line, so
 * whatever the person added to it stays. */
function refreshOwnHook(name: HookName, path: string, lang: HookLang): HookAction {
  const current = readFileSync(path, "utf8");
  const hookLang = detectHookLang(current) ?? lang;
  const line = hookCallLine(name, hookLang);
  if (current.includes(line)) {
    return { hook: name, kind: "already", path };
  }
  const earlier = earlierCallLine(name, hookLang);
  if (earlier === null || !current.includes(earlier)) {
    return {
      hook: name,
      kind: "manual",
      path,
      line,
      why: "it holds no call line install wrote, so rewriting it would drop what was added by hand",
    };
  }
  writeFileSync(path, current.replace(earlier, line), { mode: 0o755 });
  return { hook: name, kind: "written", path };
}

/** Writes our hooks into the repository, adding to an existing one rather than replacing it. */
export function installHooks(
  repoRoot: string,
  names: readonly HookName[] = HOOK_NAMES,
  lang: HookLang = "sh",
): HookAction[] {
  const dir = hooksDir(repoRoot);
  mkdirSync(dir, { recursive: true });
  return names.map((name): HookAction => {
    const path = join(dir, name);
    if (isOurs(path)) {
      return refreshOwnHook(name, path, lang);
    }
    if (!existsSync(path)) {
      writeFileSync(path, hookBody(name, lang), { mode: 0o755 });
      return { hook: name, kind: "written", path };
    }

    const body = readFileSync(path, "utf8");
    const existingLang = detectHookLang(body);
    if (existingLang === null) {
      return {
        hook: name,
        kind: "manual",
        path,
        line: hookCallLine(name, lang),
        why: "its shebang names no language we can write, so appending would risk breaking it",
      };
    }
    if (body.includes(hookCallLine(name, existingLang))) {
      return { hook: name, kind: "already", path };
    }
    const stale = ownBlock(body, existingLang);
    if (stale !== null) {
      const fresh =
        body.slice(0, stale.start) + gateBlock(name, existingLang).trim() + body.slice(stale.end);
      writeFileSync(path, fresh, { mode: 0o755 });
      return { hook: name, kind: "appended", path, backup: `${path}.qsm-backup` };
    }
    const backup = `${path}.qsm-backup`;
    if (!existsSync(backup)) {
      writeFileSync(backup, body);
    }
    writeFileSync(path, body.replace(/\n*$/, "") + gateBlock(name, existingLang), { mode: 0o755 });
    return { hook: name, kind: "appended", path, backup };
  });
}

/** Takes out exactly what `installHooks` put in. */
export function uninstallHooks(
  repoRoot: string,
  names: readonly HookName[] = HOOK_NAMES,
): HookAction[] {
  return names.map((name) => {
    const path = join(hooksDir(repoRoot), name);
    if (isOurs(path)) {
      unlinkSync(path);
      return { hook: name, kind: "removed", path };
    }
    if (!existsSync(path)) {
      return { hook: name, kind: "absent", path };
    }

    const body = readFileSync(path, "utf8");
    const lang = detectHookLang(body) ?? "sh";
    const block = ownBlock(body, lang);
    if (block !== null) {
      const without =
        body.slice(0, block.start).replace(/\n*$/, "\n") +
        body.slice(block.end).replace(/^\n+/, "");
      writeFileSync(path, without, { mode: 0o755 });
      return { hook: name, kind: "unappended", path };
    }
    if (body.includes(hookCallLine(name, lang))) {
      return {
        hook: name,
        kind: "manual",
        path,
        line: hookCallLine(name, lang),
        why: "the line was added by hand, outside our block",
      };
    }
    return { hook: name, kind: "absent", path };
  });
}
