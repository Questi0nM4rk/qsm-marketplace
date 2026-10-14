import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { addNote } from "./notes.ts";
import { BLOCK_MAX, orient } from "./orient.ts";
import { applySchema } from "./store.ts";

function archive(project: string, titles: readonly string[]): Database {
  const db = new Database(":memory:");
  applySchema(db);
  titles.forEach((title, i) => {
    const id = `s${i}`;
    const day = `2026-10-0${i + 1}T10:00:00.000Z`;
    db.query("INSERT INTO sessions VALUES (?, '/w', ?, ?, ?, ?, '/gone', ?, 2)").run(
      id,
      project,
      title,
      day,
      day,
      day,
    );
    db.query("INSERT INTO turns VALUES (?, 1, ?, 'user', 't', 'hello')").run(id, `${id}/u`);
    db.query("INSERT INTO turns VALUES (?, 2, ?, 'assistant', 't', 'hi')").run(id, `${id}/a`);
  });
  return db;
}

/** A work tree with a `.beads/` and a PATH holding a `br` that answers like the real one. */
function tracker(): { cwd: string; env: Record<string, string> } {
  const root = sandboxDir("qsm-memory-orient-");
  const cwd = join(root, "repo");
  const bin = join(root, "bin");
  mkdirSync(join(cwd, ".beads"), { recursive: true });
  mkdirSync(bin);
  const br = join(bin, "br");
  writeFileSync(
    br,
    `#!/bin/sh
case "$1 $2 $3" in
  "list -s in_progress") echo '{"issues":[{"id":"x-1.2","title":"Wire the hook"}]}' ;;
  "list -s closed") echo '{"issues":[{"id":"x-1.1","title":"Save","closed_at":"2026-10-06T10:30:00.123456789Z"}]}' ;;
  "show x-1.2 --json") echo '[{"id":"x-1.2","title":"Wire the hook","parent":"x-1"}]' ;;
  "show x-1 --json") echo '[{"id":"x-1","title":"Session briefing epic"}]' ;;
  *) echo "unexpected: $*" >&2; exit 3 ;;
esac
`,
  );
  chmodSync(br, 0o755);
  return { cwd, env: { PATH: `${bin}:${process.env.PATH ?? ""}` } };
}

describe("orient", () => {
  test("names the last three sessions, the bead in progress with its epic, the notes and how to search", () => {
    const { cwd, env } = tracker();
    const db = archive(cwd, ["one", "two", "three", "four", "five", "six"]);
    addNote(db, { text: "x-1.1: gate red, fix first", project: cwd, expiresDays: 14 });

    const block = orient(db, cwd, { env });

    expect(block).toContain("2026-10-06 six (1 user turns)");
    expect(block).toContain("2026-10-04 four");
    expect(block).not.toContain("2026-10-03 three");
    expect(block).toContain("- x-1.2 Wire the hook (epic x-1 Session briefing epic)");
    expect(block).toContain("gate red, fix first");
    expect(block).toContain("qsm-memory search <words>");
    expect(block.length).toBeLessThanOrEqual(BLOCK_MAX);
  });

  test("without .beads/ the bead lines are left out, silently", () => {
    const bare = sandboxDir("qsm-memory-orient-bare-");
    const db = archive(bare, ["only"]);

    const noBeads = orient(db, bare, { env: tracker().env });

    expect(noBeads).not.toContain("In progress");
    expect(noBeads).toContain("only");
  });
});

/** Makes `cwd` a repository with one commit per date, oldest first. */
function commits(cwd: string, dated: readonly [string, string][]): void {
  const git = (args: string[], date?: string) => {
    const r = spawnSync("git", ["-C", cwd, ...args], {
      env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date },
    });
    if (r.status !== 0) {
      throw new Error(String(r.stderr));
    }
  };
  git(["init", "-q"]);
  git(["config", "user.email", "t@t"]);
  git(["config", "user.name", "t"]);
  for (const [date, subject] of dated) {
    git(["commit", "-q", "--allow-empty", "-m", subject], date);
  }
}

describe("orient, what a session left behind", () => {
  test("the commits and closed beads of the session's window, and nothing older", () => {
    const { cwd, env } = tracker();
    const db = archive(cwd, ["one", "two", "three", "four", "five"]);
    db.query("INSERT INTO sessions VALUES ('s9', '/w', ?, 'six', ?, ?, '/gone', ?, 2)").run(
      cwd,
      "2026-10-06T10:00:00.000Z",
      "2026-10-06T12:00:00.000Z",
      "2026-10-06T12:00:00.000Z",
    );
    commits(cwd, [
      ["2026-09-01T10:00:00+00:00", "feat: before every session"],
      ["2026-10-06T10:10:00+00:00", "feat: first in six"],
      ["2026-10-06T13:10:00+02:00", "fix: second in six"],
    ]);

    const block = orient(db, cwd, { env });

    expect(block).toContain(
      'six (0 user turns): 2 commits, last "fix: second in six"; closed x-1.1',
    );
    expect(block).not.toContain("before every session");
    expect(block).not.toContain("1 commits");
  });
});

describe("orient, limits", () => {
  test("only the three tasks it shows are resolved with br show", () => {
    const { cwd, env } = tracker();
    const db = archive(cwd, ["one"]);
    const bin = (env.PATH ?? "").split(":")[0] as string;
    const log = join(bin, "calls");
    const items = Array.from({ length: 8 }, (_, i) => `{"id":"x-${i}","title":"t${i}"}`).join(",");
    writeFileSync(
      join(bin, "br"),
      `#!/bin/sh
echo "$*" >> ${log}
case "$1 $2 $3" in
  "list -s in_progress") echo '{"issues":[${items}]}' ;;
  "list -s closed") echo '{"issues":[]}' ;;
  *) echo '[{"id":"x","title":"t"}]' ;;
esac
`,
    );

    const block = orient(db, cwd, { env });

    const shows = readFileSync(log, "utf8")
      .split("\n")
      .filter((l) => l.startsWith("show"));
    expect(shows).toEqual(["show x-0 --json", "show x-1 --json", "show x-2 --json"]);
    expect(block).toContain("x-2");
    expect(block).not.toContain("x-3");
  });

  test("a long title, many notes: still under the limit, the newest note first", () => {
    const { cwd, env } = tracker();
    const db = archive(
      cwd,
      Array.from({ length: 6 }, () => "t".repeat(300)),
    );
    for (let i = 0; i < 12; i += 1) {
      addNote(db, {
        text: `note ${i} ${"n".repeat(120)}`,
        project: cwd,
        expiresDays: 14,
        now: Date.now() + i,
      });
    }

    const block = orient(db, cwd, { env });

    expect(block.length).toBeLessThanOrEqual(BLOCK_MAX);
    expect(block).toContain("note 11");
    expect(block).toContain("qsm-memory show <id>");
  });

  test("a tracker without br is loud", () => {
    const { cwd } = tracker();
    const db = archive(cwd, ["one"]);
    expect(() => orient(db, cwd, { env: { PATH: "/nonexistent" } })).toThrow("qsm-tasks");
  });

  test("a br that fails is loud", () => {
    const { cwd } = tracker();
    const db = archive(cwd, ["one"]);
    const broken = sandboxDir("qsm-memory-orient-broken-");
    mkdirSync(join(broken, "bin"));
    writeFileSync(join(broken, "bin", "br"), "#!/bin/sh\necho boom >&2\nexit 1\n");
    chmodSync(join(broken, "bin", "br"), 0o755);
    expect(() => orient(db, cwd, { env: { PATH: join(broken, "bin") } })).toThrow("boom");
  });
});
