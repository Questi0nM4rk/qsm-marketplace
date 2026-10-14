#!/usr/bin/env bun

// qsm-secrets: a credential reaches the command that needs it without its value reaching the agent.

import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Call, type Handler, runCli } from "../../../lib/cli-base.ts";
import { spawnDetached } from "../../../lib/detach.ts";
import { fail, type Outcome, ok } from "../../../lib/outcome.ts";
import { stateDir } from "../../../lib/paths.ts";
import type { QsmManifest } from "../../../lib/qsm-manifest.ts";
import { activeBackend } from "../lib/backend.ts";
import { formatChecks } from "../lib/doctor.ts";
import { fail as raise, SecretError } from "../lib/errors.ts";
import { guardCommand } from "../lib/guard.ts";
import { runClean, runRender } from "../lib/render.ts";
import {
  type Delivery,
  runCapture,
  runCheck,
  runEnv,
  runGet,
  runHas,
  runInspect,
  runList,
  runMask,
  runMaskAll,
  runPipe,
  runPrune,
  runRemove,
  runRename,
  runScrub,
  runSet,
} from "../lib/run.ts";
import { namespaceOf, parseEnvPair } from "../lib/vault.ts";
import manifestJson from "../qsm.json" with { type: "json" };

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the JSON import is typed by its literal values; a checked parse of qsm.json belongs in root lib/qsm-manifest.ts
const manifest = manifestJson as QsmManifest;

/**
 * The three verbs that carry a value refuse `--json` outright: a value must never be serialised,
 * and a consumer's own stdout would corrupt the envelope besides.
 */
const NO_JSON = "a secret value never prints as JSON; use pipe or env";

/** A string argument, or undefined when it was not given. qsm.json declares the type, so another
 * type is a usage error rather than a cast. */
function optionalText(call: Call, name: string): string | undefined {
  const value = call.args[name];
  if (value !== undefined && typeof value !== "string") {
    return usageError(`--${name} takes text`);
  }
  return value;
}

/** A string argument the verb requires; the parser already refused a missing one. */
function requiredText(call: Call, name: string): string {
  const value = optionalText(call, name);
  return value ?? usageError(`${name} is required`);
}

/** A repeatable argument: the list, empty when it was not given. */
function texts(call: Call, name: string): string[] {
  const value = call.args[name];
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : usageError(`--${name} takes text`);
}

function usageError(message: string): never {
  return raise(message, "see qsm-secrets --help", "usage");
}

function namespace(call: Call): string {
  return namespaceOf(optionalText(call, "folder"), process.env);
}

function key(call: Call): string {
  return requiredText(call, "key");
}

/** A SecretError carries its own outcome code and the next step; anything
 * else is a bug and keeps travelling. */
function attempt(run: () => Outcome): Outcome {
  try {
    return run();
  } catch (error) {
    if (error instanceof SecretError) {
      return fail(error.code, `${error.message}\n  next: ${error.next}`);
    }
    throw error;
  }
}

/** ok when the consumer succeeded; its own code is data either way,
 * because the process exit belongs to the outcome table now. */
function delivered(d: Delivery): Outcome<Delivery> {
  return d.exit === 0 ? ok(d) : fail("failed", `${d.command} exited ${d.exit}`, d);
}

const pipe: Handler = (call) =>
  call.json
    ? fail("blocked", NO_JSON)
    : attempt(() => delivered(runPipe(namespace(call), key(call), call.rest)));

const env: Handler = (call) => {
  if (call.json) {
    return fail("blocked", NO_JSON);
  }
  const pair = parseEnvPair(requiredText(call, "pair"));
  if (pair === null) {
    return fail("usage", "env takes <key>=<ENVVAR>, where ENVVAR is a valid variable name");
  }
  return attempt(() => delivered(runEnv(namespace(call), pair.key, pair.variable, call.rest)));
};

/** The probe runs like env but its output is discarded: only its exit code is the answer. */
const probe: Handler = (call) => {
  const pair = parseEnvPair(requiredText(call, "pair"));
  if (pair === null) {
    return fail("usage", "check takes <key>=<ENVVAR>, where ENVVAR is a valid variable name");
  }
  return attempt(() => {
    const d = runCheck(namespace(call), pair.key, pair.variable, call.rest);
    return d.exit === 0
      ? ok(d, `ok: ${d.command}`)
      : fail("failed", `failed: ${d.command} exited ${d.exit}`, d);
  });
};

const rename: Handler = (call) =>
  attempt(() => {
    const from = { namespace: namespace(call), key: requiredText(call, "from") };
    const to = {
      namespace: optionalText(call, "toFolder") ?? from.namespace,
      key: requiredText(call, "to"),
    };
    const done = runRename(from, to);
    return ok(done, `renamed ${done.from} to ${done.to}`);
  });

const prune: Handler = (call) =>
  attempt(() => {
    const done = runPrune(call.args.dryRun === true);
    return ok(done, done.ids.length === 0 ? undefined : done.ids.join("\n"));
  });

