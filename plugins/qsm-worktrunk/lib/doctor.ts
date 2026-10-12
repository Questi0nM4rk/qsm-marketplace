// The binary check, in one place, because two surfaces ask it: the installer, which refuses to call
// itself installed without it, and the slash command, which an operator runs when something has
// stopped working.

import {
  MINIMUM_WT_VERSION,
  meetsMinimum,
  REQUIRED_SWITCH_FLAGS,
  type Runner,
  supportsWorkspaceCreate,
  wtPath,
  wtVersion,
} from "./wt.ts";

export const INSTALL_HINT =
  "wt ships as a system package: `pacman -S worktrunk`, `brew install worktrunk`, or `cargo install worktrunk`. Then run `wt config shell install` once.";

export const UPGRADE_HINT =
  "Upgrade it through the package manager that put it there, or move a newer wt earlier on PATH.";

/** What the three probes answered, so the report reads without a machine in
 * any of the states it describes. */
export interface Probe {
  /** The line `wt --version` printed, or null when nothing answered. */
  readonly version: string | null;
  /** Whether `wt switch` takes the flags the create path passes. */
  readonly createReady: boolean;
  /** Which binary PATH resolved, when that could be read. */
  readonly path: string | null;
}

export interface DoctorReport {
  readonly healthy: boolean;
  readonly text: string;
}

export function reportFor(probe: Probe): DoctorReport {
  if (probe.version === null) {
    return { healthy: false, text: `qsm-worktrunk: wt is not on PATH. ${INSTALL_HINT}` };
  }
  const found = `${probe.version}${probe.path === null ? "" : ` at ${probe.path}`}`;
  if (!meetsMinimum(probe.version)) {
    return {
      healthy: false,
      text: `qsm-worktrunk: ${found} is too old; this plugin needs wt ${MINIMUM_WT_VERSION} or newer. ${UPGRADE_HINT}`,
    };
  }
  if (!probe.createReady) {
    const flags = REQUIRED_SWITCH_FLAGS.join(" and ");
    return {
      healthy: false,
      text: `qsm-worktrunk: ${found} cannot create a workspace. Its \`wt switch\` does not take ${flags}, the flags this plugin creates a workspace with, so every workspace request would fail. ${UPGRADE_HINT}`,
    };
  }
  return { healthy: true, text: `qsm-worktrunk: healthy, ${found} on PATH.` };
}

export async function doctor(run: Runner, cwd?: string): Promise<DoctorReport> {
  const version = await wtVersion(run, cwd);
  if (version === null) {
    return reportFor({ version: null, createReady: false, path: null });
  }
  return reportFor({
    version,
    createReady: await supportsWorkspaceCreate(run, cwd),
    path: await wtPath(run, cwd),
  });
}
