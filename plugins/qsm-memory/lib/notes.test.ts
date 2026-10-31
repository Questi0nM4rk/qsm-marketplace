import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { addNote, currentNotes, dropNote, fitNotes, formatNotes } from "./notes.ts";
import { applySchema } from "./store.ts";

const NOW = Date.parse("2026-09-30T12:00:00Z");
const DAY = 86_400_000;

function db(): Database {
  const d = new Database(":memory:");
  applySchema(d);
  return d;
}

describe("notes", () => {
  test("a note written in a worktree is read from the main checkout", () => {
    // Both call sites resolve the same project key (lib/project.ts); the
    // store only sees the key.
    const d = db();
    addNote(d, {
      text: "qsm-abc: gate red on typecheck, fix first",
      project: "/repo",
      expiresDays: 14,
      now: NOW,
    });
    addNote(d, { text: "everywhere", project: null, expiresDays: 14, now: NOW });

    const rows = currentNotes(d, "/repo", { now: NOW });

    expect(rows.map((r) => r.text)).toEqual([
      "everywhere",
      "qsm-abc: gate red on typecheck, fix first",
    ]);
    expect(currentNotes(d, "/other", { now: NOW }).map((r) => r.text)).toEqual(["everywhere"]);
    expect(formatNotes(rows)).toContain("from 2026-09-30 until 2026-10-14: everywhere");
  });

  test("an expired note is gone on the next read", () => {
    const d = db();
    addNote(d, { text: "temporary", project: "/repo", expiresDays: 1, now: NOW });

    expect(currentNotes(d, "/repo", { now: NOW + 2 * DAY })).toEqual([]);
    expect(d.query("SELECT COUNT(*) AS n FROM notes").get()).toEqual({ n: 0 });
  });

  test("--keep holds a note past the default expiry", () => {
    const d = db();
    addNote(d, { text: "standing", project: "/repo", expiresDays: null, now: NOW });

    const rows = currentNotes(d, "/repo", { now: NOW + 30 * DAY });

    expect(rows).toHaveLength(1);
    expect(formatNotes(rows)).toContain("until kept: standing");
  });

  test("a note with a token shape is refused", () => {
    const d = db();
    expect(() =>
      addNote(d, { text: `token ghp_${"a".repeat(36)}`, project: null, expiresDays: 14 }),
    ).toThrow("secret shape (github-pat)");
    expect(d.query("SELECT COUNT(*) AS n FROM notes").get()).toEqual({ n: 0 });
  });

  test("drop removes one note and names a missing one", () => {
    const d = db();
    const row = addNote(d, { text: "x", project: null, expiresDays: 14, now: NOW });
    dropNote(d, row.id);
    expect(currentNotes(d, null, { now: NOW })).toEqual([]);
    expect(() => {
      dropNote(d, row.id);
    }).toThrow(`no note ${row.id}`);
  });
});

describe("session start notes", () => {
  test("session start shows the newest notes within the budget and counts the rest", () => {
    const d = db();
    for (const i of [1, 2, 3, 4, 5]) {
      addNote(d, {
        text: `note ${i} ${"x".repeat(400)}`,
        project: "/repo",
        expiresDays: 14,
        now: NOW + i,
      });
    }

    const text = fitNotes(currentNotes(d, "/repo", { now: NOW + 9 }), 1000);

    expect(text).toContain("note 5");
    expect(text).toContain("note 4");
    expect(text).not.toContain("note 1");
    expect(text).toContain("3 older notes: qsm-memory notes");
    expect(text.length).toBeLessThanOrEqual(1100);
  });
});
