// The one machine an installer test runs on: a sandbox home, a probe that finds only the commands
// the test names, and a run that logs each command instead of running it. Every path qsm computes
// bends to this environment (lib/paths.ts), so an installer under test writes none of qsm's files in
// the real home; only bun itself, run by a compile or a dependency step, keeps its own package cache.
import { join } from "node:path";
import type { InstallContext } from "../install-contract.ts";
import { isolatedEnv } from "./cli.ts";
import { sandboxDir } from "./sandbox.ts";

export interface FakeInstall {
  readonly ctx: InstallContext;
  /** every command `run` received, in order */
  readonly runs: string[][];
  readonly home: string;
}

export function fakeInstall(
  opts: {
    /** the commands `probe` finds, or a function that decides; none when absent */
    readonly present?: readonly string[] | ((cmd: string) => boolean);
    readonly dryRun?: boolean;
    readonly force?: boolean;
    /** variables on top of the sandbox ones, such as `GOBIN` */
    readonly env?: Readonly<Record<string, string>>;
    /** the exit code of each run; 0 when absent */
    readonly exit?: number | ((cmd: string, args: readonly string[]) => number);
  } = {},
): FakeInstall {
  const home = sandboxDir("qsm-install-");
  const present = opts.present ?? [];
  const runs: string[][] = [];
  const ctx: InstallContext = {
    dryRun: opts.dryRun ?? false,
    ...(opts.force === undefined ? {} : { force: opts.force }),
    env: isolatedEnv(home, { QSM_BIN_DIR: join(home, "bin"), ...opts.env }),
    probe: typeof present === "function" ? present : (cmd) => present.includes(cmd),
    run: (cmd, args) => {
      runs.push([cmd, ...args]);
      return typeof opts.exit === "function" ? opts.exit(cmd, args) : (opts.exit ?? 0);
    },
  };
  return { ctx, runs, home };
}
