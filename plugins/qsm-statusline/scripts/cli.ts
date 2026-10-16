#!/usr/bin/env bun

// qsm-statusline: the renderer the harness calls once per frame, plus the two verbs that keep it
// honest.

import { spawn } from "node:child_process";
import { basename } from "node:path";
import {
  type Call,
  flagArg,
  type Handler,
  optionalString,
  readStdin,
  runCli,
} from "../../../lib/cli-base.ts";
import { checkTools, doctorVerdict, type Outcome, ok, onPath } from "../../../lib/outcome.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import { cacheDir } from "../lib/cache.ts";
import { gitState } from "../lib/git.ts";
import {
  abandonRefresh,
  claimRefresh,
  gitCacheName,
  resolveGit,
  storeGit,
} from "../lib/gitcache.ts";
import { parsePayload } from "../lib/payload.ts";
import { render } from "../lib/render.ts";
import { describe, readStatusLine, STATUS_LINE_ENTRY, settingsPath } from "../lib/settings.ts";
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = parseManifest(manifestJson, "qsm-statusline/qsm.json");

/** How long a cached git state is served before a refresh is started behind
 * the frame. Counters this stale are invisible; a render that waits is not. */
const GIT_MAX_AGE_MS = 2000;
const MILLIS_PER_SECOND = 1000;

/**
 * The renderer's own binary, invoked the way this process was: compiled, the executable is the
 * binary itself; run from source, it is bun plus this script.
 */
function selfCommand(): string[] {
  return basename(process.execPath) === "bun"
    ? [process.execPath, import.meta.path]
    : [process.execPath];
}

/**
 * Detached, with every stream closed and the handle unreferenced, so this process exits the moment
 * its lines are printed.
 */
function startRefresh(dir: string, cwd: string, now: number): void {
  if (!claimRefresh(dir, cwd, now)) {
    return;
  }
  const [command, ...head] = selfCommand();
  if (command === undefined) {
    abandonRefresh(dir, cwd);
    return;
  }
  try {
    const child = spawn(command, [...head, "refresh", "--cwd", cwd], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    // A refresh that could not start is one frame without fresher counters.
    abandonRefresh(dir, cwd);
  }
}

/** The render never fails: every source it reads is allowed to be absent, so
 * there is nothing for it to report but the rows it drew. */
const renderVerb: Handler = async (call: Call): Promise<Outcome> => {
  const snapshot = parsePayload(await readStdin());
  const nowMs = Date.now();
  const cwd = optionalString(call, "cwd") ?? snapshot.cwd ?? process.cwd();
  const dir = cacheDir(process.env);
  const git = resolveGit(dir, cwd, nowMs, GIT_MAX_AGE_MS);
  if (git.stale) {
    startRefresh(dir, cwd, nowMs);
  }
  const lines = render({
    snapshot,
    git: git.state,
    now: Math.floor(nowMs / MILLIS_PER_SECOND),
    // --json is read by a program, and escape sequences in a JSON payload are
    // every consumer's to strip.
    color: !flagArg(call, "noColor") && !call.json,
  });
  return ok({ lines }, lines.join("\n"));
};

/** The background half of the render. */
const refreshVerb: Handler = (call: Call): Outcome => {
  const cwd = optionalString(call, "cwd") ?? process.cwd();
  const dir = cacheDir(process.env);
  const name = gitCacheName(cwd);
  const state = gitState(cwd);
  const stored = storeGit(dir, cwd, state, Date.now());
  const cached = state === null ? `${cwd}: no git state` : `${cwd}: cached as ${name}`;
  const message = stored ? cached : `${cwd}: the cache directory could not be written`;
  return ok({ cwd, cache: name, stored, git: state }, message);
};

const INSTALL_HINT = "run qsm-setup install qsm-statusline";

/** doctor is `missing` when the binary the status line runs is not on PATH; an unwired
 * settings entry is only reported, so a status line nobody has wired yet never fails. */
const doctorVerb: Handler = (call: Call): Outcome => {
  const path = optionalString(call, "settings") ?? settingsPath(process.env);
  const state = readStatusLine(path);
  const binary = onPath("qsm-statusline");
  const lines = [`settings: ${path}`, `state: ${describe(state)}`];
  if (state.kind !== "wired") {
    lines.push(`entry: "statusLine": ${JSON.stringify(STATUS_LINE_ENTRY)}`);
  }
  lines.push(
    `binary: ${binary ? "qsm-statusline answers on PATH" : "qsm-statusline is not on PATH"}`,
  );
  const data = { settings: path, state, entry: STATUS_LINE_ENTRY, onPath: binary };
  return binary
    ? ok(data, lines.join("\n"))
    : doctorVerdict("qsm-statusline", checkTools([{ cmd: "qsm-statusline", hint: INSTALL_HINT }]));
};

if (import.meta.main) {
  process.exit(
    await runCli(manifest, "qsm-statusline", {
      render: renderVerb,
      refresh: refreshVerb,
      doctor: doctorVerb,
    }),
  );
}
