// Where the pane's files live once installed.

import { join } from "node:path";
import { configDir, dataDir, type Env } from "../../../../lib/paths.ts";

/** Where install puts the pane's QML; it never reads `QSM_ASKPASS_QML`, because it replaces what is there. */
export function installedPaneDir(env: Env): string {
  return join(dataDir(env), "qsm", "askpass", "qml");
}

/** The pane's QML directory, which `qs -p` runs; `QSM_ASKPASS_QML` overrides, for tests and a live run. */
export function paneDir(env: Env): string {
  return env.QSM_ASKPASS_QML ?? installedPaneDir(env);
}

/** The prefix of every link the installer makes in the bin directory. */
export const LINK_PREFIX = "qsm-askpass-";

/** The person's qsm palette, which overrides the pane's default colours; `QSM_COLORS` overrides. */
export function colorsPath(env: Env): string {
  return env.QSM_COLORS ?? join(configDir(env), "qsm-marketplace", "colors.json");
}