const get: Handler = (call) =>
  call.json ? fail("blocked", NO_JSON) : attempt(() => ok(runGet(namespace(call), key(call))));

const set: Handler = (call) =>
  attempt(() => {
    const stored = runSet(namespace(call), key(call));
    return ok(stored, `stored ${stored.key}`);
  });

const has: Handler = (call) =>
  attempt(() => {
    const ns = namespace(call);
    const name = key(call);
    const stored = runHas(ns, name);
    return stored
      ? ok({ namespace: ns, key: name, stored })
      : fail("missing", `not stored: ${name}`, { namespace: ns, key: name, stored });
  });

const list: Handler = (call) =>
  attempt(() => {
    const listed = runList(namespace(call));
    return ok(listed, listed.keys.length === 0 ? undefined : listed.keys.join("\n"));
  });

const inspect: Handler = (call) =>
  attempt(() => {
    const { text, ...data } = runInspect(namespace(call));
    return ok(data, text);
  });

const rm: Handler = (call) =>
  attempt(() => {
    const removed = runRemove(namespace(call), key(call));
    return ok(removed, `removed ${removed.key}`);
  });

/** The text on stdin with each secret swapped for its id; the values never leave the backend. */
const capture: Handler = () =>
  attempt(() => {
    const done = runCapture();
    return ok(done, done.text);
  });

/**
 * The text on stdin with each named id's value swapped for its placeholder; plain text out. With
 * --all, a JSON array of strings with every stored value of every namespace masked.
 */
const mask: Handler = (call) =>
  attempt(() => {
    if (call.args.all === true) {
      const masked = runMaskAll();
      return ok(masked, JSON.stringify(masked.texts));
    }
    const ids = texts(call, "id");
    if (ids.length === 0) {
      return fail("usage", "mask takes at least one --id, or --all");
    }
    const masked = runMask(ids);
    return ok(masked, masked.text);
  });

/** A transcript's captured values swapped for their placeholders; detached for a hook's 1.5 s. */
const scrub: Handler = (call) =>
  attempt(() => {
    const target = requiredText(call, "transcript");
    if (call.args.detach !== true) {
      const done = runScrub(target);
      return ok(done, `scrubbed ${done.scrubbed} value(s) in ${done.path}`);
    }
    const log = join(stateDir(process.env), "secrets-scrub.log");
    mkdirSync(dirname(log), { recursive: true, mode: 0o700 });
    const failure = spawnDetached(
      "qsm-secrets",
      ["scrub", target],
      { file: log, append: true },
      process.env,
    );
    return failure === null
      ? ok(
          { started: true, log },
          `started the scrub in the background; its outcome goes to ${log}`,
        )
      : fail("missing", failure);
  });

/** The Bash command on stdin, refused with its code and the verb to use instead, or allowed. */
const guard: Handler = async () => {
  if (process.stdin.isTTY) {
    return fail("usage", "guard reads the Bash command from stdin; pipe it in");
  }
  const refusal = await guardCommand(readFileSync(0, "utf8"), {
    home: process.env.HOME,
    dataHome: process.env.XDG_DATA_HOME,
    runtimeDir: process.env.XDG_RUNTIME_DIR,
  });
  return refusal === null ? ok({ denied: false }) : fail("blocked", refusal.reason, refusal);
};

/** The session a render or clean belongs to: `--session`, else the id the engine sets for Bash. */
function inSession(call: Call, run: (session: string) => Outcome): Outcome {
  const id = optionalText(call, "session") ?? process.env.CLAUDE_CODE_SESSION_ID;
  return id === undefined
    ? fail("usage", "pass --session <id>; CLAUDE_CODE_SESSION_ID is not set")
    : attempt(() => run(id));
}

/** Only the path prints: the file holds values, and the caller reads it with the tool that needs it. */
const render: Handler = (call) =>
  inSession(call, (id) => {
    const done = runRender(
      requiredText(call, "template"),
      requiredText(call, "out"),
      id,
      process.env,
    );
    return ok(done, done.path);
  });

const clean: Handler = (call) =>
  inSession(call, (id) => {
    const done = runClean(id, process.env);
    return ok(
      done,
      done.dir === null ? "nothing to remove: XDG_RUNTIME_DIR is not set" : `removed ${done.dir}`,
    );
  });

/**
 * Every check probes a prerequisite: the backend on PATH, an account, an unlocked vault, an
 * editor, a listable namespace.
 */
const doctor: Handler = (call) =>
  attempt(() => {
    const ns = namespace(call);
    const checks = activeBackend().health(ns, process.env);
    const healthy = checks.every((check) => check.ok);
    const data = { namespace: ns, checks, ok: healthy };
    return healthy ? ok(data, formatChecks(checks)) : fail("missing", formatChecks(checks), data);
  });

if (import.meta.main) {
  process.exit(
    await runCli(manifest, "qsm-secrets", {
      pipe,
      env,
      set,
      has,
      list,
      inspect,
      rm,
      rename,
      prune,
      check: probe,
      get,
      doctor,
      capture,
      guard,
      mask,
      scrub,
      render,
      clean,
    }),
  );
}
