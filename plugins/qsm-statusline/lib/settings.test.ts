import { describe, expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readStatusLine, STATUS_LINE_COMMAND, describe as say, settingsPath } from "./settings.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

// Every sandbox this file makes is removed after the test that made it,
// passing or failing: a `finally` inside one test would leave the rest.
function settingsFile(contents: string): string {
  const dir = sandboxDir("qsm-statusline-settings-");
  const path = join(dir, "settings.json");
  writeFileSync(path, contents);
  return path;
}

describe("readStatusLine", () => {
  test("recognises the entry this plugin wires", () => {
    const path = settingsFile(
      JSON.stringify({ statusLine: { type: "command", command: STATUS_LINE_COMMAND } }),
    );
    expect(readStatusLine(path)).toEqual({ kind: "wired" });
  });

  test("a missing file is a fresh machine, which invites a write", () => {
    expect(readStatusLine(join(sandboxDir("qsm-statusline-settings-"), "settings.json"))).toEqual({
      kind: "absent",
    });
  });

  test("a settings file with other keys and no status line is absent, not broken", () => {
    expect(readStatusLine(settingsFile(JSON.stringify({ model: "opus" })))).toEqual({
      kind: "absent",
    });
  });

  test("somebody else's status line is reported, never replaced silently", () => {
    const path = settingsFile(
      JSON.stringify({ statusLine: { type: "command", command: "~/.claude/mine.sh" } }),
    );
    expect(readStatusLine(path)).toEqual({ kind: "other", command: "~/.claude/mine.sh" });
  });

  test("Configuration file is unreadable", () => {
    const state = readStatusLine(settingsFile('{"statusLine": '));
    expect(state.kind).toBe("unreadable");
    expect(say(state)).toContain("could not be read");
  });

  test("a file the process may not open is unreadable, not a fresh machine", () => {
    // Absent invites a write, unreadable forbids one. A settings file whose
    // permissions say no holds a configuration this process cannot see.
    const path = settingsFile(JSON.stringify({ statusLine: { type: "command", command: "x" } }));
    chmodSync(path, 0o000);
    expect(readStatusLine(path).kind).toBe("unreadable");
  });

  test("valid JSON that is not an object is unreadable too", () => {
    expect(readStatusLine(settingsFile("[1,2,3]")).kind).toBe("unreadable");
  });
});

describe("settingsPath", () => {
  test("lives under CLAUDE_CONFIG_DIR, else under ~/.claude", () => {
    expect(settingsPath({ CLAUDE_CONFIG_DIR: "/tmp/other" })).toBe("/tmp/other/settings.json");
    expect(settingsPath({ HOME: "/home/x" })).toBe("/home/x/.claude/settings.json");
  });
});
