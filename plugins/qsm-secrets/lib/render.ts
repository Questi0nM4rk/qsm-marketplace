// A template with its secrets filled in, written where only this session's user can read it.

import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runtimeDir } from "../../../lib/paths.ts";
import { fail } from "./errors.ts";
import { resolve } from "./run.ts";
import { CAPTURE_NAMESPACE } from "./substitute.ts";

// `{{secret:<id>}}` is a captured id; `{{secret:<namespace>/<key>}}` is a key from that namespace.
const REFERENCE = /\{\{secret:(?:([\w.-]+)\/)?([\w.-]+)\}\}/g;

const SAFE_NAME = /^[\w][\w.-]*$/;

function safeName(what: string, name: string): string {
  return SAFE_NAME.test(name)
    ? name
    : fail(`not a plain name: ${what}`, "use letters, digits, . _ -", "usage");
}

/** The session's directory, tmpfs and gone at reboot; never a disk path, so no runtime dir is a failure. */
function sessionDir(session: string, env: Record<string, string | undefined>): string {
  const runtime =
    runtimeDir(env) ??
    fail(
      "the runtime directory is not set",
      "a rendered file only lives on tmpfs; log in through a session that sets it",
      "missing",
    );
  return join(runtime, "qsm-secrets", safeName("session", session));
}

/** `render`: writes the template with every reference replaced, mode 0600 in a 0700 directory; returns the path. */
export function runRender(
  templatePath: string,
  out: string,
  session: string,
  env: Record<string, string | undefined>,
): { path: string } {
  if (!existsSync(templatePath)) {
    fail(`no template at ${templatePath}`, "pass the template file's path", "missing");
  }
  const dir = sessionDir(session, env);
  const text = readFileSync(templatePath, "utf8").replace(
    REFERENCE,
    (_, ns: string | undefined, key: string) =>
      new TextDecoder().decode(resolve(ns ?? CAPTURE_NAMESPACE, key)),
  );
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const path = join(dir, safeName("out", out));
  writeFileSync(path, text, { mode: 0o600 });
  chmodSync(path, 0o600);
  return { path };
}

/**
 * `clean`: the session's directory, and everything the session rendered, removed. With no
 * runtime directory render could not have written anywhere, so there is nothing to remove and no
 * failure: a session end runs in sessions (background, headless) that never had one.
 */
export function runClean(
  session: string,
  env: Record<string, string | undefined>,
): { dir: string | null } {
  if (runtimeDir(env) === undefined) {
    return { dir: null };
  }
  const dir = sessionDir(session, env);
  rmSync(dir, { recursive: true, force: true });
  return { dir };
}
