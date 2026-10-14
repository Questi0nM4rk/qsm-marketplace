// The verbs the two hooks call, run the way the hooks' noun runs them: this checkout's CLI under
// --json, with `qsm-memory` on PATH running this checkout's CLI too, so a detached save is the
// real child. A detached child writes its outcome to save.log beside the archive; a test waits for
// that line before it reads the archive. Which event reaches which verb is hooks/register.test.ts.

import { z } from "zod";
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawn as spawnAsync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TranscriptBuilder } from "../lib/fixtures/transcript.ts";

setDefaultTimeout(30_000);

const CLI = resolve(import.meta.dir, "cli.ts");

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

function sandbox() {
  const home = mkdtempSync(join(tmpdir(), "qsm-memory-hooks-"));
  homes.push(home);
  const work = join(home, "work");
  const projects = join(home, "c", "projects", "-home-work");
  const bin = join(home, "bin");
  for (const dir of [work, projects, bin]) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(bin, "qsm-memory"), `#!/bin/sh\nexec "${process.execPath}" "${CLI}" "$@"\n`);
  chmodSync(join(bin, "qsm-memory"), 0o755);
  const env = {
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    HOME: home,
    CLAUDE_CONFIG_DIR: join(home, "c"),
    XDG_DATA_HOME: join(home, "d"),
  };
  return { home, work, projects, env, log: join(home, "d", "qsm-memory", "save.log") };
}

type Box = ReturnType<typeof sandbox>;

/** This checkout's CLI in the sandbox's work directory. */
function spawn(box: Box, argv: readonly string[], env: Record<string, string> = box.env) {
  return spawnSync(process.execPath, [CLI, ...argv], { encoding: "utf8", cwd: box.work, env });
}

function cli(box: Box, argv: readonly string[]): string {
  const r = spawn(box, argv);
  return r.stdout + r.stderr;
}

const envelopeSchema = z.object({ code: z.string(), message: z.string(), data: z.unknown() });
const briefingSchema = z.object({ text: z.string() });

/** One verb under --json: its exit and its envelope. */
function verb(box: Box, argv: readonly string[], env?: Record<string, string>) {
  const r = spawn(box, [...argv, "--json"], env);
  return { exit: r.status, ...envelopeSchema.parse(JSON.parse(r.stdout)) };
}

/** Waits until save.log holds `text`, the line a detached child writes when it ends. */
async function logged(box: Box, text: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const log = existsSync(box.log) ? readFileSync(box.log, "utf8") : "";
    if (log.includes(text)) {
      return log;
    }
    if (Date.now() > deadline) {
      throw new Error(`save.log never said ${text}; it holds: ${log}`);
    }
    await Bun.sleep(50);
  }
}

/** A transcript of one prompt and a hundred long replies, so a save writes for a while. */
function bigTranscript(i: number): string {
  const builder = new TranscriptBuilder({ sessionId: `s${i}` }).human(`q${i}`);
  for (const j of Array.from({ length: 100 }, (_, n) => n)) {
    builder.assistant(`a${i} ${j} ${"word ".repeat(40)}`);
  }
  return builder.text();
}

/** What one `save --catch-up` printed, stdout and stderr, once it ended. */
function catchUpOutput(box: Box): Promise<string> {
  return new Promise((done) => {
    const child = spawnAsync(process.execPath, [CLI, "save", "--catch-up"], {
      cwd: box.work,
      env: box.env,
    });
    let text = "";
    const add = (chunk: unknown) => {
      text += String(chunk);
    };
    child.stdout.on("data", add);
    child.stderr.on("data", add);
    child.on("close", () => {
      done(text.trim());
    });
  });
}

