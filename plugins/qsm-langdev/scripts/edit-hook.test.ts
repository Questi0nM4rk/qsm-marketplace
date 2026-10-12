// The `edited` verb the edit hook calls after a file edit, spawned as the noun spawns it: argv in,
// the --json envelope out. Its text is what the hook hands the model as context.

import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "cli.ts");
const GIT = "/usr/bin/git";

const sandboxes: string[] = [];

/** A directory under the system temp directory, removed after each test
 * whether the test passed or failed, with whatever the hook wrote into it. */
function sandbox(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  while (sandboxes.length > 0) {
    rmSync(sandboxes.pop() ?? "", { recursive: true, force: true });
  }
});

function git(root: string, args: string[]): void {
  const r = spawnSync(GIT, args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  }
}

/** A sandbox git repository with one commit holding one tracked file, and
 * that commit's id. */
function repoWithFile(fileName: string, content: string): { root: string; head: string } {
  const root = sandbox("qsm-langdev-edit-hook-repo-");
  git(root, ["init", "-q"]);
  writeFileSync(join(root, fileName), content);
  git(root, ["add", "-A"]);
  git(root, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "base"]);
  const head = spawnSync(GIT, ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
  return { root, head };
}

/** Opts `root` into qsm-langdev with no gates and no languages. */
function initGates(root: string): void {
  mkdirSync(join(root, ".qsm-langdev"), { recursive: true });
  writeFileSync(
    join(root, ".qsm-langdev", "gates.json"),
    `${JSON.stringify({ hooks: { "pre-commit": [], "pre-push": [] }, languages: [] })}\n`,
  );
}

/** notes.md edited to `content` in a repository set up for qsm-langdev, and what the hook said. */
function editMarkdown(content: string) {
  const { root } = repoWithFile("notes.md", "# notes\n");
  writeFileSync(join(root, "notes.md"), content);
  initGates(root);
  return { root, r: runEdited(join(root, "notes.md")) };
}

/** The verb's exit and its envelope's findings text (null when it had nothing to say). */
function runEdited(file: string, stateDir = sandbox("qsm-langdev-edit-hook-state-")) {
  const argv = ["edited", file, "--session", "s1", "--agent", "a1", "--json"];
  const r = spawnSync("bun", [CLI, ...argv], {
    encoding: "utf8",
    env: { ...process.env, QSM_LANGDEV_STATE_DIR: stateDir },
  });
  const { data } = JSON.parse(r.stdout) as { data: { text: string | null } };
  return { status: r.status, text: data.text };
}

/** The single file under `<state>/start/<session>/<agent>/` — its name is a
 * sanitised repo root, which this reads back from disk rather than
 * re-deriving. */
function startPointFiles(stateDir: string, sessionId: string, agentId: string): string[] {
  return readdirSync(join(stateDir, "start", sessionId, agentId));
}

function readStartPoint(
  stateDir: string,
  sessionId: string,
  agentId: string,
  name: string,
): unknown {
  return JSON.parse(readFileSync(join(stateDir, "start", sessionId, agentId, name), "utf8"));
}

describe("qsm-langdev edit hook", () => {
  test("a file outside any git repo prints nothing", () => {
    const plainDir = sandbox("qsm-langdev-edit-hook-plain-");
    const filePath = join(plainDir, "notes.txt");
    writeFileSync(filePath, "hello\n");
    const r = runEdited(filePath);

    expect(r.status).toBe(0);
    expect(r.text).toBeNull();
  });

  test("an edited tracked file records the agent's start point and never blocks", () => {
    const { root, head } = repoWithFile("notes.txt", "alpha\n");
    writeFileSync(join(root, "notes.txt"), "alpha\nedited\n");
    const stateDir = sandbox("qsm-langdev-edit-hook-state-");

    const r = runEdited(join(root, "notes.txt"), stateDir);

    expect(r.status).toBe(0);

    const names = startPointFiles(stateDir, "s1", "a1");
    expect(names).toHaveLength(1);
    const recorded = readStartPoint(stateDir, "s1", "a1", names[0] as string) as {
      root: string;
      start: string;
    };
    expect(recorded.start).toBe(head);
  });
});

