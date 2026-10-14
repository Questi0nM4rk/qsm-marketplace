// The machine's setup configuration: whether this machine opts into auto-relink at session start,
// where the marketplace checkout is, and any saved profiles (named plugin lists).
import { existsSync, readFileSync } from "node:fs";
import { type Env, setupConfigPath } from "../../../lib/paths.ts";
import { isRecord } from "../../../lib/outcome.ts";

export interface SetupConfig {
  readonly autoRelink?: boolean;
  readonly marketplaceRoot?: string;
  readonly profiles?: Readonly<Record<string, readonly string[]>>;
}

function isStringList(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

/** A profile that is not a list of plugin names is a defect in the file: it names the profile. */
function toConfig(raw: unknown): SetupConfig {
  if (!isRecord(raw)) {
    return {};
  }
  const profiles: Record<string, readonly string[]> = {};
  if (isRecord(raw.profiles)) {
    for (const [name, list] of Object.entries(raw.profiles)) {
      if (!isStringList(list)) {
        throw new Error(`setup config: profile ${name} is not a list of plugin names`);
      }
      profiles[name] = list;
    }
  }
  return {
    ...(typeof raw.autoRelink === "boolean" ? { autoRelink: raw.autoRelink } : {}),
    ...(typeof raw.marketplaceRoot === "string" ? { marketplaceRoot: raw.marketplaceRoot } : {}),
    ...(isRecord(raw.profiles) ? { profiles } : {}),
  };
}

export function readConfig(env: Env): SetupConfig {
  const path = setupConfigPath(env);
  if (!existsSync(path)) {
    return {};
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
  return toConfig(raw);
}

const NOT_IN_GENERAL = new Set(["qsm-builder"]);

/** The general profile is every discovered plugin except the ones that
 * install at project scope only. */
function generalProfile(names: readonly string[]): string[] {
  return names.filter((n) => !NOT_IN_GENERAL.has(n));
}

export function resolveProfile(
  name: string,
  discovered: readonly string[],
  config: SetupConfig,
): string[] {
  if (name === "general") {
    return generalProfile(discovered);
  }
  const saved = config.profiles?.[name];
  if (saved === undefined) {
    throw new Error(`unknown profile: ${name}`);
  }
  return [...saved];
}
