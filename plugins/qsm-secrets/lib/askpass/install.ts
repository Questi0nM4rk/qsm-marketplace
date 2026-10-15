// What the plugin puts on the machine for the askpass path besides its binary: the pane's QML,
// copied where `qs -p` can run it, one `qsm-askpass-<kind>` link per consumer that takes an
// executable path with no arguments, and the person's palette file, written once from the defaults.
// The pane and the links are cleaned before they are written, and named; the palette is the
// person's to edit and is never replaced.

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { InstallContext, Step } from "../../../../lib/install-contract.ts";
import { binDir } from "../../../../lib/paths.ts";
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

/** Whether `path` is a link to our binary: the only thing this installer ever removes or replaces. */
function isOurLink(path: string): boolean {
  return lstatSync(path).isSymbolicLink() && readlinkSync(path) === BIN;
}

function linkSteps(ctx: InstallContext): Step[] {
  const dir = binDir(ctx.env);
  const wanted = linkedKinds().map((kind) => `${LINK_PREFIX}${kind}`);
  const steps: Step[] = [];
  const present = existsSync(dir) ? readdirSync(dir).filter((n) => n.startsWith(LINK_PREFIX)) : [];
  for (const name of present.filter((n) => !wanted.includes(n))) {
    const path = join(dir, name);
    if (!isOurLink(path)) {
      continue;
    }
    if (!ctx.dryRun) {
      unlinkSync(path);
    }
    steps.push({
      name: `link ${name}`,
      status: ctx.dryRun ? "skipped" : "installed",
      detail: `${ctx.dryRun ? "would remove" : "removed"} the stale link ${path}`,
    });
  }
  for (const name of wanted) {
    const path = join(dir, name);
    const here = lstatSync(path, { throwIfNoEntry: false }) !== undefined;
    if (here && !isOurLink(path)) {
      steps.push({
        name: `link ${name}`,
        status: "error",
        detail: `${path} exists and is not our link; remove it`,
      });
    } else if (here) {
      steps.push({ name: `link ${name}`, status: "already", detail: `${path} unchanged` });
    } else if (ctx.dryRun) {
      steps.push({
        name: `link ${name}`,
        status: "skipped",
        detail: `would link ${path} to ${BIN}`,
      });
    } else {
      mkdirSync(dir, { recursive: true });
      symlinkSync(BIN, path);
      steps.push({ name: `link ${name}`, status: "installed", detail: `linked ${path} to ${BIN}` });
    }
  }
  return steps;
}

export function askpassSteps(ctx: InstallContext, pluginRoot: string): Step[] {
  const pane = join(pluginRoot, "qml", "askpass");
  return [paneStep(ctx, pane), colorsStep(ctx, join(pane, "colors.json")), ...linkSteps(ctx)];
}
