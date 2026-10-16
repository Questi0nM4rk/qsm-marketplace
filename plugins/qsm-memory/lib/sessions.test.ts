import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "../../../lib/fixtures/git.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { QsmError } from "../../../lib/qsm-error.ts";
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
      "no turns in 20-30; the last turn is #2",
    );
  });

  test("a long session stops at the character budget, a huge first turn is cut", () => {
    const db = archive();
    const long = new TranscriptBuilder({ sessionId: "long-3" });
    for (let i = 0; i < 23; i++) {
      long.human("u".repeat(3000)).assistant("a".repeat(3000));
    }
    writeFileSync(join(transcriptDir, "long-3.jsonl"), long.text());
    saveTranscript(db, join(transcriptDir, "long-3.jsonl"));

    const out = show(db, "long-3").split("\n");
    expect(out.filter((line) => line.startsWith("#"))).toHaveLength(6);
    expect(out.at(-1)).toBe("next: --lines 7-46");

    const huge = new TranscriptBuilder({ sessionId: "huge-4" }).human("h".repeat(50_000)).text();
    writeFileSync(join(transcriptDir, "huge-4.jsonl"), huge);
    saveTranscript(db, join(transcriptDir, "huge-4.jsonl"));
    expect(show(db, "huge-4")).toEndWith("[turn cut at 20000 of 50009 characters]");
  });

  test("an id prefix that matches one session is accepted, two is ambiguous", () => {
    expect(resolveSession(archive(), "abc").id).toBe("abc-1");
    expect(() => resolveSession(archive(), "ab")).toThrow(QsmError);
    expect(() => resolveSession(archive(), "zzz")).toThrow("no session starts with zzz");
  });
});

describe("list", () => {
  test("a long list stops at the limit and says how many more", () => {
    const db = archive();
    for (let i = 0; i < 23; i++) {
      db.query("INSERT INTO sessions VALUES (?, '/w', '/w/repo', ?, ?, ?, '/gone', ?, 1)").run(
        `many-${i}`,
        `t${i}`,
        "2026-09-29T00:00:00.000Z",
        `2026-09-29T00:${String(i).padStart(2, "0")}:00.000Z`,
        "2026-09-29T00:00:00.000Z",
      );
    }
    const rows = listSessions(db, { now: NOW });
    const out = formatList(rows).split("\n");
    expect(rows).toHaveLength(25);
    expect(out).toHaveLength(21);
    expect(out.at(-1)).toBe("5 more: --limit 25");
    expect(formatList(rows, 25).split("\n")).toHaveLength(25);
  });

  test("a --since nobody can parse is refused, never read as no filter", () => {
    for (const since of ["last week", "7days", "2w"]) {
      expect(() => listSessions(archive(), { since, now: NOW })).toThrow(
        `--since takes Nd or a date (got '${since}')`,
      );
    }
  });

  test("list --since 7d prints one line per session of the week", () => {
    const rows = listSessions(archive(), { since: "7d", now: NOW });
    expect(rows.map((r) => r.id)).toEqual(["abc-1"]);
    expect(formatList(rows)).toBe("2026-09-30 repo abc-1 2 Greeting");
    expect(listSessions(archive(), { now: NOW })).toHaveLength(2);
  });

  test("--project a worktree lists the sessions archived under its main checkout", () => {
    const root = realpathSync(sandboxDir("qsm-memory-wt-"));
    git(root, "init", "-q");
    git(root, "commit", "-q", "--allow-empty", "-m", "x");
    const worktree = join(root, "wt");
    git(root, "worktree", "add", "-q", worktree);
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
