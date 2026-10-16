// What every classic command hook does the same way: read the harness's JSON payload on stdin, and
// run its body so that it never crashes and never blocks the caller.

import { readFileSync } from "node:fs";

/** The stdin payload, or null when it is missing or not JSON; the caller checks every field it reads. */
export function readHookEvent(): unknown {
  try {
    const event: unknown = JSON.parse(readFileSync(0, "utf8"));
    return event;
  } catch {
    return null;
  }
}

async function runHook(main: () => Promise<void>, log: (msg: string) => void): Promise<never> {
  try {
    await main();
  } catch (error) {
    log(`unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exit(0);
}

/** The tail of a classic hook file: run `main` as the hook when the file is the entry point, never
 * when a test imports it. */
export async function runMain(
  isMain: boolean,
  main: () => void | Promise<void>,
  log: (msg: string) => void,
): Promise<void> {
  if (isMain) {
    await runHook(() => Promise.resolve(main()), log);
  }
}
