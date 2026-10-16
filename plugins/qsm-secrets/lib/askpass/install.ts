// What the plugin puts on the machine for the askpass path besides its binary: the pane's QML,
// copied where `qs -p` can run it, one `qsm-askpass-<kind>` link per consumer that takes an
// executable path with no arguments, and the person's palette file, written once from the defaults.
// The pane and the links are cleaned before they are written, and named; the palette is the
// person's to edit and is never replaced.

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { linkBin, removeOwnedLinks } from "../../../../lib/install-base.ts";
import type { InstallContext, Step } from "../../../../lib/install-contract.ts";
import { linkedKinds } from "./link.ts";
import { colorsPath, installedPaneDir, LINK_PREFIX } from "./paths.ts";

const BIN = "qsm-secrets";

/** Every file under `dir`, by relative path and bytes, as one hash; null when `dir` is absent. */
function treeHash(dir: string): string | null {
  if (!existsSync(dir)) {
    return null;
  }
  const hash = createHash("sha256");
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true }).toSorted((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else {
        hash.update(path.slice(dir.length)).update(readFileSync(path));
      }
    }
  };
  walk(dir);
  return hash.digest("hex");
}

function paneStep(ctx: InstallContext, source: string): Step {
  const name = "askpass pane";
  const target = installedPaneDir(ctx.env);
  if (treeHash(source) === treeHash(target)) {
    return { name, status: "already", detail: `${target} unchanged` };
  }
  if (ctx.dryRun) {
    return { name, status: "skipped", detail: `would copy ${source} to ${target}` };
  }
  rmSync(target, { recursive: true, force: true });
  mkdirSync(join(target, ".."), { recursive: true });
  cpSync(source, target, { recursive: true });
  return { name, status: "installed", detail: `copied the pane to ${target}` };
}

function colorsStep(ctx: InstallContext, defaults: string): Step {
  const name = "palette";
  const target = colorsPath(ctx.env);
  if (existsSync(target)) {
    return { name, status: "already", detail: `kept your colours at ${target}` };
  }
  if (ctx.dryRun) {
    return { name, status: "skipped", detail: `would write the default colours to ${target}` };
  }
  mkdirSync(dirname(target), { recursive: true });
  cpSync(defaults, target);
  return {
    name,
    status: "installed",
    detail: `wrote the default colours to ${target}; edit it to change them`,
  };
}

function linkSteps(ctx: InstallContext): Step[] {
  const wanted = linkedKinds().map((kind) => `${LINK_PREFIX}${kind}`);
  return [
    ...removeOwnedLinks(ctx, LINK_PREFIX, wanted, BIN),
    ...wanted.map((name) => linkBin(ctx, name, BIN)),
  ];
}

export function askpassSteps(ctx: InstallContext, pluginRoot: string): Step[] {
  const pane = join(pluginRoot, "qml", "askpass");
  return [paneStep(ctx, pane), colorsStep(ctx, join(pane, "colors.json")), ...linkSteps(ctx)];
}
