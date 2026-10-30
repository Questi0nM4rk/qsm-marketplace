// The date rule of `pack`, with the person's own cases as data. Dates are local noon, so the rule
// reads the local calendar date whatever the time zone of the machine.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { TranscriptBuilder } from "./fixtures/transcript.ts";
import { ageOf, daysOfUse, IDLE_DAYS, notDueBecause, pack, type PackState } from "./pack.ts";
import { saveTranscript } from "./save.ts";
import { getState, openDb, setState } from "./store.ts";

const noon = (date: string) => new Date(`${date}T12:00:00`);
const iso = (date: string) => noon(date).toISOString();

/** The age on `today` of a transcript last changed on `changed`: the sessions started by that day
 * are what the archive held then. */
const age = (changed: string, started: readonly string[], today: string) =>
  ageOf(
    noon(changed).getTime(),
    daysOfUse(started.filter((day) => day <= today).map(iso), noon(today)),
  );

describe("a transcript's age in days of use", () => {
  test("a week off between two Mondays leaves it at 5, so it stays", () => {
    // changed Monday 2026-10-05; sessions Tuesday to Friday; none for 7 days; Monday 2026-10-19
    const started = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
    expect(age("2026-10-05", started, "2026-10-19")).toBe(5);
    expect(age("2026-10-05", started, "2026-10-19")).toBeLessThan(IDLE_DAYS);
  });

  test("a 14-day break with sessions on 2 of its days adds 2", () => {
    // age 1 on 10-02; then sessions on 10-08 and 10-12 and none on the other days of the break
    const started = ["2026-10-02", "2026-10-08", "2026-10-12"];
    expect(age("2026-10-01", started, "2026-10-02")).toBe(1);
    expect(age("2026-10-01", started, "2026-10-12")).toBe(3);
  });

  test("the first day back after a 20-day break ages it by one", () => {
    const started = ["2026-10-01", "2026-10-02", "2026-10-03"];
    expect(age("2026-09-30", started, "2026-10-03")).toBe(3);
    // 20 days with no session, then today
    expect(age("2026-09-30", started, "2026-10-23")).toBe(4);
  });

  test("a session on the day it changed does not age it", () => {
    expect(age("2026-10-05", ["2026-10-05", "2026-10-05"], "2026-10-05")).toBe(0);
  });

  test("two sessions on one day are one day of use", () => {
    expect(age("2026-10-05", ["2026-10-06", "2026-10-06"], "2026-10-07")).toBe(2);
  });
});

describe("whether a pack is due", () => {
  const state = (over: Partial<PackState> = {}): PackState => ({
    retention: "qsm",
    activatedAt: iso("2026-08-01"),
    lastPackAt: null,
    ...over,
  });
  const now = noon("2026-10-30");

  test("due when qsm is chosen and nothing waits", () => {
    expect(notDueBecause(state(), now)).toBeNull();
    expect(notDueBecause(state({ lastPackAt: iso("2026-09-20") }), now)).toBeNull();
  });

  test("10 days after activation is inside the grace", () => {
    expect(notDueBecause(state({ activatedAt: iso("2026-10-20") }), now)).toContain(
      "within 30 days of activation on 2026-10-20",
    );
  });

  test("12 days after the last pack is inside the cadence", () => {
    expect(notDueBecause(state({ lastPackAt: iso("2026-10-18") }), now)).toContain(
      "the last pack was on 2026-10-18; the next pack is 2026-11-17",
    );
  });

  test("the choice claude, or none, is never due", () => {
    expect(notDueBecause(state({ retention: "claude" }), now)).toContain("claude");
    expect(notDueBecause(state({ retention: null }), now)).toContain("no retention choice");
  });
});

/** A Claude home and an archive in a sandbox, with the named sessions saved, idle and 7 days of use
 * after them, a pack due. */
function packBox(ids: readonly string[]) {
  const home = sandboxDir("qsm-memory-safety-");
  const claude = join(home, "c");
  const projects = join(claude, "projects", "-home-work");
  mkdirSync(projects, { recursive: true });
  mkdirSync(join(claude, "sessions"));
  const env = {
    PATH: process.env.PATH,
    CLAUDE_CONFIG_DIR: claude,
    QSM_MEMORY_DB: join(home, "data", "memory.db"),
  };
  const db = openDb(env.QSM_MEMORY_DB);
  for (const id of ids) {
    const path = join(projects, `${id}.jsonl`);
    writeFileSync(path, new TranscriptBuilder({ sessionId: id }).human(`prompt ${id}`).text());
    saveTranscript(db, path, env);
    utimesSync(path, new Date("2026-09-01T12:00:00"), new Date("2026-09-01T12:00:00"));
  }
  for (const day of [2, 3, 4, 5, 6, 7, 8]) {
    db.query("INSERT INTO sessions VALUES (?, '/w', '/w', 't', ?, ?, '/none', ?, 1)").run(
      `day${day}`,
      `2026-09-0${day}T12:00:00.000Z`,
      `2026-09-0${day}T13:00:00.000Z`,
      "2026-09-09T00:00:00.000Z",
    );
  }
  setState(db, "retention", "qsm");
  setState(db, "activated_at", "2026-01-01T00:00:00.000Z");
  const archiveDir = join(home, "data", "transcripts");
  return {
    claude,
    projects,
    env,
    db,
    archiveDir,
    jsonl: (id: string) => join(projects, `${id}.jsonl`),
    /** Claude Code's sessions file for a running pid (the test's own) naming `id` */
    live: (id: string) => {
      writeFileSync(
        join(claude, "sessions", `${process.pid}.json`),
        JSON.stringify({ pid: process.pid, sessionId: id }),
      );
    },
    archives: () => (existsSync(archiveDir) ? readdirSync(archiveDir) : []),
  };
}