describe("session end", () => {
  test("session end saves the transcript", async () => {
    const box = sandbox();
    const path = join(box.projects, "s1.jsonl");
    writeFileSync(
      path,
      new TranscriptBuilder({ sessionId: "s1" }).human("hi").assistant("yo").text(),
    );

    const r = verb(box, ["save", path, "--cwd", box.work, "--detach"]);

    expect({ exit: r.exit, code: r.code }).toEqual({ exit: 0, code: "ok" });
    expect(r.message).toBe(`started the save in the background; its outcome goes to ${box.log}`);
    await logged(box, "saved s1: 2 turns");
    expect(cli(box, ["list"])).toContain("s1 2 hi");
  });

  test("a failed save leaves the transcript for the next start", async () => {
    const box = sandbox();
    const path = join(box.projects, "s1.jsonl");
    writeFileSync(path, new TranscriptBuilder({ sessionId: "s1" }).human("hi").text());
    const dataDir = join(box.home, "d", "qsm-memory");
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "memory.db"), "not a database");
    chmodSync(join(dataDir, "memory.db"), 0o400);

    expect(verb(box, ["save", path, "--cwd", box.work, "--detach"]).code).toBe("ok");

    await logged(box, "failed:");
    chmodSync(join(dataDir, "memory.db"), 0o600);
    writeFileSync(join(dataDir, "memory.db"), "");
    expect(cli(box, ["list", "--unsaved"])).toContain(path);
  });

  test("a detached save with qsm-memory off PATH is missing and starts nothing", () => {
    const box = sandbox();

    const r = verb(box, ["save", "/no/such.jsonl", "--detach"], {
      ...box.env,
      PATH: "/usr/bin:/bin",
    });

    expect({ exit: r.exit, code: r.code }).toEqual({ exit: 4, code: "missing" });
    expect(r.message).toBe("qsm-memory is not on PATH");
    expect(existsSync(box.log)).toBe(false);
  });

  test("a detached save with neither a transcript nor --catch-up is a usage error", () => {
    const box = sandbox();

    expect(verb(box, ["save", "--detach"]).code).toBe("usage");
    expect(existsSync(box.log)).toBe(false);
  });
});

describe("session start", () => {
  test("a detached catch-up saves what the archive lacks in the background", async () => {
    const box = sandbox();
    writeFileSync(join(box.projects, "s9.jsonl"), new TranscriptBuilder().human("x").text());

    expect(verb(box, ["save", "--catch-up", "--detach"]).code).toBe("ok");

    await logged(box, "saved 1, 0 remain");
  });

  test("catch-ups that run at once all succeed: a start and an end save together", async () => {
    const box = sandbox();
    for (const i of Array.from({ length: 40 }, (_, n) => n)) {
      writeFileSync(join(box.projects, `s${i}.jsonl`), bigTranscript(i));
    }

    const outputs = await Promise.all([0, 1, 2, 3].map(() => catchUpOutput(box)));

    expect(outputs.filter((text) => !text.startsWith("saved "))).toEqual([]);
  });

  test("orient prints the project's last sessions, its notes and how to search, as text", () => {
    const box = sandbox();
    const path = join(box.projects, "s1.jsonl");
    writeFileSync(
      path,
      new TranscriptBuilder({ sessionId: "s1", cwd: box.work })
        .human("hi")
        .assistant("yo")
        .title("Wire the briefing")
        .text(),
    );
    cli(box, ["save", path]);
    cli(box, ["note", "qsm-1: finish the gate"]);
    const elsewhere = mkdtempSync(join(tmpdir(), "qsm-memory-hooks-elsewhere-"));
    homes.push(elsewhere);

    const here = verb(box, ["orient", "--cwd", box.work]);
    const there = verb(box, ["orient", "--cwd", elsewhere]);

    const { text } = briefingSchema.parse(here.data);
    expect(text).toContain("Wire the briefing (1 user turns)");
    expect(text).toContain("qsm-1: finish the gate");
    expect(text).toContain("qsm-memory search <words>");
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(here.message).toBe(text);
    expect(briefingSchema.parse(there.data).text).not.toContain("Wire the briefing");
    expect(briefingSchema.parse(there.data).text).not.toContain("finish the gate");
  });
});
