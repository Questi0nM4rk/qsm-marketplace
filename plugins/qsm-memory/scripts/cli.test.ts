// qsm-memory through its real surface: the binary's argv, stdout, stderr, exit.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { which } from "bun";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { initialize, spawnServer } from "../../../lib/mcp-stdio.ts";
import { TranscriptBuilder } from "../lib/fixtures/transcript.ts";

const CLI = resolve(import.meta.dir, "cli.ts");

// Every call starts a bun process (0.6 to 1 s idle); the catch-up and note tests make five, so
// 5 s at rest and more under a loaded gate. 30 s leaves six times the measured worst case.
setDefaultTimeout(30_000);

interface Sandbox {
  readonly home: string;
  readonly work: string;
  readonly projects: string;
}

function sandbox(): Sandbox {
  const home = sandboxDir("qsm-memory-cli-");
  const work = join(home, "work");
  const projects = join(home, "c", "projects", "-home-work");
  mkdirSync(work, { recursive: true });
  mkdirSync(projects, { recursive: true });
  return { home, work, projects };
}

function env(box: Sandbox) {
  return {
    PATH: process.env.PATH ?? "",
    HOME: box.home,
    CLAUDE_CONFIG_DIR: join(box.home, "c"),
    XDG_DATA_HOME: join(box.home, "d"),
  };
}

function run(
  box: Sandbox,
  argv: readonly string[],
  environment: Record<string, string> = env(box),
) {
  const r = spawnSync("bun", [CLI, ...argv], { encoding: "utf8", cwd: box.work, env: environment });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr, text: r.stdout + r.stderr };
}

function transcript(box: Sandbox, name: string, text: string): string {
  const path = join(box.projects, name);
  writeFileSync(path, text);
  return path;
}

describe("qsm-memory cli", () => {
  test("--help lists every verb qsm.json declares", () => {
    const r = run(sandbox(), ["--help"]);
    expect(r.exit).toBe(0);
    for (const verb of ["save", "search", "show", "list", "note", "notes", "orient", "mcp"]) {
      expect(r.stderr + r.stdout).toContain(verb);
    }
  });

  test("save then search then show, through argv", () => {
    const box = sandbox();
    const path = transcript(
      box,
      "s1.jsonl",
      new TranscriptBuilder({ sessionId: "s1" })
        .human("fix the flaky test")
        .assistant("found it")
        .toolUse("Bash", { command: "bun test --rerun" })
        .toolResult("3 pass")
        .title("Flaky test")
        .text(),
    );

    expect(run(box, ["save", path]).text).toContain("saved s1: 2 turns, 2 new");
    const found = run(box, ["search", "flaky found", "--json"]);
    expect(found.exit).toBe(0);
    expect(JSON.parse(found.stdout).message).toContain("s1 #");
    expect(run(box, ["show", "s1"]).text).not.toContain("tool Bash");
    expect(run(box, ["show", "s1", "--full"]).text).toContain("#3 tool Bash");
    expect(run(box, ["list"]).text).toContain("s1 2 Flaky test");
  });

  test("nothing matches says so and guesses nothing", () => {
    const r = run(sandbox(), ["search", "nothing", "--json"]);
    expect(JSON.parse(r.stdout).message).toBe("no session matches");
  });

  test("a session with no human turn is skipped", () => {
    const box = sandbox();
    const path = transcript(box, "s2.jsonl", new TranscriptBuilder().assistant("x").text());
    const r = run(box, ["save", path, "--json"]);
    expect(r.exit).toBe(0);
    expect(JSON.parse(r.stdout).message).toBe(`skipped: no human turn in ${path}`);
  });
});

describe("qsm-memory cli, main sessions only", () => {
  test("catch-up names and saves only a main transcript a person typed in", () => {
    const box = sandbox();
    const main = transcript(
      box,
      "s3.jsonl",
      new TranscriptBuilder().human("a").assistant("b").text(),
    );
    transcript(
      box,
      "s4.jsonl",
      new TranscriptBuilder().headless("run it").assistant("done").text(),
    );
    mkdirSync(join(box.projects, "s3", "subagents"), { recursive: true });
    writeFileSync(
      join(box.projects, "s3", "subagents", "agent-1.jsonl"),
      new TranscriptBuilder().human("sub task").text(),
    );

    const unsaved = run(box, ["list", "--unsaved"]).text;
    expect(unsaved).toContain(main);
    expect(unsaved).not.toContain("subagents");

    expect(run(box, ["save", "--catch-up"]).text).toContain("saved 1, 1 skipped, 0 remain");
    expect(run(box, ["list", "--unsaved"]).text).toContain("nothing unsaved");
    expect(run(box, ["list"]).text).toContain("s3 2 ");
    expect(run(box, ["doctor"]).text).toContain("1 sessions, 0 notes; nothing unsaved");
  });
});

