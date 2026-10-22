import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { TranscriptBuilder, testEnv } from "./fixtures/transcript.ts";
import { blobDir, blobPath } from "./blobs.ts";
import { catchUp, listTranscripts, saveTranscript, unsavedTranscripts } from "./save.ts";
import { applySchema } from "./store.ts";

function db(): Database {
  const d = new Database(":memory:");
  applySchema(d);
  return d;
}

/** A Claude Code projects dir with one project folder. */
function projects(): { root: string; dir: string } {
  const root = sandboxDir("qsm-memory-projects-");
  const dir = join(root, "-home-x-repo");
  mkdirSync(dir);
  return { root, dir };
}

function write(path: string, text: string): string {
  writeFileSync(path, text);
  return path;
}

/** A subagent transcript of session `parent`, which `implement` prompts. */
function subagent(dir: string, parent: string, implement: string): string {
  mkdirSync(join(dir, parent, "subagents"), { recursive: true });
  return write(
    join(dir, parent, "subagents", "agent-1.jsonl"),
    new TranscriptBuilder().human(implement).assistant("done").text(),
  );
}

const SESSION = "11111111-2222-3333-4444-555555555555";

describe("saveTranscript", () => {
  test("a transcript saves as text and nothing else", () => {
    const d = db();
    const { dir } = projects();
    const path = write(
      join(dir, `${SESSION}.jsonl`),
      new TranscriptBuilder()
        .human("rename the verb")
        .assistant("renamed it")
        .toolUse("Edit", { file_path: "/work/repo/cli.ts" })
        .toolResult("edited")
        .title("Fix the gate")
        .junk()
        .text(),
    );

    const r = saveTranscript(d, path, testEnv());

    expect(r).toEqual({ status: "saved", id: SESSION, turns: 2, added: 2 });
    const turns = d
      .query<{ role: string; text: string }, []>("SELECT role, text FROM turns ORDER BY seq")
      .all();
    expect(turns).toEqual([
      { role: "user", text: "rename the verb" },
      { role: "assistant", text: "renamed it" },
    ]);
    const session = d
      .query<{ title: string; project: string; transcript_path: string }, []>(
        "SELECT title, project, transcript_path FROM sessions",
      )
      .get();
    expect(session).toEqual({
      title: "Fix the gate",
      project: "/work/repo",
      transcript_path: path,
    });
  });
});

