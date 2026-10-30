import { describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { Database } from "bun:sqlite";
import { getState, openDb, resolveDbPath, setState } from "./store.ts";

describe("the archive database", () => {
  test("the first save creates the database with owner-only permissions", () => {
    const dir = sandboxDir("qsm-memory-store-");
    const path = join(dir, "data", "qsm-memory", "memory.db");

    openDb(path);

    expect(existsSync(path)).toBe(true);
    expect((statSync(path).mode % 0o1000).toString(8)).toBe("600");
  });

  test("QSM_MEMORY_DB points the binary at another file", () => {
    expect(resolveDbPath({ QSM_MEMORY_DB: "/tmp/x.db", HOME: "/h" })).toBe("/tmp/x.db");
    expect(resolveDbPath({ XDG_DATA_HOME: "/d", HOME: "/h" })).toBe("/d/qsm-memory/memory.db");
    expect(resolveDbPath({ HOME: "/h" })).toBe("/h/.local/share/qsm-memory/memory.db");
  });
});

describe("a skip record of a session that is saved", () => {
  test("is deleted on open, once", () => {
    const path = join(sandboxDir("qsm-memory-skip-"), "memory.db");
    const db = openDb(path);
    db.run("INSERT INTO sessions VALUES ('s1', '/w', '/w', 't', 'a', 'b', '/gone', 'c', 1)");
    db.run("INSERT INTO turns VALUES ('s1', 1, 'u1', 'user', 't', 'hello')");
    db.run("INSERT INTO skipped VALUES ('s1', '/gone', 1, 'no human turn')");
    db.run("INSERT INTO skipped VALUES ('s2', '/gone2', 1, 'no human turn')");
    db.close();

    const again = openDb(path);

    expect(again.query("SELECT id FROM skipped").all()).toEqual([{ id: "s2" }]);
  });
});

describe("a session made only of slash commands", () => {
  test("is dropped on open, once, and a session with a typed prompt stays", () => {
    const path = join(sandboxDir("qsm-memory-cmd-"), "memory.db");
    const db = openDb(path);
    const session = db.query(
      "INSERT INTO sessions VALUES (?, '/w', '/w', 't', 'a', 'b', '/gone', 'c', 1)",
    );
    const turn = db.query("INSERT INTO turns VALUES (?, 1, ?, 'user', 't', ?)");
    session.run("cmd");
    turn.run("cmd", "cmd/a", "<command-name>/clear</command-name>");
    session.run("real");
    turn.run("real", "real/a", "<command-name>/effort</command-name>\nfix the gate");
    db.close();

    const again = openDb(path);

    expect(again.query<{ id: string }, []>("SELECT id FROM sessions").all()).toEqual([
      { id: "real" },
    ]);
    expect(again.query("SELECT COUNT(*) AS n FROM turns").get()).toEqual({ n: 1 });
  });
});

describe("harness text already stored as user turns", () => {
  test("is deleted on open with its search hit, a session left without a human turn goes, then the file is vacuumed once", () => {
    const path = join(sandboxDir("qsm-memory-harness-"), "memory.db");
    const db = openDb(path);
    const session = db.query(
      "INSERT INTO sessions VALUES (?, '/w', '/w', 't', 'a', 'b', '/gone', 'c', 3)",
    );
    const turn = db.query("INSERT INTO turns VALUES (?, ?, ?, ?, 't', ?)");
    session.run("mixed");
    turn.run("mixed", 1, "m/1", "user", "fix the gate");
    turn.run(
      "mixed",
      2,
      "m/2",
      "user",
      "This session is being continued from a previous conversation",
    );
    turn.run("mixed", 3, "m/3", "user", "<bash-input>ls</bash-input>");
    session.run("only");
    turn.run(
      "only",
      1,
      "o/1",
      "user",
      "<task-notification><task-id>x</task-id></task-notification>",
    );
    turn.run("only", 2, "o/2", "assistant", "noted");
    db.close();

    const again = openDb(path);

    expect(
      again
        .query<{ seq: number }, []>("SELECT seq FROM turns WHERE session_id = 'mixed' ORDER BY seq")
        .all(),
    ).toEqual([{ seq: 1 }, { seq: 3 }]);
    expect(again.query("SELECT turn_count FROM sessions WHERE id = 'mixed'").get()).toEqual({
      turn_count: 2,
    });
    expect(again.query<{ id: string }, []>("SELECT id FROM sessions").all()).toEqual([
      { id: "mixed" },
    ]);
    expect(
      again.query("SELECT COUNT(*) AS n FROM turns_fts WHERE turns_fts MATCH 'continued'").get(),
    ).toEqual({ n: 0 });
  });
});

describe("an archive written before the pack", () => {
  test("opens, gains the state and packed tables, and keeps its sessions", () => {
    const path = join(sandboxDir("qsm-memory-old-"), "memory.db");
    const old = new Database(path, { create: true });
    old.run(
      "CREATE TABLE sessions (id TEXT PRIMARY KEY, cwd TEXT NOT NULL, project TEXT NOT NULL, title TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT NOT NULL, transcript_path TEXT NOT NULL, saved_at TEXT NOT NULL, turn_count INTEGER NOT NULL)",
    );
    old.run("INSERT INTO sessions VALUES ('s1', '/w', '/w', 't', 'a', 'b', '/p', 'c', 1)");
    old.close();

    const db = openDb(path);
    setState(db, "retention", "qsm");

    expect(getState(db, "retention")).toBe("qsm");
    expect(getState(db, "last_pack_at")).toBeNull();
    expect(db.query("SELECT COUNT(*) AS n FROM packed").get()).toEqual({ n: 0 });
    expect(db.query("SELECT id FROM sessions").all()).toEqual([{ id: "s1" }]);
  });
});
