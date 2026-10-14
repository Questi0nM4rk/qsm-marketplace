// The verbs.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { home } from "../../../lib/paths.ts";
import { activeBackend, type Backend, backendChosen } from "./backend.ts";
import { type Capture, captureSecrets } from "./capture.ts";
import {
  formatMetadata,
  keyExists,
  type Metadata,
  namespaceMetadata,
  storedKeys,
} from "./entries.ts";
import { fail } from "./errors.ts";
import { CAPTURE_NAMESPACE, locate, placeholderIds } from "./substitute.ts";
import { WRAPPER_MARK } from "./vault.ts";

/** The file descriptor `get` writes to. */
const CHANNEL_FD = 3;

const PIPE_HINT = "use qsm-secrets pipe <key> -- <cmd> or qsm-secrets env <key>=<VAR> -- <cmd>";

function missing(namespace: string, key: string): never {
  const where = namespace === "" ? "the vault" : `namespace ${namespace}`;
  fail(
    `not stored: ${key}`,
    `check ${where} with qsm-secrets list or qsm-secrets inspect`,
    "missing",
  );
}

function consumerCommand(command: readonly string[]): [string, string[]] {
  const [head, ...tail] = command;
  if (head === undefined) {
    fail("no consumer command", `write the command after --, for example ${PIPE_HINT}`, "usage");
  }
  return [head, tail];
}

/** The active backend, once the key is known to be stored in it. */
function backendHolding(namespace: string, key: string): Backend {
  const backend = activeBackend();
  if (!keyExists(backend.entries(), namespace, key)) {
    missing(namespace, key);
  }
  return backend;
}

/** Exists first, value second. */
export function resolve(namespace: string, key: string): Uint8Array {
  const value = backendHolding(namespace, key).read(namespace, key);
  if (value === null) {
    missing(namespace, key);
  }
  return value;
}

/**
 * `capture`: the text comes piped on stdin. The backend is resolved on the first secret, so a
 * prompt without one needs no backend at all.
 */
export function runCapture(): Capture {
  if (process.stdin.isTTY) {
    fail("capture reads its text from stdin", "pipe the text in", "usage");
  }
  let backend: Backend | undefined;
  const active = (): Backend => {
    backend ??= activeBackend();
    return backend;
  };
  return captureSecrets(readFileSync(0, "utf8"), {
    store: (namespace, key, value) => {
      active().store(namespace, key, new TextEncoder().encode(value));
    },
    exists: (namespace, key) => keyExists(active().entries(), namespace, key),
  });
}

/** `mask`: the text piped on stdin with each named id's stored value swapped for its placeholder. */
export function runMask(ids: readonly string[]): { text: string } {
  const backend = activeBackend();
  const values = ids.map((id) => {
    const { namespace, key } = locate(id);
    return { id, value: backend.read(namespace, key), namespace, key };
  });
  let text = readFileSync(0, "utf8");
  for (const { id, value, namespace, key } of values) {
    if (value === null) {
      missing(namespace, key);
    }
    // ponytail: the value as stored; a command that prints it re-encoded (base64, escaped) is not masked.
    text = text.replaceAll(new TextDecoder().decode(value), `{{secret:${id}}}`);
  }
  return { text };
}

/** A stored value shorter than this is not masked: it would match inside ordinary words. */
const MIN_MASKED = 6;

/** What replaces a value: `{{secret:<id>}}` in the capture namespace, else `{{secret:<namespace>/<key>}}`. */
function placeholderOf(namespace: string, key: string): string {
  return namespace === CAPTURE_NAMESPACE || namespace === ""
    ? `{{secret:${key}}}`
    : `{{secret:${namespace}/${key}}}`;
}

/**
 * `mask --all`: stdin is a JSON array of strings; each comes back with every stored value of every
 * namespace swapped for its placeholder. The backend is read once, however many strings there are.
 */
export function runMaskAll(): { texts: string[] } {
  const parsed: unknown = JSON.parse(readFileSync(0, "utf8"));
  if (!(Array.isArray(parsed) && parsed.every((text) => typeof text === "string"))) {
    fail("mask --all reads a JSON array of strings on stdin", "pipe the array in", "usage");
  }
  if (!backendChosen()) {
    return { texts: parsed };
  }
  const backend = activeBackend();
  const values = backend
    .entries()
    .flatMap((entry) => {
      const bytes = backend.read(entry.folder, entry.name);
      if (bytes === null) {
        // A listed key that cannot be read (a locked vault) would pass unmasked: refuse instead.
        fail(`cannot read ${entry.folder}/${entry.name} to mask it`, "unlock the vault", "blocked");
      }
      const value = new TextDecoder().decode(bytes);
      return value.length < MIN_MASKED
        ? []
        : [{ value, placeholder: placeholderOf(entry.folder, entry.name) }];
    })
    // A value that contains another is masked first, so the shorter one cannot leave a stub.
    .sort((a, b) => b.value.length - a.value.length);
  const texts = parsed.map((text) =>
    values.reduce((masked, { value, placeholder }) => masked.replaceAll(value, placeholder), text),
  );
  return { texts };
}