describe("saveTranscript, pasted images", () => {
  test("a pasted image is copied into the blob store and referenced by turn", () => {
    const d = db();
    const env = testEnv();
    const { dir } = projects();
    const png = Buffer.from("not really a png, but bytes");
    const path = write(
      join(dir, `${SESSION}.jsonl`),
      new TranscriptBuilder().humanWithImage("this layout", png.toString("base64")).text(),
    );

    saveTranscript(d, path, env);
    const blobFiles = () =>
      readdirSync(blobDir(env), { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
        .length;
    expect(blobFiles()).toBe(1);
    saveTranscript(d, path, env);
    expect(blobFiles()).toBe(1);

    const refs = d
      .query<{ turn_uuid: string; sha256: string; media_type: string }, []>(
        "SELECT turn_uuid, sha256, media_type FROM blob_ref",
      )
      .all();
    expect(refs).toHaveLength(1);
    expect(refs[0]?.media_type).toBe("image/png");
    expect(refs[0]?.turn_uuid.endsWith("/1")).toBe(true);
    expect(readFileSync(blobPath(env, refs[0]?.sha256 ?? ""))).toEqual(png);
  });
});

describe("saveTranscript, again", () => {
  test("a resumed session re-saves only the new turns", () => {
    const d = db();
    const { dir } = projects();
    const first = new TranscriptBuilder().human("one").assistant("two");
    const path = write(join(dir, `${SESSION}.jsonl`), first.text());
    saveTranscript(d, path, testEnv());
    appendFileSync(
      path,
      first.human("three").assistant("four").text().split("\n").slice(2).join("\n"),
    );

    const r = saveTranscript(d, path, testEnv());

    expect(r).toEqual({ status: "saved", id: SESSION, turns: 4, added: 2 });
    expect(d.query("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({ n: 1 });
    const seqs = d.query<{ seq: number }, []>("SELECT seq FROM turns ORDER BY seq").all();
    expect(seqs.map((s) => s.seq)).toEqual([1, 2, 3, 4]);
  });
});

describe("saveTranscript, main sessions only", () => {
  test("a subagent transcript and a session nobody typed in are skipped, the second not counted again", () => {
    const d = db();
    const { root, dir } = projects();
    const sub = subagent(dir, SESSION, "implement the noun");
    const headless = write(
      join(dir, `${SESSION}.jsonl`),
      new TranscriptBuilder().headless("run the eval").assistant("done").text(),
    );

    expect(saveTranscript(d, sub, testEnv())).toEqual({
      status: "skipped",
      path: sub,
      reason: "subagent transcript",
    });
    expect(unsavedTranscripts(d, root)).toEqual([headless]);
    expect(saveTranscript(d, headless, testEnv())).toEqual({
      status: "skipped",
      path: headless,
      reason: "no human turn",
    });
    expect(d.query("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({ n: 0 });
    expect(unsavedTranscripts(d, root)).toEqual([]);
  });
});

describe("catch-up", () => {
  test("list --unsaved names transcripts the archive lacks", () => {
    const d = db();
    const { root, dir } = projects();
    const a = write(join(dir, "aaa.jsonl"), new TranscriptBuilder().human("a").text());
    const b = write(join(dir, "bbb.jsonl"), new TranscriptBuilder().human("b").text());
    subagent(dir, "aaa", "c");

    expect(new Set(listTranscripts(root))).toEqual(new Set([a, b]));
    expect(new Set(unsavedTranscripts(d, root))).toEqual(new Set([a, b]));
    expect(d.query("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({ n: 0 });
  });

  test("a transcript newer than its saved-at is saved again", () => {
    const d = db();
    const { root, dir } = projects();
    const path = write(join(dir, "aaa.jsonl"), new TranscriptBuilder().human("a").text());
    saveTranscript(d, path, testEnv(), { now: () => "2026-09-30T10:00:00.000Z" });
    const at = (iso: string): void => {
      utimesSync(path, new Date(iso), new Date(iso));
    };
    at("2026-09-30T09:00:00Z");
    expect(unsavedTranscripts(d, root)).toEqual([]);

    utimesSync(path, new Date("2026-09-30T11:00:00Z"), new Date("2026-09-30T11:00:00Z"));

    expect(unsavedTranscripts(d, root)).toEqual([path]);
    expect(catchUp(d, root, testEnv())).toEqual({ saved: 1, skipped: 0, remain: 0, failed: [] });
  });

  test("catch-up stops at twenty and says how many remain", () => {
    const d = db();
    const { root, dir } = projects();
    for (let i = 0; i < 25; i += 1) {
      write(
        join(dir, `s${String(i).padStart(2, "0")}.jsonl`),
        new TranscriptBuilder().human(`n${i}`).text(),
      );
    }

    expect(catchUp(d, root, testEnv())).toEqual({ saved: 20, skipped: 0, remain: 5, failed: [] });
    expect(catchUp(d, root, testEnv())).toEqual({ saved: 5, skipped: 0, remain: 0, failed: [] });
  });

  test("a session skipped before its first prompt is saved once, not on every catch-up", () => {
    const d = db();
    const { root, dir } = projects();
    const path = write(
      join(dir, "aaa.jsonl"),
      new TranscriptBuilder({ sessionId: "aaa" }).headless("run it").assistant("done").text(),
    );
    const at = (iso: string): void => {
      utimesSync(path, new Date(iso), new Date(iso));
    };
    at("2026-09-30T09:00:00Z");
    expect(catchUp(d, root, testEnv())).toEqual({ saved: 0, skipped: 1, remain: 0, failed: [] });

    write(path, new TranscriptBuilder({ sessionId: "aaa" }).human("now a person types").text());
    at("2026-09-30T10:00:00Z");

    expect(catchUp(d, root, testEnv())).toEqual({ saved: 1, skipped: 0, remain: 0, failed: [] });
    expect(unsavedTranscripts(d, root)).toEqual([]);
    expect(catchUp(d, root, testEnv())).toEqual({ saved: 0, skipped: 0, remain: 0, failed: [] });
  });

  test("transcripts that always fail do not use up the catch-up budget", () => {
    const d = db();
    const { root, dir } = projects();
    for (let i = 0; i < 2; i += 1) {
      mkdirSync(join(dir, `a${i}.jsonl`));
      utimesSync(join(dir, `a${i}.jsonl`), new Date("2020-01-01"), new Date("2020-01-01"));
    }
    for (let i = 0; i < 4; i += 1) {
      write(join(dir, `z${i}.jsonl`), new TranscriptBuilder().human(`n${i}`).text());
    }

    const r = catchUp(d, root, testEnv(), 2);

    expect([r.saved, r.skipped, r.failed.length]).toEqual([2, 0, 2]);
    expect(r.remain).toBe(2);
  });

  test("a transcript that vanished is not pending, and one that cannot be read does not stop the rest", () => {
    const d = db();
    const { root, dir } = projects();
    const good = write(join(dir, "good.jsonl"), new TranscriptBuilder().human("a").text());
    symlinkSync(join(dir, "nowhere.jsonl"), join(dir, "gone.jsonl"));
    mkdirSync(join(dir, "bad.jsonl"));

    expect(new Set(unsavedTranscripts(d, root))).toEqual(new Set([good, join(dir, "bad.jsonl")]));
    const r = catchUp(d, root, testEnv());

    expect([r.saved, r.skipped, r.remain]).toEqual([1, 0, 0]);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]).toStartWith(`${join(dir, "bad.jsonl")}: `);
    expect(d.query("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({ n: 1 });
  });
});
