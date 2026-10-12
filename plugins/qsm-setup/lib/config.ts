// The machine's setup configuration: whether this machine opts into auto-relink at session start,
// where the marketplace checkout is, and any saved profiles (named plugin lists).
import { existsSync, readFileSync } from "node:fs";
import { type Env, setupConfigPath } from "../../../lib/paths.ts";

export interface SetupConfig {
  readonly autoRelink?: boolean;
  readonly marketplaceRoot?: string;
  readonly profiles?: Readonly<Record<string, readonly string[]>>;
}

export function readConfig(env: Env): SetupConfig {
  const path = setupConfigPath(env);
  if (!existsSync(path)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SetupConfig;
  } catch {
    return {};
  }
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
