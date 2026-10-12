import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { MemError } from "./errors.ts";
import { TranscriptBuilder } from "./fixtures/transcript.ts";
import { saveTranscript } from "./save.ts";
import { formatList, listSessions, resolveSession, show } from "./sessions.ts";
import { applySchema } from "./store.ts";

const NOW = Date.parse("2026-09-30T12:00:00Z");

let transcriptDir = "";

function archive(): Database {
  const db = new Database(":memory:");
  applySchema(db);
  const dir = sandboxDir("qsm-memory-show-");
  transcriptDir = dir;
  const save = (name: string, text: string) => {
    const path = join(dir, name);
    writeFileSync(path, text);
    saveTranscript(db, path);
  };
  save(
    "abc-1.jsonl",
    new TranscriptBuilder({ sessionId: "abc-1" })
      .human("hello")
      .assistant("hi")
      .toolUse("Read", { file_path: "/x" })
      .toolResult("contents")
      .title("Greeting")
      .text(),
  );
  save("abd-2.jsonl", new TranscriptBuilder({ sessionId: "abd-2" }).human("old").text());
  db.query("UPDATE sessions SET ended_at = '2026-08-01T00:00:00.000Z' WHERE id = 'abd-2'").run();
  return db;
}

describe("show", () => {
  test("show prints the conversation text by default", () => {
    const out = show(archive(), "abc-1");
    expect(out.split("\n")).toEqual([
      "abc-1 2026-09-30 repo: Greeting",
      "#1 user: hello",
      "#2 assistant: hi",
    ]);
  });

  test("show --full reads the transcript file: tool calls and results too", () => {
    const out = show(archive(), "abc-1", { full: true });
    expect(out).toContain("#2 assistant: hi");
    expect(out).toContain('#3 tool Read {"file_path":"/x"}');
    expect(out).toContain("#4 result: contents");
    expect(show(archive(), "abc-1")).not.toContain("result:");
  });

  test("show --full says so when the transcript file is gone", () => {
    const db = archive();
    rmSync(join(transcriptDir, "abc-1.jsonl"));
    expect(() => show(db, "abc-1", { full: true })).toThrow("is gone; only the saved text is left");
    expect(show(db, "abc-1")).toContain("#1 user: hello");
  });

  test("a window past the end says so", () => {
    expect(show(archive(), "abc-1", { lines: [20, 30] })).toContain(
      "no turns in 20-30; the session has 2",
    );
  });

  test("an id prefix that matches one session is accepted, two is ambiguous", () => {
    expect(resolveSession(archive(), "abc").id).toBe("abc-1");
    expect(() => resolveSession(archive(), "ab")).toThrow(MemError);
    expect(() => resolveSession(archive(), "zzz")).toThrow("no session starts with zzz");
  });
});

describe("list", () => {
  test("list --since 7d prints one line per session of the week", () => {
    const rows = listSessions(archive(), { since: "7d", now: NOW });
    expect(rows.map((r) => r.id)).toEqual(["abc-1"]);
    expect(formatList(rows)).toBe("2026-09-30 repo abc-1 2 Greeting");
    expect(listSessions(archive(), { now: NOW })).toHaveLength(2);
  });

  test("--project a worktree lists the sessions archived under its main checkout", () => {
    const root = realpathSync(sandboxDir("qsm-memory-wt-"));
    const git = (...args: string[]) =>
      spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    git("init", "-q");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "x");
    const worktree = join(root, "wt");
    expect(git("worktree", "add", "-q", worktree).status).toBe(0);
    const db = new Database(":memory:");
    applySchema(db);
    const path = join(root, "s1.jsonl");
    writeFileSync(
      path,
      new TranscriptBuilder({ sessionId: "s1", cwd: worktree }).human("hi").text(),
    );
    saveTranscript(db, path);

    expect(listSessions(db, { project: worktree }).map((r) => r.id)).toEqual(["s1"]);
    expect(listSessions(db, { project: root }).map((r) => r.id)).toEqual(["s1"]);
  });
});
