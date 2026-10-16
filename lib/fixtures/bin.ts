// Fake executables for a test's PATH.
import { chmodSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** An executable `name` in `dir` whose body is `sh`; returns its path. */
export function fakeBin(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

/** A `name` in `dir` that runs the bun script `script`, as an installed binary would. */
export function cliShim(dir: string, name: string, script: string): string {
  return fakeBin(dir, name, `exec "${process.execPath}" "${script}" "$@"`);
}

/** A PATH holding only the runtime, for the test of a tool that is missing. */
export function bareRuntimePath(): string {
  return dirname(process.execPath);
}