describe("qsm-memory cli, bounds and loud failures", () => {
  test("list stops at --limit and says how many more, in the CLI text and its json data", () => {
    const box = sandbox();
    for (let i = 0; i < 4; i++) {
      transcript(
        box,
        `m${i}.jsonl`,
        new TranscriptBuilder({ sessionId: `m${i}` }).human("x").text(),
      );
    }
    expect(run(box, ["save", "--catch-up"]).text).toContain("saved 4");

    const text = run(box, ["list", "--limit", "3"]).stdout.trimEnd().split("\n");
    expect(text).toHaveLength(4);
    expect(text.at(-1)).toBe("1 more: --limit 4");
    const json = JSON.parse(run(box, ["list", "--limit", "3", "--json"]).stdout);
    expect(json.data).toHaveLength(3);
    expect(run(box, ["list", "--limit", "0"]).exit).toBe(2);
  });

  test("an unparseable --since is usage, not the whole archive", () => {
    const box = sandbox();
    transcript(box, "w1.jsonl", new TranscriptBuilder({ sessionId: "w1" }).human("x").text());
    run(box, ["save", "--catch-up"]);
    const r = run(box, ["list", "--since", "last week", "--json"]);
    expect(r.exit).toBe(2);
    expect(JSON.parse(r.stdout).message).toContain("--since takes Nd or a date (got 'last week')");
    expect(run(box, ["search", "x", "--since", "7days"]).exit).toBe(2);
  });

  test("a catch-up with a file it cannot read is partial, names it, and saves the rest", () => {
    const box = sandbox();
    transcript(box, "ok1.jsonl", new TranscriptBuilder({ sessionId: "ok1" }).human("x").text());
    mkdirSync(join(box.projects, "bad.jsonl"));
    const r = run(box, ["save", "--catch-up", "--json"]);
    const out = JSON.parse(r.stdout);
    expect(r.exit).toBe(0);
    expect(out.code).toBe("partial");
    expect(out.message).toBe("saved 1, 1 failed, 0 remain");
    expect(out.warnings[0]).toContain("bad.jsonl");
    expect(run(box, ["list"]).stdout).toContain("ok1");
  });

  test("save --log puts an ISO timestamp before every line it prints", () => {
    const box = sandbox();
    mkdirSync(join(box.projects, "bad.jsonl"));
    const r = run(box, ["save", "--catch-up", "--log"]);
    const lines = (r.stdout + r.stderr).trimEnd().split("\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z \S/);
    }
  });
});

describe("qsm-memory cli, notes and errors", () => {
  test("note and notes, with the secret refusal and drop", () => {
    const box = sandbox();
    const noted = run(box, ["note", "qsm-x: gate red, fix first", "--json"]);
    expect(noted.exit).toBe(0);
    const { id } = JSON.parse(noted.stdout).data as { id: string };
    expect(run(box, ["notes"]).text).toContain("qsm-x: gate red, fix first");
    const refused = run(box, ["note", `key AKIA${"A".repeat(16)}`, "--json"]);
    expect(refused.exit).toBe(5);
    expect(JSON.parse(refused.stdout).code).toBe("blocked");
    expect(run(box, ["note", "--drop", id]).text).toContain(`dropped ${id}`);
    expect(run(box, ["notes"]).text).toContain("no notes");
  });

  test("doctor reports the archive and what it lacks", () => {
    const box = sandbox();
    transcript(box, "s5.jsonl", new TranscriptBuilder().human("a").text());
    const r = run(box, ["doctor", "--json"]);
    expect(r.exit).toBe(0);
    expect(JSON.parse(r.stdout).message).toContain("0 sessions, 0 notes; 1 unsaved");
  });

  test("no verb removes a saved session", () => {
    const r = run(sandbox(), ["--help"]);
    for (const verb of ["forget", "gc", "delete", "remove", "prune"]) {
      expect(r.stdout + r.stderr).not.toContain(`qsm-memory ${verb}`);
    }
  });
});

describe("qsm-memory cli, contract", () => {
  test("Run with no harness", () => {
    const box = sandbox();
    const r = run(box, ["search", "x"], {
      PATH: process.env.PATH ?? "",
      QSM_MEMORY_DB: join(box.home, "plain.db"),
    });
    expect(r.exit).toBe(0);
    expect(r.text).toContain("no session matches");
  });

  test("Another plugin searches", () => {
    const types = readFileSync(resolve(import.meta.dir, "../types/index.d.ts"), "utf8");
    expect(types).toContain("search(");
    expect(types).toContain("note(");
    expect(types).not.toContain("recall(");
  });

  test("a missing session is missing, an unknown verb is usage", () => {
    const r = run(sandbox(), ["show", "nope", "--json"]);
    expect(r.exit).toBe(4);
    expect(JSON.parse(r.stdout).code).toBe("missing");
    expect(run(sandbox(), ["recall", "x"]).exit).toBe(2);
  });

  test("orient in a repository with a tracker and no task tool is missing, naming qsm-tasks", () => {
    const box = sandbox();
    mkdirSync(join(box.work, ".beads"));
    // git stays reachable: without it the project key fails first, which is its own error.
    const bin = join(box.home, "bin");
    mkdirSync(bin);
    symlinkSync(which("git") as string, join(bin, "git"));
    const r = run(box, ["orient", "--json"], {
      ...env(box),
      PATH: `${dirname(process.execPath)}:${bin}`,
    });
    expect(r.exit).toBe(4);
    expect(JSON.parse(r.stdout).message).toContain("qsm-tasks");
  });

  test("a client lists five tools", async () => {
    const box = sandbox();
    const server = spawnServer(["bun", CLI, "mcp"], { env: env(box), cwd: box.work });
    await server.request(initialize(1, LATEST_PROTOCOL_VERSION));
    server.notify({ jsonrpc: "2.0", method: "notifications/initialized" });
    const reply = (await server.request({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    })) as unknown as { result: { tools: { name: string }[] } };
    server.closeStdin();
    await server.exited;
    expect(reply.result.tools.map((t) => t.name).sort((a, b) => a.localeCompare(b))).toEqual([
      "list",
      "note",
      "notes",
      "search",
      "show",
    ]);
  });
});
