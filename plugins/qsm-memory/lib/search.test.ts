import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { TranscriptBuilder } from "./fixtures/transcript.ts";
import { saveTranscript } from "./save.ts";
import { formatHits, ftsQuery, NO_MATCH, search, sinceCutoff } from "./search.ts";
import { applySchema } from "./store.ts";

const NOW = Date.parse("2026-09-30T12:00:00Z");

/** An archive with two sessions: a gate fix and an older
 * semgrep session. */
function archive(): { db: Database; dir: string } {
  const db = new Database(":memory:");
  applySchema(db);
  const dir = join(sandboxDir("qsm-memory-search-"), "-home-x-repo");
  mkdirSync(dir, { recursive: true });
  const save = (name: string, text: string, when: string) => {
    const path = join(dir, name);
    writeFileSync(path, text);
    saveTranscript(db, path, { now: () => when });
  };
  save(
    "aaa.jsonl",
    new TranscriptBuilder({ sessionId: "aaa" })
      .human("the typecheck gate is red, fix it")
      .assistant("running the tests")
      .title("Fix the gate")
      .text(),
    "2026-09-30T11:00:00Z",
  );
  save(
    "bbb.jsonl",
    new TranscriptBuilder({ sessionId: "bbb" })
      .human("semgrep pro is too slow per commit")
      .assistant("moving pro to pre-push")
      .title("Semgrep pre-push")
      .text(),
    "2026-09-20T11:00:00Z",
  );
  // ended_at comes from the turns' own timestamps; the fixture clock starts
  // at 2026-09-30, so age the semgrep session by hand.
  db.query("UPDATE sessions SET ended_at = '2026-09-20T11:00:05.000Z' WHERE id = 'bbb'").run();
  return { db, dir };
}

describe("search", () => {
  test("a query hits the turn that said it", () => {
    const { db } = archive();
    const hits = search(db, "typecheck gate", { now: NOW });
    expect(hits[0]?.sessionId).toBe("aaa");
    expect(formatHits(hits)).toContain("2026-09-30 repo aaa #1 Fix the gate");
  });

  test("nothing matches says so and guesses nothing", () => {
    const { db } = archive();
    expect(formatHits(search(db, "kubernetes", { now: NOW }))).toBe(NO_MATCH);
    expect(formatHits(search(db, "the is", { now: NOW }))).toBe(NO_MATCH);
  });

  test("--since narrows to sessions that ended after the date", () => {
    const { db } = archive();
    expect(search(db, "typecheck semgrep", { now: NOW }).map((h) => h.sessionId)).toContain("bbb");
    const recent = search(db, "typecheck semgrep", { now: NOW, since: "7d" });
    expect(recent.map((h) => h.sessionId)).not.toContain("bbb");
    expect(recent.length).toBeGreaterThan(0);
  });

  test("stems and diacritics match loosely", () => {
    const { db } = archive();
    expect(search(db, "gates fixed", { now: NOW })[0]?.sessionId).toBe("aaa");
  });
});

describe("query pieces", () => {
  test("ftsQuery builds OR-ed prefix terms", () => {
    expect(ftsQuery("Bun test")).toBe("(bun* OR test*)");
    expect(ftsQuery("x")).toBeNull();
    expect(ftsQuery("the is")).toBeNull();
  });

  test("sinceCutoff reads days or a date", () => {
    expect(sinceCutoff("7d", NOW)).toBe("2026-09-23T12:00:00.000Z");
    expect(sinceCutoff("2026-09-01", NOW)).toBe("2026-09-01T00:00:00.000Z");
    expect(sinceCutoff("yesterday", NOW)).toBeNull();
  });
});