const projectsDir = (): string => join(home(process.env), ".claude", "projects");

/** The transcript a session id names: `~/.claude/projects/<dir>/<id>.jsonl`, wherever `<dir>` is. */
function locateTranscript(sessionId: string): string {
  const projects = projectsDir();
  const dirs = existsSync(projects) ? readdirSync(projects) : [];
  const found = dirs.map((d) => join(projects, d, `${sessionId}.jsonl`)).find((p) => existsSync(p));
  return found ?? fail(`no transcript for ${sessionId}`, `looked under ${projects}`, "missing");
}

/**
 * `scrub`: in a transcript (a path, or a session id) every captured value that still appears is
 * swapped for its placeholder. Only ids the file already names a placeholder for are read, so a
 * transcript with no capture needs no backend. The file is replaced by a rename, never edited in place.
 * ponytail: a line appended between the read and the rename is lost; it runs after the session ends.
 */
export function runScrub(target: string): { path: string; scrubbed: number } {
  const path = target.includes("/") ? target : locateTranscript(target);
  let text = readFileSync(path, "utf8");
  const ids = placeholderIds(text);
  const backend = ids.length === 0 ? undefined : activeBackend();
  let scrubbed = 0;
  for (const id of backend === undefined ? [] : ids) {
    const { namespace, key } = locate(id);
    const bytes = backend?.read(namespace, key);
    if (bytes === null || bytes === undefined) {
      continue;
    }
    const value = new TextDecoder().decode(bytes);
    // The transcript is JSON lines: a value holding a quote or a backslash sits there escaped.
    for (const form of new Set([value, JSON.stringify(value).slice(1, -1)])) {
      if (text.includes(form)) {
        text = text.replaceAll(form, `{{secret:${id}}}`);
        scrubbed += 1;
      }
    }
  }
  if (scrubbed > 0) {
    const temp = join(dirname(path), `.${process.pid}.scrub`);
    writeFileSync(temp, text, { mode: statSync(path).mode });
    renameSync(temp, path);
  }
  return { path, scrubbed };
}

/** What a delivery verb reports: the consumer ran, and with which code. */
export interface Delivery {
  readonly command: string;
  readonly exit: number;
}

export function runPipe(namespace: string, key: string, command: readonly string[]): Delivery {
  const [head, tail] = consumerCommand(command);
  const value = resolve(namespace, key);
  const consumer = spawnSync(head, tail, { input: value, stdio: ["pipe", "inherit", "inherit"] });
  if (consumer.error !== undefined) {
    fail(`could not run ${head}`, "check the consumer command and its arguments");
  }
  return { command: head, exit: consumer.status ?? 1 };
}

interface EnvDelivery {
  readonly namespace: string;
  readonly key: string;
  readonly variable: string;
  readonly command: readonly string[];
  readonly stdio: "inherit" | "ignore";
}

function deliverEnv({ namespace, key, variable, command, stdio }: EnvDelivery): Delivery {
  const [head, tail] = consumerCommand(command);
  const value = resolve(namespace, key);
  // The value goes into the child's environment and nowhere else: not into this process's own env,
  // and not into any argv, which /proc exposes to every other user on a default Linux.
  const consumer = spawnSync(head, tail, {
    env: { ...process.env, [variable]: new TextDecoder().decode(value) },
    stdio,
  });
  if (consumer.error !== undefined) {
    fail(`could not run ${head}`, "check the consumer command and its arguments");
  }
  return { command: head, exit: consumer.status ?? 1 };
}

export function runEnv(
  namespace: string,
  key: string,
  variable: string,
  command: readonly string[],
): Delivery {
  return deliverEnv({ namespace, key, variable, command, stdio: "inherit" });
}

/** `check`: runs like `env`, but the probe's output is discarded; only its exit code answers. */
export function runCheck(
  namespace: string,
  key: string,
  variable: string,
  command: readonly string[],
): Delivery {
  return deliverEnv({ namespace, key, variable, command, stdio: "ignore" });
}

/** `has`: the outcome is the whole answer, by design. A printed line
 * either way would be one more thing for a reader to mistake for a value. */
export function runHas(namespace: string, key: string): boolean {
  return keyExists(activeBackend().entries(), namespace, key);
}

export function runList(namespace: string): { namespace: string; keys: string[] } {
  return { namespace, keys: storedKeys(activeBackend().entries(), namespace) };
}

export function runInspect(namespace: string): {
  namespace: string;
  entries: Metadata[];
  text: string;
} {
  const entries = namespaceMetadata(activeBackend().entries(), namespace);
  return { namespace, entries, text: formatMetadata(namespace, entries) };
}

