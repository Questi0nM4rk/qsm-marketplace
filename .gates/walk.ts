import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const root = resolve(import.meta.dir, "..");
export const pluginsDir = resolve(root, "plugins");

export function rel(path: string): string {
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path;
}

/** The parsed JSON file at path, to be narrowed by the caller, or null when there is none. */
export function readJson(path: string): unknown {
  if (!existsSync(path)) {
    return null;
  }
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return parsed;
}

/** A parsed JSON object: not null, not an array. The gates' narrowing of what readJson returns. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Every file under dir, recursively, skipping node_modules and dist. */
export function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) {
    return;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") {
      continue;
    }
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

/** plugins/<name> directories. */
export function pluginDirs(): string[] {
  if (!existsSync(pluginsDir)) {
    return [];
  }
  return readdirSync(pluginsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => resolve(pluginsDir, e.name));
}

/** plugins/<name> directories without a manifest: invisible to every other gate. */
export function manifestlessPlugins(dir = pluginsDir): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (e) => e.isDirectory() && !existsSync(resolve(dir, e.name, ".claude-plugin/plugin.json")),
    )
    .map((e) => e.name);
}

/** Warnings print and never fail the gate; findings fail it. */
export function report(gate: string, findings: string[], warnings: string[] = []): never {
  for (const w of warnings) {
    console.error(`${gate}: warning: ${w}`);
  }
  if (findings.length > 0) {
    console.error(`${gate}: ${findings.length} finding(s)`);
    for (const f of findings) {
      console.error(`  ${f}`);
    }
    process.exit(1);
  }
  console.log(`${gate}: OK`);
  process.exit(0);
}