describe("qsm-langdev edit hook: a repository that never ran init", () => {
  test("The edit hook in an un-init'd repository", () => {
    const { root } = repoWithFile("notes.md", "# notes\n");
    writeFileSync(join(root, "notes.md"), "#no-space-heading\n");
    const r = runEdited(join(root, "notes.md"));

    expect(r.status).toBe(0);
    expect(r.text).toBeNull();
  });

  test("A written file gained a finding", () => {
    const { r } = editMarkdown("#no-space-heading\n");

    expect(r.status).toBe(0);
    expect(r.text).toContain("qsm-langdev on notes.md against HEAD");
  });
});

describe("qsm-langdev edit hook: markdown line length", () => {
  const long = `${"word ".repeat(32)}end`;

  test("a long prose line is rewrapped and MD013 is not a finding", () => {
    const { root, r } = editMarkdown(`# notes\n\n${long}\n`);

    expect(r.status).toBe(0);
    expect(readFileSync(join(root, "notes.md"), "utf8")).not.toContain(long);
    expect(r.text ?? "").not.toContain("MD013");
  });
});

describe("qsm-langdev pre-commit hook: markdown line length", () => {
  test("a staged long prose line is rewrapped and re-staged, the hook passes", () => {
    const { root } = repoWithFile("seed.txt", "x\n");
    spawnSync("bun", [CLI, "init", root, "--profile", "general"], { encoding: "utf8" });
    const long = `${"word ".repeat(32)}end`;
    writeFileSync(join(root, "a.md"), `# A\n\n${long}\n`);
    git(root, ["add", "-A"]);

    const argv = [CLI, "hook", "pre-commit"];
    const hook = spawnSync("bun", argv, { cwd: root, encoding: "utf8" });

    const staged = spawnSync(GIT, ["show", ":a.md"], { cwd: root, encoding: "utf8" }).stdout;
    expect(hook.status).toBe(0);
    expect(staged).not.toContain(long);
    expect(staged.split("\n").every((l) => l.length <= 100)).toBe(true);
  });
});

describe("qsm-langdev pre-commit hook: static fixers", () => {
  const staged = (root: string, path: string) =>
    spawnSync(GIT, ["show", `:${path}`], { cwd: root, encoding: "utf8" }).stdout;
  const hookArgv = [CLI, "hook", "pre-commit"];
  const preCommit = (root: string) => spawnSync("bun", hookArgv, { cwd: root, encoding: "utf8" });
  const initRepo = () => {
    const { root } = repoWithFile("seed.ts", "export {};\n");
    spawnSync("bun", [CLI, "init", root, "--profile", "general"], { encoding: "utf8" });
    return root;
  };

  test("a biome format defect and a markdown rule are fixed in the staged blobs, the hook passes", () => {
    const root = initRepo();
    writeFileSync(join(root, "a.ts"), "export const a  =  1\n");
    writeFileSync(join(root, "a.md"), "# A\n\n*   one\n*   two\n");
    git(root, ["add", "-A"]);

    const hook = preCommit(root);

    expect(hook.status).toBe(0);
    expect(staged(root, "a.ts")).toBe("export const a = 1;\n");
    expect(staged(root, "a.md")).toContain("* one\n");
  }, 60_000);

  test("a finding no fixer can rewrite still blocks", () => {
    const root = initRepo();
    writeFileSync(join(root, "a.ts"), "export const a: any = 1;\n");
    git(root, ["add", "-A"]);

    expect(preCommit(root).status).not.toBe(0);
  }, 60_000);

  test("a staged file with unstaged changes is named as not auto-fixed when the gate blocks", () => {
    const root = initRepo();
    writeFileSync(join(root, "a.md"), "# A\n\n#no-space\n");
    git(root, ["add", "-A"]);
    writeFileSync(join(root, "a.md"), "# A\n\n#no-space\n\nmore\n");

    const hook = preCommit(root);

    expect(hook.status).not.toBe(0);
    expect(hook.stdout + hook.stderr).toContain(
      "a.md: not auto-fixed, it has unstaged changes. Stage or stash them, then commit again.",
    );
  }, 60_000);
});
