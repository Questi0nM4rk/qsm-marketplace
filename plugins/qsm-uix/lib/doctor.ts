// The external tools the verbs measure through, as the installer names them: the screenshot tool
// captures, the image tool reads and compares, the key sender drives the UI an audit tabs through.
import type { RequiredTool } from "../../../lib/outcome.ts";
import { KEY_SENDER, KEY_SENDER_HINT } from "./atspi.ts";
import { IMAGE_TOOL, SCREENSHOT_TOOL } from "./capture.ts";

export const UPSTREAM: readonly RequiredTool[] = [
  {
    cmd: SCREENSHOT_TOOL,
    hint: `install ${SCREENSHOT_TOOL} with the system package manager (package: grim)`,
    // screenshot and burst only
    optional: true,
  },
  {
    cmd: IMAGE_TOOL,
    hint: `install ${IMAGE_TOOL} with the system package manager (package: imagemagick)`,
  },
  // the key sender an a11y-audit drives a UI with, e.g. `wtype -k Tab`
  { cmd: KEY_SENDER, hint: KEY_SENDER_HINT },
];
