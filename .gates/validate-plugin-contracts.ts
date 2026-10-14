#!/usr/bin/env bun
// Plugin manifests, marketplace entries, skill/agent/command frontmatter, hooks.json shape.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { isRecord } from "../lib/outcome.ts";
import { manifestlessPlugins, pluginDirs, rel, report, root, walk } from "./walk.ts";

const findings: string[] = [];
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    findings.push(`${rel(path)}: invalid JSON`);
    return null;
  }
}

function frontmatter(path: string): Record<string, string> | null {
  const text = readFileSync(path, "utf8");
  if (!text.startsWith("---\n")) {
    findings.push(`${rel(path)}: missing YAML frontmatter`);
    return null;
  }
  const end = text.indexOf("\n---", 4);
  if (end === -1) {
    findings.push(`${rel(path)}: unterminated YAML frontmatter`);
    return null;
  }
  const fm: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const sep = line.indexOf(":");
    if (line.trim().length === 0 || line.startsWith(" ")) {
      continue;
    }
    if (sep === -1) {
      findings.push(`${rel(path)}: malformed frontmatter line: ${line}`);
      continue;
    }
    fm[line.slice(0, sep).trim()] = line
      .slice(sep + 1)
      .trim()
      .replace(/^"(.*)"$/, "$1");
  }
  return fm;
}

function requireKeys(path: string, fm: Record<string, string>, keys: string[]): void {
  for (const k of keys) {
    if (!isText(fm[k])) {
      findings.push(`${rel(path)}: ${k} must be a non-empty string`);
    }
  }
}

// marketplace.json: every entry points at an existing plugin dir of the same name.
const marketplace = readJson(resolve(root, ".claude-plugin/marketplace.json"));
const listed = new Set<string>();
if (isRecord(marketplace) && Array.isArray(marketplace.plugins)) {
  for (const entry of marketplace.plugins) {
    if (!(isRecord(entry) && isText(entry.name)) || entry.source !== `./plugins/${entry.name}`) {
      findings.push(
        `marketplace.json: entry must be {name, source: "./plugins/<name>"}: ${JSON.stringify(entry)}`,
      );
      continue;
    }
    listed.add(entry.name);
    if (!existsSync(resolve(root, "plugins", entry.name, ".claude-plugin/plugin.json"))) {
      findings.push(
        `marketplace.json: ${entry.name} has no plugins/${entry.name}/.claude-plugin/plugin.json`,
      );
    }
  }
} else {
  findings.push(".claude-plugin/marketplace.json: must hold a plugins array");
}

/** Names of the classic command hooks (binaries in dist/) a hooks.json declares. */
function classicHooks(json: unknown): string[] {
  const events = isRecord(json) && isRecord(json.hooks) ? Object.values(json.hooks) : [];
  return events
    .flatMap((groups) => list(groups))
    .flatMap((group) => (isRecord(group) ? list(group.hooks) : []))
    .map((h) => (isRecord(h) && typeof h.command === "string" ? basename(h.command, '"') : ""))
    .filter((n) => n !== "");
}

const classic: string[] = [];
for (const dir of pluginDirs()) {
  const name = basename(dir);
  const manifest = resolve(dir, ".claude-plugin/plugin.json");
  if (existsSync(manifest)) {
    const json = readJson(manifest);
    if (isRecord(json)) {
      for (const k of ["name", "version", "description"]) {
        if (!isText(json[k])) {
          findings.push(`${rel(manifest)}: ${k} must be a non-empty string`);
        }
      }
      if (json.name !== name) {
        findings.push(`${rel(manifest)}: name must equal the directory name ${name}`);
      }
      if (!isRecord(json.author) || json.author.name !== "qsm") {
        findings.push(`${rel(manifest)}: author must be {"name": "qsm"}`);
      }
      if (!(Array.isArray(json.keywords) && json.keywords.every(isText))) {
        findings.push(`${rel(manifest)}: keywords must be an array of non-empty strings`);
      }
    }
    if (!listed.has(name)) {
      findings.push(`marketplace.json: plugin ${name} is not listed`);
    }
  }
  for (const path of walk(dir)) {
    const r = rel(path);
    if (r.endsWith("/hooks/hooks.json")) {
      const json = readJson(path);
      // "hooks" (classic command hooks) alone, or with "modules" (function
      // hooks) beside it: `claude plugin validate` accepts a hooks.json that
      // carries both, and a plugin keeps its classic pair for a harness with
      // function hooks off while a module replaces them where they are on.
      const keys = isRecord(json) ? Object.keys(json) : [];
      const known = new Set(["hooks", "modules"]);
      if (!isRecord(json) || keys.length === 0 || !keys.every((k) => known.has(k))) {
        findings.push(`${r}: hooks.json's top-level keys must be "hooks" and/or "modules"`);
      }
      for (const hook of classicHooks(json)) {
        const source = resolve(dirname(path), `${hook}.ts`);
        const head = existsSync(source)
          ? readFileSync(source, "utf8").split("\n").slice(0, 12)
          : [];
        if (head.some((l) => l.startsWith("//") && l.includes("classic:"))) {
          classic.push(`${name} ${hook}`);
        } else {
          findings.push(
            `${name}: classic hook ${hook} needs hooks/${hook}.ts with a "// classic: <event> has no function event" comment at its top`,
          );
        }
      }
    } else if (/\/skills\/[^/]+\/SKILL\.md$/.test(r)) {
      const fm = frontmatter(path);
      if (fm) {
        requireKeys(path, fm, ["name", "description"]);
      }
    } else if (/\/agents\/[^/]+\.md$/.test(r)) {
      const fm = frontmatter(path);
      if (fm) {
        requireKeys(path, fm, ["name", "description", "model"]);
      }
    } else if (/\/commands\/[^/]+\.md$/.test(r)) {
      const fm = frontmatter(path);
      if (fm) {
        requireKeys(path, fm, ["description"]);
      }
    }
  }
}

const warnings = manifestlessPlugins().map(
  (name) => `plugins/${name} has no .claude-plugin/plugin.json, so no gate checks it`,
);
console.log(`classic hooks: ${classic.length === 0 ? "none" : classic.join(", ")}`);
report("plugin-contracts", findings, warnings);
