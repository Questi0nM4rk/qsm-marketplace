// The bin farm of the retired layout, `<data>/qsm/bin`: symlinks that shadow the compiled binaries
// on PATH. The install base and qsm-setup's purge both remove it through this one function.
import { existsSync, lstatSync, readdirSync, rmdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { dataDir, type Env } from "./paths.ts";

export interface FarmReport {
  /** the farm, removed, or with `check` what would be removed: empty when there is none */
  readonly found: readonly string[];
  /** left alone because it holds something we did not put there */
  readonly blocked: readonly string[];
}

function isLink(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() === true;
}

/** Removes the farm when every entry in it is a symlink; with `check` only reports it. */
export function purgeFarm(env: Env, check: boolean): FarmReport {
  const root = join(dataDir(env), "qsm");
  const farm = join(root, "bin");
  if (!existsSync(farm)) {
    return { found: [], blocked: [] };
  }
  const foreign = readdirSync(farm).filter((n) => !isLink(join(farm, n)));
  if (foreign.length > 0) {
    const blocked = `${farm} holds files that are not links: ${foreign.join(", ")}; remove them`;
    return { found: [], blocked: [blocked] };
  }
  if (!check) {
    rmSync(farm, { recursive: true });
    try {
      rmdirSync(root);
    } catch {
      // other content stays; only the farm was ours
    }
  }
  return { found: [`legacy bin farm ${root}`], blocked: [] };
}
