// qsm-knowledge through its real surface: argv, stdout, stderr, exit. The notes
// live in a sandbox and the notebook binary is never reached.
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "cli.ts");
/** Only the runtime itself: the notebook binary is never on it. */
const BARE_PATH = dirname(process.execPath);

const GOOD = `---
title: Strangler fig
created: 2026-01-08
type: concept
tags: [migration, architecture]
---

# Strangler fig

The old system keeps serving until the new one takes each route.
See [[branch-by-abstraction]].
`;

const sandboxes: string[] = [];

function note(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "qsm-knowledge-cli-"));
  sandboxes.push(dir);
  const path = join(dir, "note.md");
  writeFileSync(path, body);
  return path;
}

afterEach(() => {
  while (sandboxes.length > 0) {
    rmSync(sandboxes.pop() ?? "", { recursive: true, force: true });
  }
});

function run(argv: readonly string[], env: Record<string, string> = {}) {
  const home = mkdtempSync(join(tmpdir(), "qsm-knowledge-home-"));
  sandboxes.push(home);
  const r = spawnSync("bun", [CLI, ...argv], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", HOME: home, ...env },
  });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("qsm-knowledge", () => {
  test("--help lists both verbs", () => {
    const r = run(["--help"]);
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain("  validate");
    expect(r.stdout).toContain("  doctor");
  });

  test("validate with no note names the missing argument, exit 2", () => {
    const r = run(["validate"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("missing required argument note");
  });

  test("validate with a second note is a usage error, exit 2", () => {
    const r = run(["validate", note(GOOD), "other.md"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("unexpected argument other.md");
  });

  test("a good note is ok, exit 0, and its report is the data", () => {
    const r = run(["validate", note(GOOD), "--json"]);
    expect(r.exit).toBe(0);
    const envelope: unknown = JSON.parse(r.stdout);
    expect(envelope).toMatchObject({ code: "ok", data: { ok: true, errors: [] } });
  });

  test("a note with an error is failed, exit 1", () => {
    const r = run(["validate", note(GOOD.replace("type: concept", "type: journal")), "--json"]);
    expect(r.exit).toBe(1);
    const envelope: unknown = JSON.parse(r.stdout);
    expect(envelope).toMatchObject({ code: "failed" });
    expect(envelope).not.toMatchObject({ data: { errors: [] } });
  });

  test("a note whose only finding is a warning stays ok and carries it", () => {
    const body = GOOD.replace("See [[branch-by-abstraction]].", "Nothing links out.");
    const r = run(["validate", note(body), "--json"]);
    expect(r.exit).toBe(0);
    const envelope: unknown = JSON.parse(r.stdout);
    expect(envelope).toMatchObject({ code: "ok" });
    expect(envelope).not.toMatchObject({ warnings: [] });
    expect(r.stdout).toContain("[[wikilink]]");
  });

  test("doctor with the notebook binary off PATH is missing, exit 4", () => {
    const r = run(["doctor", "--json"], { PATH: BARE_PATH });
    expect(r.exit).toBe(4);
    const envelope: unknown = JSON.parse(r.stdout);
    expect(envelope).toMatchObject({ code: "missing" });
    expect(envelope).not.toMatchObject({ data: { findings: [] } });
  });
});
