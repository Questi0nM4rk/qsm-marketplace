// The harness's own checks over every plugin: `claude plugin validate` for each, and `claude plugin
// test` for each plugin whose hooks/ holds tests.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { pluginDirs, report, root } from "./walk.ts";

const ENV = { ...process.env, CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: "1" };

function claude(args: string[]): { status: number; text: string } {
  const r = spawnSync("claude", args, { cwd: root, encoding: "utf8", env: ENV, timeout: 300_000 });
  return { status: r.status ?? 1, text: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** The `(pass)`/`(fail)` lines under the `hooks/...:` section headers only. */
export function hooksResults(output: string): { pass: number; fail: number; failures: string[] } {
  let inHooks = false;
  let pass = 0;
  let fail = 0;
  const failures: string[] = [];
  for (const line of output.split("\n")) {
    const header = /^(\S+\.test\.tsx?):\s*$/.exec(line)?.[1];
    if (header !== undefined) {
      inHooks = header.startsWith("hooks/");
      continue;
    }
    if (!inHooks) {
      continue;
    }
    if (line.startsWith("(pass)")) {
      pass += 1;
    } else if (line.startsWith("(fail)")) {
      fail += 1;
      failures.push(line);
    }
  }
  return { pass, fail, failures };
}

function hasHooksTests(dir: string): boolean {
  const hooks = join(dir, "hooks");
  return existsSync(hooks) && readdirSync(hooks).some((f) => /\.test\.tsx?$/.test(f));
}

function hasHooksJson(dir: string): boolean {
  return existsSync(join(dir, "hooks", "hooks.json"));
}

/** Split on top-level commas only, ignoring commas nested inside `{...}` matchers. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
    }
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== "") {
    parts.push(cur);
  }
  return parts;
}

/** The bare event names on one `❯ <module> hooks: <events>` line, matchers stripped. */
function eventNamesOnLine(line: string): string[] {
  const match = /^\s*❯\s+\S+\s+hooks:\s*(.*)$/.exec(line);
  if (match === null) {
    return [];
  }
  return splitTopLevel(match[1] ?? "")
    .map((part) => part.split("{")[0]?.trim() ?? "")
    .filter((name) => name !== "");
}

/**
 * The event names on `claude plugin validate`'s `❯ <module> hooks: <events>` line(s), bare
 * (matchers like `{tool=Bash}` stripped), deduplicated, in first-seen order.
 */
export function eventsHooked(validateOutput: string): string[] {
  const seen = new Set<string>();
  for (const line of validateOutput.split("\n")) {
    for (const name of eventNamesOnLine(line)) {
      seen.add(name);
    }
  }
  return [...seen];
}

/** True when a hooks module hooks anything beyond the generated noun's `engine.create`. */
export function needsHooksTests(events: string[]): boolean {
  return events.some((e) => e !== "engine.create");
}

/** Finding for a plugin whose hooks module hooks more than the noun and has no hooks/ test. */
function hooksTestFinding(dir: string, name: string, validateOutput: string): string | null {
  if (!hasHooksJson(dir)) {
    return null;
  }
  const events = eventsHooked(validateOutput);
  if (!needsHooksTests(events) || hasHooksTests(dir)) {
    return null;
  }
  return `${name}: hooks module hooks ${events.join(", ")} and has no test under hooks/`;
}

/** Runs `claude plugin test` for a plugin already known to carry hooks/ tests. */
function testPluginHooks(dir: string, name: string): { findings: string[]; passed: number } {
  const t = claude(["plugin", "test", dir]);
  const results = hooksResults(t.text);
  const findings: string[] = [];
  if (results.pass + results.fail === 0) {
    findings.push(
      `${name}: claude plugin test reported no hooks/ results:\n    ${t.text.trim().split("\n").slice(-5).join("\n    ")}`,
    );
  }
  for (const f of results.failures) {
    findings.push(`${name}: ${f}`);
  }
  return { findings, passed: results.pass };
}

function main(): void {
  if (spawnSync("sh", ["-c", "command -v claude"], { stdio: "ignore" }).status !== 0) {
    console.log(
      "test-hooks: SKIPPED, claude is not on PATH (this gate needs the installed Claude Code)",
    );
    process.exit(0);
  }
  const findings: string[] = [];
  let validated = 0;
  let tested = 0;
  let passed = 0;
  for (const dir of pluginDirs()) {
    const name = basename(dir);
    const v = claude(["plugin", "validate", dir]);
    validated += 1;
    if (v.status === 0) {
      const finding = hooksTestFinding(dir, name, v.text);
      if (finding !== null) {
        findings.push(finding);
      }
    } else {
      findings.push(
        `${name}: claude plugin validate failed:\n    ${v.text.trim().split("\n").slice(0, 5).join("\n    ")}`,
      );
    }
    if (!hasHooksTests(dir)) {
      continue;
    }
    tested += 1;
    const result = testPluginHooks(dir, name);
    passed += result.passed;
    findings.push(...result.findings);
  }
  console.log(
    `test-hooks: ${validated} plugins validated, ${tested} hooks modules tested, ${passed} tests passed`,
  );
  report("test-hooks", findings);
}

if (import.meta.main) {
  main();
}
