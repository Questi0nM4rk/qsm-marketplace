// The libsecret backend: the one place that runs `secret-tool`. Local only: it talks to the
// Secret Service daemon on the session bus, never to a network, and never to rbw.

import { spawnSync } from "node:child_process";
import { onPath } from "../../../lib/outcome.ts";
import { binCheck } from "./bin.ts";
import type { Check } from "./doctor.ts";
import type { Entry } from "./entries.ts";
import { fail } from "./errors.ts";
import { runAll } from "./run-all.ts";
import { LEGACY_NAMESPACE, WRAPPER_MARK } from "./vault.ts";

const BIN = "secret-tool";
const BUS_CLI = "busctl";
const BUS_SEND = "dbus-send";
const SERVICE = "org.freedesktop.secrets";
const START_PROVIDER =
  "start a Secret Service provider, for example gnome-keyring-daemon or KeePassXC";
const INSTALL_FIX = "install libsecret (it ships secret-tool)";
/** Why a search that ran fails: measured, no session bus; expected, a cancelled unlock prompt. */
const SEARCH_FIX =
  "run qsm-secrets doctor; the usual causes are a locked keyring whose unlock prompt was cancelled, a provider that stopped, or no session bus";

/** The attributes every entry of ours carries; `secret-tool` matches on all of them. */
function attributes(namespace: string, key?: string): string[] {
  return [
    "service",
    "qsm",
    ...(namespace === LEGACY_NAMESPACE ? [] : ["namespace", namespace]),
    ...(key === undefined ? [] : ["key", key]),
  ];
}

/** Whether something owns the Secret Service name on the session bus, in one process. */
function daemonOwned(): boolean {
  const asked = onPath(BUS_CLI)
    ? spawnSync(BUS_CLI, ["--user", "status", SERVICE], { encoding: "utf8" })
    : spawnSync(
        BUS_SEND,
        [
          "--session",
          "--print-reply",
          "--dest=org.freedesktop.DBus",
          "/org/freedesktop/DBus",
          "org.freedesktop.DBus.NameHasOwner",
          `string:${SERVICE}`,
        ],
        { encoding: "utf8" },
      );
  return asked.status === 0 && !asked.stdout.includes("boolean false");
}

let readied = false;

/** Every operation starts here: nothing runs, and nothing falls back, without the tool and a daemon.
 * One process asks once, because a mask reads every entry and each ask is a process of its own. */
function ready(): void {
  if (readied) {
    return;
  }
  if (!onPath(BIN)) {
    fail(`${BIN} is not on PATH`, INSTALL_FIX, "missing");
  }
  if (!daemonOwned()) {
    fail(`no Secret Service answers on the session bus (${SERVICE})`, START_PROVIDER, "missing");
  }
  readied = true;
}

/**
 * Names and namespaces only. `secret-tool search` prints each item's `secret =` line on stdout and
 * its attributes on stderr in hash-table order, so stdout is never read: a value holding the text
 * `attribute.key = X` cannot forge a row. stderr has no item delimiter, so an attribute name that
 * repeats starts the next item; that holds only while every item carries the same three attributes,
 * so an item without a namespace (an older schema) fails loud instead of shifting its neighbours,
 * unless the caller is the migration that moves it.
 */
function entries(allowLegacy = false): Entry[] {
  ready();
  const found = spawnSync(BIN, ["search", "--all", "service", "qsm"], { encoding: "utf8" });
  // A search that matches nothing exits 0; one the Secret Service could not answer exits 1 with
  // its error as the last line of stderr (measured: an unreachable bus). An empty listing from a
  // failed search would read as "nothing is stored", and `captures` would forget every row.
  if (found.status !== 0) {
    const said = found.stderr
      .split("\n")
      .findLast((line) => line.trim() !== "" && !line.startsWith("attribute."));
    const cause = (said ?? "no error text").slice(0, 200);
    fail(`${BIN} search failed (exit ${found.status ?? "none"}): ${cause}`, SEARCH_FIX);
  }
  const rows: Entry[] = [];
  let item = new Map<string, string>();
  const flush = (): void => {
    const key = item.get("key");
    const namespace = item.get("namespace");
    if (key !== undefined && namespace === undefined && !allowLegacy) {
      fail(
        `a stored entry has no namespace: ${key} (an older schema)`,
        `move it into a namespace with qsm-secrets rename ${key} <new> --legacy`,
        "failed",
      );
    }
    if (key !== undefined) {
      rows.push({ name: key, folder: namespace ?? LEGACY_NAMESPACE, user: WRAPPER_MARK });
    }
    item = new Map();
  };
  for (const line of found.stderr.split("\n")) {
    const [, name, value] = /^attribute\.(\S+) = (.*)$/.exec(line) ?? [];
    if (name === undefined || value === undefined) {
      continue;
    }
    if (item.has(name)) {
      flush();
    }
    item.set(name, value);
  }
  flush();
  return rows;
}

/** A lookup's stdout as the value, null when the lookup failed or found nothing. */
function valueOf(stdout: Buffer | null): Uint8Array | null {
  return stdout !== null && stdout.length > 0 ? new Uint8Array(stdout) : null;
}

function read(namespace: string, key: string): Uint8Array | null {
  ready();
  const result = spawnSync(BIN, ["lookup", ...attributes(namespace, key)]);
  return valueOf(result.status === 0 ? result.stdout : null);
}

async function readAll(rows: readonly Entry[]): Promise<(Uint8Array | null)[]> {
  ready();
  const found = await runAll(
    BIN,
    rows.map((row) => ["lookup", ...attributes(row.folder, row.name)]),
  );
  return found.map(valueOf);
}

/** `secret-tool store` reads the secret from stdin when that is not a terminal. */
function store(namespace: string, key: string, value?: Uint8Array): void {
  ready();
  const label = `--label=qsm ${namespace === LEGACY_NAMESPACE ? "" : `${namespace}/`}${key}`;
  const stored = spawnSync(BIN, ["store", label, ...attributes(namespace, key)], {
    input: value,
    stdio: value === undefined ? "inherit" : ["pipe", "ignore", "pipe"],
  });
  if (stored.status !== 0) {
    fail("nothing stored", `${BIN} store failed or was cancelled; run qsm-secrets doctor`);
  }
}

function remove(namespace: string, key: string): boolean {
  ready();
  return spawnSync(BIN, ["clear", ...attributes(namespace, key)]).status === 0;
}

function health(namespace: string): Check[] {
  const bin = binCheck(BIN, INSTALL_FIX);
  const owned = daemonOwned();
  const daemon: Check = owned
    ? { name: "Secret Service on the session bus", ok: true, detail: SERVICE, fix: null }
    : {
        name: "Secret Service on the session bus",
        ok: false,
        detail: "no owner",
        fix: START_PROVIDER,
      };
  if (!(bin.ok && owned)) {
    return [bin, daemon];
  }
  const count = entries().filter((entry) => entry.folder === namespace || namespace === "").length;
  return [
    bin,
    daemon,
    { name: `namespace ${namespace}`, ok: true, detail: `${count} entries`, fix: null },
  ];
}

/** Shaped like `Backend`; `backend.ts` is where that is checked. */
export const libsecret = { name: "libsecret", entries, read, readAll, store, remove, health };