export function runRemove(
  namespace: string,
  key: string,
): { namespace: string; key: string; removed: true } {
  const backend = backendHolding(namespace, key);
  if (!backend.remove(namespace, key)) {
    fail(`could not remove ${key}`, `run ${backend.name} remove ${key} yourself to see why`);
  }
  return { namespace, key, removed: true };
}

/** `set`: the value is typed into the backend's own prompt. */
export function runSet(
  namespace: string,
  key: string,
): { namespace: string; key: string; stored: true } {
  const backend = activeBackend();
  if (!process.stdin.isTTY) {
    fail(
      "set needs a terminal",
      `run it yourself in a shell; a value is typed into ${backend.name}'s prompt, never passed in`,
      "missing",
    );
  }
  backend.store(namespace, key);
  // Read back only to measure. An empty first line in the editor is a dismissed prompt, and an
  // empty entry left in the vault would make `has` answer yes to a key that carries nothing.
  const value = backend.read(namespace, key);
  if (value === null || value.length === 0) {
    backend.remove(namespace, key);
    fail(
      "the prompt came back empty, nothing stored",
      "run qsm-secrets set again and type a value",
    );
  }
  return { namespace, key, stored: true };
}

/**
 * A zero-byte write, not a stat: a closed descriptor still answers `fstat` under this runtime,
 * while `write` returns EBADF.
 */
function channelOpen(): boolean {
  try {
    writeSync(CHANNEL_FD, new Uint8Array(0));
    return true;
  } catch {
    return false;
  }
}

/** `get`: the last resort, for a consumer that reads neither stdin nor an environment variable. */
export function runGet(namespace: string, key: string): { namespace: string; key: string } {
  if (!channelOpen()) {
    fail(
      "refuses to write a value to ordinary output",
      `open the channel yourself, qsm-secrets get ${key} 3>FILE, or better: ${PIPE_HINT}`,
      "blocked",
    );
  }
  writeSync(CHANNEL_FD, resolve(namespace, key));
  return { namespace, key };
}

/**
 * `rename`: the value is read into this process and written under the new name, never printed.
 * The new entry is read back and compared before the old one goes, so a failed step leaves the old
 * name intact; a target that exists is refused, never overwritten.
 */
export function runRename(
  from: { namespace: string; key: string },
  to: { namespace: string; key: string },
): { from: string; to: string } {
  const label = (side: { namespace: string; key: string }): string =>
    `${side.namespace}/${side.key}`;
  if (from.namespace === to.namespace && from.key === to.key) {
    fail("rename needs two different names", "pass a new <to> or --to-folder", "usage");
  }
  const backend = backendHolding(from.namespace, from.key);
  if (keyExists(backend.entries(), to.namespace, to.key)) {
    fail(
      `already stored: ${label(to)}`,
      "pick another name, or remove it with qsm-secrets rm",
      "blocked",
    );
  }
  const value = backend.read(from.namespace, from.key);
  if (value === null) {
    missing(from.namespace, from.key);
  }
  backend.store(to.namespace, to.key, value);
  const copy = backend.read(to.namespace, to.key);
  if (copy === null || !Buffer.from(copy).equals(Buffer.from(value))) {
    backend.remove(to.namespace, to.key);
    fail(
      `the copy at ${label(to)} did not read back equal, nothing renamed`,
      `${label(from)} is untouched`,
    );
  }
  if (!backend.remove(from.namespace, from.key)) {
    fail(
      `copied to ${label(to)} but could not remove ${label(from)}`,
      `both names hold the value now; remove the old one with qsm-secrets rm ${from.key}`,
    );
  }
  return { from: label(from), to: label(to) };
}

/** Every transcript under `~/.claude/projects`, subagent ones included. */
function allTranscripts(projects: string): string[] {
  return readdirSync(projects, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => join(projects, name));
}

/**
 * `prune`: the capture entries whose id no transcript names are removed (or only listed). With no
 * transcript to read, every id would look unused, so that is refused.
 * ponytail: a capture made in a live session is named in its transcript only once the prompt is
 * rewritten; run prune after the sessions end.
 */
export function runPrune(dryRun: boolean): { ids: string[]; dryRun: boolean } {
  const backend = activeBackend();
  const projects = projectsDir();
  const transcripts = existsSync(projects) ? allTranscripts(projects) : [];
  if (transcripts.length === 0) {
    fail("no transcript to check the ids against", `looked under ${projects}`, "missing");
  }
  const used = new Set(transcripts.flatMap((path) => placeholderIds(readFileSync(path, "utf8"))));
  const ids = backend
    .entries()
    .filter((e) => e.folder === CAPTURE_NAMESPACE && e.user === WRAPPER_MARK && !used.has(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
  if (!dryRun) {
    for (const id of ids) {
      if (!backend.remove(CAPTURE_NAMESPACE, id)) {
        fail(`could not remove ${id}`, "run qsm-secrets prune again after qsm-secrets doctor");
      }
    }
  }
  return { ids, dryRun };
}
