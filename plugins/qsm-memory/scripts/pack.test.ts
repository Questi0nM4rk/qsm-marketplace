// `qsm-memory pack` through its real surface: this checkout's CLI, a Claude home and an archive in a
// sandbox, the real tar and zstd. The date rule itself is lib/pack.test.ts.

import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { which } from "bun";
import { z } from "zod";
import { cliShim, fakeBin } from "../../../lib/fixtures/bin.ts";
import { envelopeOf, isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { TranscriptBuilder } from "../lib/fixtures/transcript.ts";
import { getState, openDb, setState } from "../lib/store.ts";

setDefaultTimeout(30_000);

const CLI = resolve(import.meta.dir, "cli.ts");
const OLD = new Date("2026-09-01T12:00:00");

function sandbox() {
  const home = sandboxDir("qsm-memory-pack-");
  const claude = join(home, "c");
  const projects = join(claude, "projects", "-home-work");
  const bin = join(home, "bin");
  for (const dir of [projects, bin, join(claude, "sessions")]) {
    mkdirSync(dir, { recursive: true });
  }
  cliShim(bin, "qsm-memory", CLI);
  const env = isolatedEnv(home, {
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    CLAUDE_CONFIG_DIR: claude,
  });
  const dataDir = join(home, "data", "qsm-memory");
  return { home, claude, projects, bin, env, dataDir, db: join(dataDir, "memory.db") };
}

type Box = ReturnType<typeof sandbox>;

function cli(box: Box, argv: readonly string[], env: Record<string, string> = box.env) {
  const r = runBin(CLI, [...argv, "--json"], { cwd: box.home, env });
  return envelopeOf(r.stdout);
}

/** A transcript of one typed prompt, and a session directory beside it when `withDir`. */
function transcript(box: Box, id: string, mtime: Date, withDir = false): string {
  const path = join(box.projects, `${id}.jsonl`);
  writeFileSync(path, new TranscriptBuilder({ sessionId: id }).human(`prompt ${id}`).text());
  if (withDir) {
    mkdirSync(join(box.projects, id, "subagents"), { recursive: true });
    writeFileSync(join(box.projects, id, "subagents", "agent-1.jsonl"), "{}\n");
  }
  utimesSync(path, mtime, mtime);
  return path;
}

/** The choice and the day of activation the activation records, set back so the grace is over, and
 * seven days of use after the idle transcripts' last change. */
function activated(box: Box): void {
  const db = openDb(box.db);
  setState(db, "retention", "qsm");
  setState(db, "activated_at", "2026-01-01T00:00:00.000Z");
  for (const day of [2, 3, 4, 5, 6, 7, 8]) {
    db.query("INSERT INTO sessions VALUES (?, '/w', '/w', 't', ?, ?, '/none', ?, 1)").run(
      `day${day}`,
      `2026-09-0${day}T12:00:00.000Z`,
      `2026-09-0${day}T13:00:00.000Z`,
      "2026-09-09T00:00:00.000Z",
    );
  }
  db.close();
}

const tarList = (archive: string) =>
  spawnSync("tar", ["--zstd", "-tf", archive], { encoding: "utf8" })
    .stdout.split("\n")
    .filter(Boolean);

const hasZstd = which("zstd") !== null && which("tar") !== null;

describe.skipIf(!hasZstd)("pack", () => {
  test("moves the idle ones with their directories, leaves the unsaved, live and recent, and restores", () => {
    const box = sandbox();
    transcript(box, "idle1", OLD, true);
    transcript(box, "idle2", OLD);
    transcript(box, "live", OLD);
    transcript(box, "recent", new Date());
    expect(cli(box, ["save", "--catch-up"]).code).toBe("ok");
    transcript(box, "unsaved", OLD);
    activated(box);
    writeFileSync(
      join(box.claude, "sessions", `${process.pid}.json`),
      JSON.stringify({ pid: process.pid, sessionId: "live" }),
    );

    const r = cli(box, ["pack"]);

    expect({ code: r.code, packed: z.object({ packed: z.number() }).parse(r.data).packed }).toEqual(
      {
        code: "ok",
        packed: 2,
      },
    );
    expect(readdirSync(box.projects).toSorted()).toEqual([
      "live.jsonl",
      "recent.jsonl",
      "unsaved.jsonl",
    ]);
    const [archive] = readdirSync(join(box.dataDir, "transcripts"));
    const path = join(box.dataDir, "transcripts", archive ?? "");
    const base = "projects/-home-work";
    expect(tarList(path).toSorted()).toEqual(
      [
        `${base}/idle1.jsonl`,
        `${base}/idle1/`,
        `${base}/idle1/subagents/`,
        `${base}/idle1/subagents/agent-1.jsonl`,
        `${base}/idle2.jsonl`,
      ].toSorted(),
    );
    const shown = cli(box, ["show", "idle1", "--full"]);
    expect(shown.code).toBe("missing");
    expect(shown.message).toContain(`tar --zstd -xmf '${path}' -C '${box.claude}'`);
    expect(cli(box, ["pack"]).message).toContain("no pack is due: the last pack was on");

    // idle2 has no session directory: its printed command names the transcript alone, and runs
    const bare = cli(box, ["show", "idle2", "--full"]).message;
    const command = bare.slice(bare.indexOf("restore it with ") + "restore it with ".length);
    expect(command.match(/idle2/g)).toHaveLength(1);
    expect(spawnSync("sh", ["-c", command]).status).toBe(0);
    expect(existsSync(join(box.projects, "idle2.jsonl"))).toBe(true);

    spawnSync("tar", [
      "--zstd",
      "-xmf",
      path,
      "-C",
      box.claude,
      `${base}/idle1.jsonl`,
      `${base}/idle1`,
    ]);
    expect(cli(box, ["show", "idle1", "--full"]).code).toBe("ok");
    expect(existsSync(join(box.projects, "idle1", "subagents", "agent-1.jsonl"))).toBe(true);
  });

  test("a missing zstd fails missing, moves nothing and leaves last_pack_at as it was", () => {
    const box = sandbox();
    transcript(box, "idle1", OLD);
    cli(box, ["save", "--catch-up"]);
    activated(box);
    const noZstd = join(box.home, "no-zstd");
    mkdirSync(noZstd);
    fakeBin(noZstd, "tar", `exec "${which("tar") ?? "tar"}" "$@"`);

    const r = cli(box, ["pack"], { ...box.env, PATH: noZstd });

    expect(r.code).toBe("missing");
    expect(r.message).toContain("zstd");
    expect(readdirSync(box.projects)).toEqual(["idle1.jsonl"]);
    expect(getState(openDb(box.db), "last_pack_at")).toBeNull();
  });

  test("a due pack with nothing idle leaves last_pack_at as it was", () => {
    const box = sandbox();
    transcript(box, "recent", new Date());
    cli(box, ["save", "--catch-up"]);
    activated(box);

    const r = cli(box, ["pack"]);

    expect(r.code).toBe("ok");
    expect(r.message).toContain("nothing is idle");
    expect(getState(openDb(box.db), "last_pack_at")).toBeNull();
  });

  test("under claude, or with the grace not over, nothing moves and the reason is named", () => {
    const box = sandbox();
    transcript(box, "idle1", OLD);
    cli(box, ["save", "--catch-up"]);
    activated(box);
    const db = openDb(box.db);
    setState(db, "activated_at", new Date().toISOString());

    expect(cli(box, ["pack"]).message).toContain("within 30 days of activation");
    setState(db, "retention", "claude");
    expect(cli(box, ["pack"]).message).toContain("the recorded retention choice is claude");
    expect(readdirSync(box.projects)).toEqual(["idle1.jsonl"]);
  });

  test("a detached pack appends one timestamped line to save.log", async () => {
    const box = sandbox();
    transcript(box, "idle1", OLD);
    cli(box, ["save", "--catch-up"]);
    activated(box);

    expect(cli(box, ["pack", "--detach"]).code).toBe("ok");

    const log = join(box.dataDir, "save.log");
    const deadline = Date.now() + 20_000;
    while (!(existsSync(log) && readFileSync(log, "utf8").includes("packed 1 sessions"))) {
      if (Date.now() > deadline) {
        throw new Error("save.log never said the pack ended");
      }
      await Bun.sleep(50);
    }
    expect(readFileSync(log, "utf8")).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z packed 1 sessions/);
  });
});
