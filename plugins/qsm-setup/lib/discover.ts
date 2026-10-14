// What the marketplace holds: one node per plugin directory that carries a plugin.json.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { CommandDecl } from "../../../lib/qsm-manifest.ts";
import { commandDecls, isRecord, stringRecord } from "./json.ts";

export interface PluginNode {
  readonly name: string;
  readonly dir: string;
  readonly dependencies: readonly string[];
  /** scripts/install.ts, the plugin's own install and build step. */
  readonly installer: string | null;
  /** scripts/activate.ts, the plugin's changes to files the user owns. */
  readonly activation: string | null;
  /** bin name to source entry, from qsm.json. */
  readonly bins: Readonly<Record<string, string>>;
  /** "<bin> <verb>" to its declaration, from qsm.json. */
  readonly commands: Readonly<Record<string, CommandDecl>>;
  /** A shell probe that exits 0 when the plugin is healthy. */
  readonly doctor: string | null;
}

function readQsm(dir: string): Pick<PluginNode, "bins" | "commands" | "doctor"> {
  const path = join(dir, "qsm.json");
  if (!existsSync(path)) {
    return { bins: {}, commands: {}, doctor: null };
  }
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  const qsm = isRecord(raw) && isRecord(raw.qsm) ? raw.qsm : {};
  const commands = Object.fromEntries(
    Object.entries(commandDecls(qsm.commands)).map(([key, value]): [string, CommandDecl] => [
      key,
      { description: value.description, args: value.args ?? [] },
    ]),
  );
  return {
    bins: stringRecord(qsm.bin),
    commands,
    doctor: typeof qsm.doctor === "string" ? qsm.doctor : null,
  };
}

export function discoverPlugins(root: string): PluginNode[] {
  const base = resolve(root, "plugins");
  if (!existsSync(base)) {
    return [];
  }
  const nodes: PluginNode[] = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dir = join(base, entry.name);
    const manifestPath = join(dir, ".claude-plugin", "plugin.json");
    if (!existsSync(manifestPath)) {
      continue;
    }
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
    const dependencies =
      isRecord(manifest) && Array.isArray(manifest.dependencies)
        ? manifest.dependencies.filter((x): x is string => typeof x === "string")
        : [];
    const installerPath = join(dir, "scripts", "install.ts");
    const activationPath = join(dir, "scripts", "activate.ts");
    nodes.push({
      name: entry.name,
      dir,
      dependencies,
      installer: existsSync(installerPath) ? installerPath : null,
      activation: existsSync(activationPath) ? activationPath : null,
      ...readQsm(dir),
    });
  }
  return nodes.sort((a, b) => a.name.localeCompare(b.name));
}
