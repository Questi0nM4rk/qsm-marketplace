#!/usr/bin/env bun
// An npm package is pinned to one exact version, the same in every package.json that names it;
// a plugin imports only what its own package.json declares; root lib/ imports no package at all.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { isRecord, readJson, rel, report, root, walk } from "./walk.ts";

const SECTIONS = ["dependencies", "devDependencies"] as const;
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
// the harness's own virtual module, typed by .claude/types, not an npm package
const HARNESS = /^claude-code(?:\/|$)/;

/** package.json of the root and of every plugin under dir, as [path, name -> version]. */
function manifests(dir: string): { path: string; versions: Map<string, string> }[] {
  const plugins = resolve(dir, "plugins");
  const paths = [
    resolve(dir, "package.json"),
    ...(existsSync(plugins)
      ? readdirSync(plugins).map((n) => resolve(plugins, n, "package.json"))
      : []),
  ].filter((p) => existsSync(p));
  return paths.map((path) => {
    const json = readJson(path);
    const versions = new Map<string, string>();
    for (const section of SECTIONS) {
      const block = isRecord(json) ? json[section] : undefined;
      for (const [name, v] of Object.entries(isRecord(block) ? block : {})) {
        versions.set(name, String(v));
      }
    }
    return { path, versions };
  });
}

/** Ranges instead of exact pins, and one package at two versions. */
export function pinFindings(dir: string): string[] {
  const findings: string[] = [];
  const seen = new Map<string, Map<string, string[]>>();
  for (const { path, versions } of manifests(dir)) {
    for (const [name, version] of versions) {
      if (!EXACT.test(version)) {
        findings.push(`${rel(path)}: ${name} is "${version}"; pin one exact version`);
      }
      const at = seen.get(name) ?? new Map<string, string[]>();
      at.set(version, [...(at.get(version) ?? []), rel(path)]);
      seen.set(name, at);
    }
  }
  for (const [name, at] of seen) {
    if (at.size > 1) {
      const list = [...at].map(([v, files]) => `${v} in ${files.join(", ")}`).join("; ");
      findings.push(`${name} is at ${at.size} versions: ${list}`);
    }
  }
  return findings;
}

/** The npm package a bare import names, or null for node:, bun:, the harness and relative paths. */
export function packageOf(specifier: string): string | null {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("node:") ||
    specifier.startsWith("bun:") ||
    specifier === "bun" ||
    HARNESS.test(specifier)
  ) {
    return null;
  }
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? null);
}

function importsOf(file: string): string[] {
  const loader = file.endsWith(".tsx") ? "tsx" : "ts";
  const src = readFileSync(file, "utf8").replace(/^#!.*/, "");
  // a .tsx file reports the transpiler's implicit react import; only a written one counts
  const written = /from\s+["']react(?:\/|["'])/.test(src);
  return new Bun.Transpiler({ loader })
    .scanImports(src)
    .flatMap((i) => packageOf(i.path) ?? [])
    .filter((name) => name !== "react" || written);
}

const isSource = (f: string): boolean => /\.tsx?$/.test(f) && !f.endsWith(".d.ts");

/** A bare import in root lib/, and a plugin import its package.json does not declare. */
export function importFindings(dir: string): string[] {
  const findings: string[] = [];
  for (const file of [...walk(resolve(dir, "lib"))].filter(isSource)) {
    for (const name of new Set(importsOf(file))) {
      findings.push(`${rel(file)}: root lib/ imports ${name}; lib/ imports no package`);
    }
  }
  const declared = new Map(manifests(dir).map((m) => [m.path, m.versions]));
  const plugins = resolve(dir, "plugins");
  for (const file of [...walk(plugins)].filter(isSource)) {
    const plugin = file.slice(plugins.length + 1).split("/")[0] ?? "";
    const has = declared.get(resolve(plugins, plugin, "package.json"));
    for (const name of new Set(importsOf(file))) {
      if (has?.has(name) !== true) {
        findings.push(
          `${rel(file)}: imports ${name}, plugins/${plugin}/package.json does not declare it`,
        );
      }
    }
  }
  return findings;
}

if (import.meta.main) {
  report("deps", [...pinFindings(root), ...importFindings(root)]);
}
