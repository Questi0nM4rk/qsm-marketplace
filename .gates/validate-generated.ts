// Every plugin with a qsm.json binary commits two files derived from it, types/index.d.ts and
// hooks/noun.generated.ts, and plugin.json names the types file. The root README's lens block and
// the banners are generated too, by `qsm-builder lens readme`.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { checkNoun } from "../lib/generate-noun.ts";
import { ManifestError, parseManifest, type QsmManifest, toCamel } from "../lib/qsm-manifest.ts";
import { isRecord, pluginDirs, readJson, rel, report, root } from "./walk.ts";

export interface PluginFiles {
  readonly manifest: QsmManifest;
  readonly pluginJson: { readonly types?: string } | null;
  readonly readFile: (path: string) => string | null;
}

/** The types path plugin.json names, or null when it names none. */
function pluginJsonOf(v: unknown): PluginFiles["pluginJson"] {
  if (!isRecord(v)) {
    return null;
  }
  return typeof v.types === "string" ? { types: v.types } : {};
}

/** Findings for one plugin directory; empty when it agrees with qsm.json. */
export function generatedFindings(pluginDir: string, files: PluginFiles): string[] {
  const name = basename(pluginDir);
  const bins = Object.keys(files.manifest.qsm.bin ?? {});
  if (bins.length === 0) {
    return [];
  }
  const findings = [
    ...namingFindings(name, bins, files.manifest.qsm.noun),
    ...verbFindings(name, bins, Object.keys(files.manifest.qsm.commands)),
  ];
  if (files.pluginJson?.types !== "./types/index.d.ts") {
    findings.push(`${name}: plugin.json must name "types": "./types/index.d.ts"`);
  }
  if (files.manifest.qsm.noun === undefined) {
    return findings;
  }
  for (const path of checkNoun(files.manifest, pluginDir, files.readFile).stale) {
    const state = files.readFile(path) === null ? "missing" : "stale";
    findings.push(
      `${name}: ${rel(path)} is ${state}; run bun lib/generate-noun.ts ${rel(pluginDir)}`,
    );
  }
  return findings;
}

/** Every binary has verbs, one of them `doctor`, and every verb names a
 * declared binary. */
function verbFindings(name: string, bins: readonly string[], verbs: readonly string[]): string[] {
  const findings: string[] = [];
  for (const bin of bins) {
    if (!verbs.some((k) => k.startsWith(`${bin} `))) {
      findings.push(`${name}: bin ${bin} declares no commands`);
    }
    if (!verbs.includes(`${bin} doctor`)) {
      findings.push(`${name}: its binary ${bin} has no doctor verb`);
    }
  }
  for (const key of verbs) {
    const bin = key.split(" ")[0] ?? key;
    if (!bins.includes(bin)) {
      findings.push(`${name}: command "${key}" names a bin qsm.bin does not declare`);
    }
  }
  return findings;
}

/** One binary and one noun, both named after the plugin: `qsm-book-to-skill`
 * ships `qsm-book-to-skill` and `$.bookToSkill`. */
function namingFindings(name: string, bins: readonly string[], noun: string | undefined): string[] {
  const findings: string[] = [];
  if (bins.length !== 1) {
    findings.push(`${name}: ships one binary, not ${bins.join(", ")}`);
  } else if (bins[0] !== name) {
    findings.push(`${name}: its binary ${bins[0]} is not named after the plugin (${name})`);
  }
  const expectedNoun = toCamel(name.replace(/^qsm-/, ""));
  if (noun === undefined) {
    findings.push(`${name}: qsm.noun is required for a plugin with a bin`);
  } else if (noun !== expectedNoun) {
    findings.push(`${name}: its noun ${noun} is not named after the plugin (${expectedNoun})`);
  }
  return findings;
}

if (import.meta.main) {
  const findings: string[] = [];
  for (const dir of pluginDirs()) {
    const manifest = readJson(join(dir, "qsm.json"));
    if (manifest === null) {
      continue;
    }
    let parsed: QsmManifest;
    try {
      parsed = parseManifest(manifest, rel(join(dir, "qsm.json")));
    } catch (error) {
      if (error instanceof ManifestError) {
        findings.push(error.message);
        continue;
      }
      throw error;
    }
    findings.push(
      ...generatedFindings(dir, {
        manifest: parsed,
        pluginJson: pluginJsonOf(readJson(join(dir, ".claude-plugin", "plugin.json"))),
        readFile: (p) => (existsSync(p) ? readFileSync(p, "utf8") : null),
      }),
    );
  }
  // The verb is the one writer; a gate never imports a plugin's code.
  const readme = spawnSync(
    "bun",
    [join(root, "plugins/qsm-builder/scripts/cli.ts"), "lens", "readme", "--check"],
    { cwd: root, encoding: "utf8" },
  );
  if (readme.status !== 0) {
    findings.push((readme.stdout + readme.stderr).trim());
  }
  report("generated", findings);
}
