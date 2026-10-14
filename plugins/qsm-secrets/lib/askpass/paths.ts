// Where the pane's files live once installed.

import { join } from "node:path";
import { type Env, home } from "../../../../lib/paths.ts";

/** The pane's QML directory, which `qs -p` runs; `QSM_ASKPASS_QML` overrides. */
export function paneDir(env: Env): string {
  const base = env.XDG_DATA_HOME ?? join(home(env), ".local", "share");
  return env.QSM_ASKPASS_QML ?? join(base, "qsm", "askpass", "qml");
}

/** The prefix of every link the installer makes in the bin directory. */
export const LINK_PREFIX = "qsm-askpass-";
