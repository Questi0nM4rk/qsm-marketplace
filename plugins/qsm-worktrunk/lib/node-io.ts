// The Runner lib/wt.ts asks for and the StoreIo lib/task-store.ts asks for, answered for real.

import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { StoreIo } from "./task-store.ts";
import type { CommandResult, Runner } from "./wt.ts";

/**
 * `spawnSync`'s answer as the `Runner` shape it promises: a process that never started (the binary
 * is not on PATH) answers exit 1, with `spawnSync`'s own error message standing in for stderr.
 */
function resultOf(result: SpawnSyncReturns<string>): CommandResult {
  if (result.error !== undefined) {
    return { exitCode: 1, stdout: "", stderr: result.error.message };
  }
  return { exitCode: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** Runs `argv` with `spawnSync`, the same shape a shell answers with. */
export function nodeRunner(): Runner {
  return (argv, cwd) => {
    const [command, ...args] = argv;
    return Promise.resolve(resultOf(spawnSync(command ?? "", args, { cwd, encoding: "utf8" })));
  };
}

/**
 * The real filesystem, with the write side making the directory the redirect file sits in first: a
 * classic hook has no engine underneath it to do that for it.
 */
export function nodeStoreIo(): StoreIo {
  return {
    exists: (path) => Promise.resolve(existsSync(path)),
    write: (path, text) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      return Promise.resolve();
    },
  };
}
