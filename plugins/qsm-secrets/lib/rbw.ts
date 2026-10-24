// The rbw backend: the one place that runs `rbw`.

import { spawnSync } from "node:child_process";
import { binCheck } from "./bin.ts";
import type { Check } from "./doctor.ts";
import { type Entry, parseEntries } from "./entries.ts";
import { fail } from "./errors.ts";
import { runAll } from "./run-all.ts";
import { WRAPPER_MARK } from "./vault.ts";

const BIN = "rbw";
const NEWLINE = 0x0a;
const NOT_INSTALLED = 127;
const EMAIL_FIX = `${BIN} config set email <your-address>`;

interface BackendResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** The rbw folder as arguments. The empty namespace passes no `--folder`
 * at all, so the whole vault is searched by name. */
function folderArgs(namespace: string): string[] {
  return namespace === "" ? [] : ["--folder", namespace];
}

/** Runs rbw and captures both streams. */
function run(args: readonly string[]): BackendResult {
  const result = spawnSync(BIN, [...args], { encoding: "utf8" });
  if (result.error !== undefined) {
    return { code: NOT_INSTALLED, stdout: "", stderr: `${BIN} is not on PATH` };
  }
  return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

/** Name, folder and user only: `rbw list` never prints the password. */
function entries(): Entry[] {
  const result = run(["list", "--fields", "name,folder,user"]);
  if (result.code === NOT_INSTALLED) {
    fail(`${BIN} is not on PATH`, `install ${BIN}, for example: cargo install rbw`, "missing");
  }
  if (result.code !== 0) {
    fail(
      `${BIN} could not list the vault`,
      `run qsm-secrets doctor; the usual cause is a locked vault (${BIN} unlock)`,
    );
  }
  return parseEntries(result.stdout);
}

/** The value `rbw get` printed, without the newline it adds. */
function valueOf(stdout: Buffer): Uint8Array {
  const bytes = new Uint8Array(stdout);
  return bytes.at(-1) === NEWLINE ? bytes.subarray(0, bytes.length - 1) : bytes;
}

function read(namespace: string, key: string): Uint8Array | null {
  const result = spawnSync(BIN, ["get", ...folderArgs(namespace), key]);
  return result.error !== undefined || result.status !== 0 ? null : valueOf(result.stdout);
}

async function readAll(rows: readonly Entry[]): Promise<(Uint8Array | null)[]> {
  const found = await runAll(
    BIN,
    rows.map((row) => ["get", ...folderArgs(row.folder), row.name]),
  );
  return found.map((stdout) => (stdout === null ? null : valueOf(stdout)));
}

/**
 * `rbw add` opens $EDITOR on a temp file and takes its first line as the password. For a value
 * passed in, `tee` is that editor: it copies rbw's stdin, our pipe, into the file.
 */
function store(namespace: string, key: string, value?: Uint8Array): void {
  if (value !== undefined && value.includes(NEWLINE)) {
    fail(`${BIN} stores one line; the value has several`, "use libsecret for a multi-line secret");
  }
  const added = spawnSync(BIN, ["add", ...folderArgs(namespace), key, WRAPPER_MARK], {
    input: value,
    env: value === undefined ? process.env : { ...process.env, EDITOR: "tee", VISUAL: "tee" },
    stdio: value === undefined ? "inherit" : ["pipe", "ignore", "pipe"],
  });
  if (added.error !== undefined || added.status !== 0) {
    fail("nothing stored", `the ${BIN} prompt was cancelled or failed; run qsm-secrets doctor`);
  }
}

function remove(namespace: string, key: string): boolean {
  return run(["remove", ...folderArgs(namespace), key]).code === 0;
}

/** rbw keeps the account it talks to in its own config. Without an email
 * it has nothing to log in as, and every other verb fails late. */
function accountCheck(): Check {
  const name = "vault account configured";
  const shown = run(["config", "show"]);
  if (shown.code !== 0) {
    return { name, ok: false, detail: `${BIN} config show failed`, fix: EMAIL_FIX };
  }
  const email = /"email"\s*:\s*"([^"]+)"/.exec(shown.stdout)?.[1];
  return email === undefined
    ? { name, ok: false, detail: "no email set", fix: EMAIL_FIX }
    : { name, ok: true, detail: email, fix: null };
}

/** The agent holds the unlocked vault. This is the check that makes the
 * difference between "the key is missing" and "nobody unlocked anything". */
function unlockedCheck(): Check {
  const name = "vault unlocked";
  return run(["unlocked"]).code === 0
    ? { name, ok: true, detail: "the agent holds an unlocked vault", fix: null }
    : {
        name,
        ok: false,
        detail: "locked",
        fix: `${BIN} unlock (or ${BIN} login the first time)`,
      };
}

/** `set` types the value into an editor rbw opens. No editor, no way to
 * store a secret without passing it somewhere it must not go. */
function editorCheck(env: Record<string, string | undefined>): Check {
  const name = "editor for storing a secret";
  const editor = env.EDITOR ?? env.VISUAL ?? "";
  return editor === ""
    ? {
        name,
        ok: false,
        detail: "neither EDITOR nor VISUAL is set",
        fix: "set EDITOR to the editor the store prompt should open",
      }
    : { name, ok: true, detail: editor, fix: null };
}

function namespaceCheck(namespace: string): Check {
  const name = `namespace ${namespace === "" ? "(whole vault)" : namespace}`;
  const listed = run(["list", "--fields", "name,folder,user"]);
  if (listed.code !== 0) {
    return {
      name,
      ok: false,
      detail: "the vault could not be listed",
      fix: `${BIN} sync, then qsm-secrets doctor again`,
    };
  }
  const count = parseEntries(listed.stdout).filter(
    (entry) => namespace === "" || entry.folder === namespace,
  ).length;
  return { name, ok: true, detail: `${count} entries`, fix: null };
}

function health(namespace: string, env: Record<string, string | undefined>): Check[] {
  return [
    binCheck(BIN, `install ${BIN}, for example: cargo install rbw`),
    accountCheck(),
    unlockedCheck(),
    editorCheck(env),
    namespaceCheck(namespace),
  ];
}

/** Shaped like `Backend`; `backend.ts` is where that is checked. */
export const rbw = { name: BIN, entries, read, readAll, store, remove, health };