const TORN = '{"pid":';

describe("a session that becomes live while the archive is written", () => {
  test("stays in place and is named, and its neighbour is packed", async () => {
    const box = packBox(["idle", "wakes"]);

    const r = await pack(box.db, box.env, new Date(), {
      // Claude Code resumes "wakes" while zstd runs: its sessions file now names a running pid
      afterArchive: () => {
        box.live("wakes");
      },
    });

    expect(r.code).toBe("partial");
    expect(r.warnings).toEqual([`${box.jsonl("wakes")} became live while packing; left in place`]);
    expect(existsSync(box.jsonl("wakes"))).toBe(true);
    expect(existsSync(box.jsonl("idle"))).toBe(false);
    expect(box.db.query("SELECT session_id FROM packed").all()).toEqual([{ session_id: "idle" }]);
    expect(getState(box.db, "last_pack_at")).not.toBeNull();
    expect(getState(box.db, "pack_claim")).toBeNull();
  });
});

describe("a pack that moves nothing", () => {
  test("a file that changes during the pack stays, no archive is left, last_pack_at is as it was", async () => {
    const box = packBox(["busy"]);

    const r = await pack(box.db, box.env, new Date(), {
      afterArchive: () => {
        appendFileSync(box.jsonl("busy"), "{}\n");
      },
    });

    expect(r.code).toBe("partial");
    expect(r.warnings).toEqual([`${box.jsonl("busy")} changed while packing; left in place`]);
    expect(existsSync(box.jsonl("busy"))).toBe(true);
    expect(box.archives()).toEqual([]);
    expect(getState(box.db, "last_pack_at")).toBeNull();
  });
});

describe("two packs started together", () => {
  test("move files once: the second answers that a pack is running", async () => {
    const box = packBox(["idle1", "idle2"]);
    const other = openDb(box.env.QSM_MEMORY_DB);

    const [first, second] = await Promise.all([pack(box.db, box.env), pack(other, box.env)]);

    expect(first.code).toBe("ok");
    expect(second.message).toContain("no pack is due: another pack is running");
    expect(box.archives()).toHaveLength(1);
    expect(box.db.query("SELECT COUNT(*) AS n FROM packed").get()).toEqual({ n: 2 });
  });
});

describe("a pack killed mid-run", () => {
  test("leaves a dead claim and a .part that do not block the next run", async () => {
    const box = packBox(["idle"]);
    const dead = spawnSync("true").pid;
    setState(box.db, "pack_claim", String(dead));
    mkdirSync(box.archiveDir, { recursive: true });
    writeFileSync(join(box.archiveDir, "2026-09-30.tar.zst.part"), "half");

    const r = await pack(box.db, box.env);

    expect(r.code).toBe("ok");
    expect(box.archives()).toHaveLength(1);
    expect(box.archives()[0]).toMatch(/\.tar\.zst$/);
    expect(getState(box.db, "pack_claim")).toBeNull();
  });
});

describe("a sessions file Claude Code is rewriting", () => {
  const readTornOnce = () => {
    const seen = new Set<string>();
    return (path: string) => {
      if (!seen.has(path)) {
        seen.add(path);
        return TORN;
      }
      return readFileSync(path, "utf8");
    };
  };

  test("is read again: it parses the second time, so its session is live and stays", async () => {
    const box = packBox(["idle", "wakes"]);
    box.live("wakes");

    const r = await pack(box.db, box.env, new Date(), { readFile: readTornOnce() });

    expect(r.code).toBe("ok");
    expect(existsSync(box.jsonl("wakes"))).toBe(true);
    expect(existsSync(box.jsonl("idle"))).toBe(false);
  });

  test("that never parses fails before anything is moved", async () => {
    const box = packBox(["idle"]);
    box.live("idle");

    const run = pack(box.db, box.env, new Date(), { readFile: () => TORN });

    expect(run).rejects.toMatchObject({ code: "failed" });
    await run.catch(() => {});
    expect(existsSync(box.jsonl("idle"))).toBe(true);
    expect(box.archives()).toEqual([]);
    expect(getState(box.db, "last_pack_at")).toBeNull();
    expect(getState(box.db, "pack_claim")).toBeNull();
  });

  test("that never parses at the removal check leaves every original and no archive", async () => {
    const box = packBox(["idle1", "idle2"]);
    box.live("none");
    let broken = false;

    const run = pack(box.db, box.env, new Date(), {
      afterArchive: () => {
        broken = true;
      },
      readFile: (path) => (broken ? TORN : readFileSync(path, "utf8")),
    });

    expect(run).rejects.toMatchObject({ code: "failed" });
    await run.catch(() => {});
    expect(existsSync(box.jsonl("idle1"))).toBe(true);
    expect(existsSync(box.jsonl("idle2"))).toBe(true);
    expect(box.archives()).toEqual([]);
    expect(getState(box.db, "last_pack_at")).toBeNull();
  });
});

