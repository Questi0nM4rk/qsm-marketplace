// The Claude Code files a user edits by hand and that fail quietly when broken: settings and config
// JSON, agent frontmatter, skill frontmatter.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { YAML } from "bun";
import type { Check } from "./doctor.ts";
import { jsonErrorAt } from "./json-position.ts";
import { isRecord } from "../../../lib/outcome.ts";

export interface ClaudePaths {
  /** `CLAUDE_CONFIG_DIR`, else `~/.claude` */
  readonly configDir: string;
  /** `$CLAUDE_CONFIG_DIR/.claude.json`, else `~/.claude.json` */
  readonly claudeJson: string;
  /** the project the session runs in */
  readonly cwd: string;
}

function check(name: string, status: Check["status"], detail: string): Check {
  return { name, status, detail, output: "" };
}

export function configChecks(p: ClaudePaths): Check[] {
  const files = [
    join(p.configDir, "settings.json"),
    join(p.cwd, ".claude", "settings.json"),
    join(p.cwd, ".claude", "settings.local.json"),
    p.claudeJson,
    join(p.cwd, ".mcp.json"),
  ].filter((f) => existsSync(f));
  const failed: Check[] = [];
  for (const file of files) {
    const err = jsonErrorAt(readFileSync(file, "utf8"));
    if (err !== null) {
      failed.push(
        check(
          "claude config",
          "FAIL",
          `${file} does not parse: ${err.reason} at line ${err.line}, column ${err.column}; fix the JSON at ${file}:${err.line}:${err.column}`,
        ),
      );
    }
  }
  if (failed.length > 0) {
    return failed;
  }
  return files.length === 0
    ? [check("claude config", "SKIP", "no settings, .claude.json, or .mcp.json found")]
    : [check("claude config", "PASS", `${files.length} config files parse`)];
}

type Frontmatter =
  | { readonly kind: "none" }
  | { readonly kind: "broken"; readonly lines: string }
  | { readonly kind: "ok"; readonly data: Readonly<Record<string, unknown>> };

/** The YAML block between the opening and closing `---` lines. */
function readFrontmatter(text: string): Frontmatter {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== "---") {
    return { kind: "none" };
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) {
    return { kind: "broken", lines: "1 (no closing ---)" };
  }
  const where = `1-${end + 1}`;
  try {
    const data: unknown = YAML.parse(lines.slice(1, end).join("\n"));
    if (isRecord(data)) {
      return { kind: "ok", data };
    }
    return end === 1 ? { kind: "ok", data: {} } : { kind: "broken", lines: where };
  } catch {
    return { kind: "broken", lines: where };
  }
}

function markdownFiles(dir: string, recursive: boolean): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true, recursive })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

function brokenFrontmatter(name: string, file: string, lines: string): Check {
  return check(
    name,
    "FAIL",
    `${file}: frontmatter does not parse (lines ${lines}), so it does not load; fix the YAML there, quoting any value that holds ": "`,
  );
}

/** One agent file: a finding that keeps it from loading, or the name it
 * loads under, or neither when it declares no name. */
function agentFile(file: string): Check | string | null {
  const fm = readFrontmatter(readFileSync(file, "utf8"));
  if (fm.kind === "broken") {
    return brokenFrontmatter("claude agents", file, fm.lines);
  }
  if (fm.kind === "none" || typeof fm.data.name !== "string") {
    return null;
  }
  const { name, description } = fm.data;
  if (typeof description !== "string" || description.trim() === "") {
    return check(
      "claude agents",
      "FAIL",
      `${file}: agent ${name} has no description, so it does not load; add a description: line to its frontmatter`,
    );
  }
  return name;
}

/** One agents directory: each file's own findings, then names two files share. */
function agentDirChecks(dir: string, recursive: boolean): { checks: Check[]; valid: number } {
  const checks: Check[] = [];
  const byName = new Map<string, string[]>();
  for (const file of markdownFiles(dir, recursive)) {
    const found = agentFile(file);
    if (typeof found === "string") {
      byName.set(found, [...(byName.get(found) ?? []), file]);
    } else if (found !== null) {
      checks.push(found);
    }
  }
  const shared = [...byName].filter(([, files]) => files.length > 1);
  for (const [name, files] of shared) {
    const shown = files.map((f) => relative(dir, f)).join(" and ");
    checks.push(
      check(
        "claude agents",
        "FAIL",
        `${dir}: ${shown} both declare name ${name}; only one of them loads; rename name: in one of them or delete one`,
      ),
    );
  }
  return { checks, valid: byName.size - shared.length };
}

export function agentChecks(p: ClaudePaths): Check[] {
  const dirs = [
    agentDirChecks(join(p.cwd, ".claude", "agents"), true),
    agentDirChecks(join(p.configDir, "agents"), false),
  ];
  const failed = dirs.flatMap((d) => d.checks);
  if (failed.length > 0) {
    return failed;
  }
  const valid = dirs.reduce((n, d) => n + d.valid, 0);
  return [check("claude agents", "PASS", `${valid} agent files valid`)];
}

function skillFiles(skillsDir: string): string[] {
  if (!existsSync(skillsDir)) {
    return [];
  }
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(skillsDir, e.name, "SKILL.md"))
    .filter((f) => existsSync(f))
    .sort();
}

export function skillChecks(p: ClaudePaths): Check[] {
  const files = [
    ...skillFiles(join(p.configDir, "skills")),
    ...skillFiles(join(p.cwd, ".claude", "skills")),
  ];
  const failed: Check[] = [];
  for (const file of files) {
    const fm = readFrontmatter(readFileSync(file, "utf8"));
    if (fm.kind === "broken") {
      failed.push(brokenFrontmatter("claude skills", file, fm.lines));
    }
  }
  return failed.length > 0
    ? failed
    : [check("claude skills", "PASS", `${files.length} skill files parse`)];
}
