// The `edited` verb the edit hook calls after a file edit, spawned as the noun spawns it: argv in,
// the --json envelope out. Its text is what the hook hands the model as context.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { commit, git } from "../../../lib/fixtures/git.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { recordOf } from "../lib/json.ts";
import { defined } from "../lib/test-support.ts";

const CLI = resolve(import.meta.dir, "cli.ts");

/** A sandbox git repository with one commit holding one tracked file, and
 * that commit's id. */
function repoWithFile(fileName: string, content: string): { root: string; head: string } {
  const root = sandboxDir("qsm-langdev-edit-hook-repo-");
  git(root, "init", "-q");
  writeFileSync(join(root, fileName), content);
  commit(root, "base");
  return { root, head: git(root, "rev-parse", "HEAD") };
}

/** notes.md edited to `content` in a repository that ran `init` and committed its configs, as a
 * person does, and what the hook said. */
function editMarkdown(content: string) {
  const { root } = repoWithFile("notes.md", "# notes\n");
  runBin(CLI, ["init", root, "--profile", "general"], { env: tmpEnv() });
  commit(root, "init");
  writeFileSync(join(root, "notes.md"), content);
  return { root, r: runEdited(join(root, "notes.md")) };
}

/** The environment of a spawned binary: semgrep makes its own semgrep-mcp directory in the temp
 * root, so the binary gets a sandbox as its root. */
function tmpEnv(stateDir?: string): Record<string, string> {
  return isolatedEnv(sandboxDir("qsm-langdev-edit-hook-home-"), {
    TMPDIR: sandboxDir("qsm-langdev-edit-hook-tmp-"),
    ...(stateDir === undefined ? {} : { QSM_LANGDEV_STATE_DIR: stateDir }),
  });
}

/** The verb's exit and its envelope's findings text (null when it had nothing to say). */
function runEdited(file: string, stateDir = sandboxDir("qsm-langdev-edit-hook-state-")) {
  const argv = ["edited", file, "--session", "s1", "--agent", "a1", "--json"];
  const r = runBin(CLI, argv, { env: tmpEnv(stateDir) });
  const data = defined(recordOf(recordOf(JSON.parse(r.stdout))?.data), "the verb's data");
  return { status: r.exit, text: typeof data.text === "string" ? data.text : null };
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
    const plainDir = sandboxDir("qsm-langdev-edit-hook-plain-");
    const filePath = join(plainDir, "notes.txt");
    writeFileSync(filePath, "hello\n");
    const r = runEdited(filePath);

    expect(r.status).toBe(0);
    expect(r.text).toBeNull();
  });

  test("an edited tracked file records the agent's start point and never blocks", () => {
    const { root, head } = repoWithFile("notes.txt", "alpha\n");
    writeFileSync(join(root, "notes.txt"), "alpha\nedited\n");
    const stateDir = sandboxDir("qsm-langdev-edit-hook-state-");

    const r = runEdited(join(root, "notes.txt"), stateDir);

    expect(r.status).toBe(0);

    const names = startPointFiles(stateDir, "s1", "a1");
    expect(names).toHaveLength(1);
    const recorded = readStartPoint(stateDir, "s1", "a1", defined(names[0], "a start point"));
    expect(recordOf(recorded)?.start).toBe(head);
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
    // A fence with no language is a finding no fixer can rewrite.
    const { r } = editMarkdown("# notes\n\n```\nx\n```\n");

    expect(r.status).toBe(0);
    expect(r.text).toContain("qsm-langdev: notes.md breaks this project's rules");
    expect(r.text).toContain("notes.md:3: MD040/fenced-code-language");
    expect(r.text).not.toContain(" -> ");
  });

  test("A clean edit says nothing", () => {
    const { r } = editMarkdown("# notes\n\nfine\n");

    expect(r.status).toBe(0);
    expect(r.text).toBeNull();
  });

  test("A new file git does not track is checked in place", () => {
    const { root } = editMarkdown("# notes\n");
    writeFileSync(join(root, "new.md"), "# new\n\n```\nx\n```\n");

    const r = runEdited(join(root, "new.md"));

    expect(r.status).toBe(0);
    expect(r.text).toContain("new.md:3: MD040/fenced-code-language");
  });

  test("A finding the file already had at HEAD is reported: the rules decide, not HEAD", () => {
    const { root } = editMarkdown("# notes\n\n```\nx\n```\n");
    commit(root, "the finding lands");
    writeFileSync(join(root, "notes.md"), "# notes\n\n```\nx\n```\n\nmore\n");

    const r = runEdited(join(root, "notes.md"));

    expect(r.text).toContain("notes.md:3: MD040/fenced-code-language");
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
    runBin(CLI, ["init", root, "--profile", "general"], { env: tmpEnv() });
    const long = `${"word ".repeat(32)}end`;
    writeFileSync(join(root, "a.md"), `# A\n\n${long}\n`);
    git(root, "add", "-A");

    const hook = runBin(CLI, ["hook", "pre-commit"], { cwd: root, env: tmpEnv() });

    const staged = git(root, "show", ":a.md");
    expect(hook.exit).toBe(0);
    expect(staged).not.toContain(long);
    expect(staged.split("\n").every((l) => l.length <= 100)).toBe(true);
  });
});

describe("qsm-langdev pre-commit hook: static fixers", () => {
  const staged = (root: string, path: string) => git(root, "show", `:${path}`);
  const preCommit = (root: string) =>
    runBin(CLI, ["hook", "pre-commit"], { cwd: root, env: tmpEnv() });
  const initRepo = () => {
    const { root } = repoWithFile("seed.ts", "export {};\n");
    runBin(CLI, ["init", root, "--profile", "general"], { env: tmpEnv() });
    return root;
  };

  test("an oxfmt format defect and a markdown rule are fixed in the staged blobs, the hook passes", () => {
    const root = initRepo();
    writeFileSync(join(root, "a.ts"), "export const a  =  1\n");
    writeFileSync(join(root, "a.md"), "# A\n\n*   one\n*   two\n");
    git(root, "add", "-A");

    const hook = preCommit(root);

    expect(hook.exit).toBe(0);
    expect(staged(root, "a.ts")).toBe("export const a = 1;");
    // git() trims its output, so the blob's byte size proves the final newline survived
    expect(git(root, "cat-file", "-s", ":a.ts")).toBe(String("export const a = 1;\n".length));
    expect(staged(root, "a.md")).toContain("* one\n");
  }, 60_000);

  test("a finding no fixer can rewrite still blocks", () => {
    const root = initRepo();
    writeFileSync(join(root, "a.ts"), "export const a: any = 1;\n");
    git(root, "add", "-A");

    expect(preCommit(root).exit).not.toBe(0);
  }, 60_000);

  test("a staged file with unstaged changes is named as not auto-fixed when the gate blocks", () => {
    const root = initRepo();
    writeFileSync(join(root, "a.md"), "# A\n\n#no-space\n");
    git(root, "add", "-A");
    writeFileSync(join(root, "a.md"), "# A\n\n#no-space\n\nmore\n");

    const hook = preCommit(root);

    expect(hook.exit).not.toBe(0);
    expect(hook.stdout + hook.stderr).toContain(
      "a.md: not auto-fixed, it has unstaged changes. Stage or stash them, then commit again.",
    );
  }, 60_000);
});