describe("a transcript that cannot be removed", () => {
  /** The project directory is read-only while the originals go: unlink fails with EACCES. */
  const lockDuringRemoval = (box: ReturnType<typeof packBox>) => ({
    afterArchive: () => {
      chmodSync(box.projects, 0o555);
    },
  });

  test("puts the earlier packed row back, so no row names an archive that is gone", async () => {
    const box = packBox(["stuck"]);
    box.db.run(
      "INSERT INTO packed VALUES ('stuck', '/older.tar.zst', '2026-08-01T00:00:00.000Z', '[\"a\"]')",
    );

    const r = await pack(box.db, box.env, new Date(), lockDuringRemoval(box));
    chmodSync(box.projects, 0o755);

    expect(r.code).toBe("partial");
    expect(existsSync(box.jsonl("stuck"))).toBe(true);
    expect(box.db.query("SELECT archive, packed_at, entries FROM packed").all()).toEqual([
      { archive: "/older.tar.zst", packed_at: "2026-08-01T00:00:00.000Z", entries: '["a"]' },
    ]);
    expect(box.archives()).toEqual([]);
  });

  test("deletes the new row when there was none", async () => {
    const box = packBox(["stuck"]);

    await pack(box.db, box.env, new Date(), lockDuringRemoval(box));
    chmodSync(box.projects, 0o755);

    expect(box.db.query("SELECT session_id FROM packed").all()).toEqual([]);
  });
});

describe("an archive that is already there", () => {
  const now = new Date("2026-10-30T12:00:00");

  test("a killed run's copy is kept untouched and the next run writes the next free name", async () => {
    const box = packBox(["idle"]);
    // the run is killed after the rename: the archive exists, no row names it, nothing was removed
    await pack(box.db, box.env, now, {
      afterArchive: () => {
        throw new Error("killed");
      },
    }).catch(() => null);
    const killed = join(box.archiveDir, "2026-10-30.tar.zst");
    const bytes = readFileSync(killed);

    const r = await pack(box.db, box.env, now);

    expect(r.code).toBe("ok");
    expect(box.archives().toSorted()).toEqual(["2026-10-30-2.tar.zst", "2026-10-30.tar.zst"]);
    expect(readFileSync(killed).equals(bytes)).toBe(true);
    expect(existsSync(box.jsonl("idle"))).toBe(false);
    expect(box.db.query("SELECT archive FROM packed").all()).toEqual([
      { archive: join(box.archiveDir, "2026-10-30-2.tar.zst") },
    ]);
  });

  test("after a rebuilt database, the only copy of a subagent transcript is not touched", async () => {
    const box = packBox(["idle1"]);
    mkdirSync(join(box.projects, "idle1", "subagents"), { recursive: true });
    writeFileSync(join(box.projects, "idle1", "subagents", "agent-1.jsonl"), "{}\n");
    expect((await pack(box.db, box.env, now)).code).toBe("ok");
    const first = join(box.archiveDir, "2026-10-30.tar.zst");
    const bytes = readFileSync(first);
    // the database is rebuilt: the rows are lost; only the main transcript is restored by hand
    box.db.run("DELETE FROM packed");
    setState(box.db, "last_pack_at", null);
    spawnSync("tar", [
      "--zstd",
      "-xmf",
      first,
      "-C",
      box.claude,
      "projects/-home-work/idle1.jsonl",
    ]);
    expect(existsSync(box.jsonl("idle1"))).toBe(true);
    expect(existsSync(join(box.projects, "idle1", "subagents"))).toBe(false);
    const path = box.jsonl("idle2");
    writeFileSync(path, new TranscriptBuilder({ sessionId: "idle2" }).human("x").text());
    saveTranscript(box.db, path, box.env);
    utimesSync(path, new Date("2026-09-01T12:00:00"), new Date("2026-09-01T12:00:00"));

    const r = await pack(box.db, box.env, now);

    expect(r.code).toBe("ok");
    expect(readFileSync(first).equals(bytes)).toBe(true);
    expect(box.archives().toSorted()).toEqual(["2026-10-30-2.tar.zst", "2026-10-30.tar.zst"]);
  });
});
