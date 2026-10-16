// The marketplace checkout every qsm-setup verb works on, and what an older qsm left on this machine
// as seen from it.
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { type Call, optionalString } from "../../../lib/cli-base.ts";
import { fail, isRecord, type Outcome } from "../../../lib/outcome.ts";
import type { Env } from "../../../lib/paths.ts";
import { readConfig } from "../lib/config.ts";
import { discoverPlugins, type PluginNode } from "../lib/discover.ts";
import { type PurgeReport, purge } from "../lib/purge.ts";

const env: Env = process.env;

/** The checkout every verb works on, or why there is none. A root that holds no plugin is a wrong
 * root, except for `relink`, which prunes the bins of plugins that are gone. */
export function withRoot<T extends Outcome | Promise<Outcome>>(
  call: Call,
  verb: (nodes: readonly PluginNode[], root: string) => T,
  allowEmpty = false,
): T | Outcome {
  const root =
    optionalString(call, "root") ?? env.QSM_MARKETPLACE ?? readConfig(env).marketplaceRoot;
  if (root === undefined) {
    return fail(
      "missing",
      "no marketplace root: pass --root, set QSM_MARKETPLACE, or write marketplaceRoot into setup.json",
    );
  }
  const nodes = discoverPlugins(root);
  return nodes.length === 0 && !allowEmpty
    ? fail("missing", `${root} holds no plugins`)
    : verb(nodes, root);
}

function marketplaceName(path: string): string {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(parsed) || typeof parsed.name !== "string") {
    throw new Error(`${path} has no name`);
  }
  return parsed.name;
}

/** What an older qsm left on this machine, as `purge` finds it; `check` only reports. */
export function purgeMachine(
  nodes: readonly PluginNode[],
  dir: string,
  check: boolean,
): PurgeReport {
  const root = resolve(dir);
  const marketplace = join(root, ".claude-plugin", "marketplace.json");
  const name = existsSync(marketplace) ? marketplaceName(marketplace) : "qsm-marketplace";
  return purge({
    env,
    root,
    marketplace: name,
    plugins: new Set(nodes.map((n) => n.name)),
    check,
  });
}

export function describePurge(r: PurgeReport, check: boolean): string[] {
  const verb = check ? "would remove" : "removed";
  return [...r.found.map((f) => `${verb} ${f}`), ...r.blocked.map((b) => `blocked: ${b}`)];
}
