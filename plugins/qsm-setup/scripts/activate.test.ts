import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { activation, instructionsStep, mergeBlock } from "./activate.ts";

/** The activation's one step is the whole result. */
function context(home: string, claudeHome: string, instructions = "replace") {
  return {
    dryRun: false,
    env: {
      HOME: home,
      CLAUDE_CONFIG_DIR: claudeHome,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
      GIT_CONFIG_GLOBAL: "/dev/null",
    },
    choices: { instructions },
  };
}
const install = activation.activate;

function sandbox(): { home: string; claudeHome: string } {
  return {
    home: sandboxDir("qsm-home-"),
    claudeHome: sandboxDir("qsm-claude-"),
  };
}

describe("the managed write as one step", () => {
  test("the whole write is one step between the two git steps", async () => {
    const { home, claudeHome } = sandbox();

    const result = await install(context(home, claudeHome));

    expect(result.tool).toBe("qsm-setup");
    expect(result.steps?.map((s) => s.name)).toEqual(["git-before", "instructions", "git-after"]);
    expect(result.steps?.[1]).toMatchObject({ name: "instructions", status: "installed" });
    for (const name of [
      "CLAUDE.md",
      "rules/implementation.md",
      "rules/context.md",
      "rules/git.md",
      "output-styles/qsm.md",
      "settings.json",
    ]) {
      expect(result.detail).toContain(name);
    }
  });

  test("running it again with nothing changed is already", async () => {
    const { home, claudeHome } = sandbox();

    await install(context(home, claudeHome));
    const again = await install(context(home, claudeHome));

    expect(again.status).toBe("already");
    expect(again.steps?.[1]).toMatchObject({ name: "instructions", status: "already" });
  });

  test("a dry run writes nothing", async () => {
    const { home, claudeHome } = sandbox();

    const result = await install({ ...context(home, claudeHome), dryRun: true });

    expect(result.status).toBe("skipped");
    expect(existsSync(resolve(claudeHome, "CLAUDE.md"))).toBe(false);
  });

  test("the step itself names what a dry run would change", () => {
    const { home, claudeHome } = sandbox();

    const step = instructionsStep({ ...context(home, claudeHome), dryRun: true });

    expect(step.status).toBe("skipped");
    expect(step.detail).toContain("write CLAUDE.md");
    expect(existsSync(resolve(claudeHome, "CLAUDE.md"))).toBe(false);
  });
});

function log(dir: string): string[] {
  const out = spawnSync("git", ["log", "--format=%s"], { cwd: dir, encoding: "utf8" }).stdout;
  return out.trim().split("\n");
}

describe("history of the Claude home", () => {
  test("a home that is not a repo ends with a repo, the ignore file and two commits; again adds none", async () => {
    const { home, claudeHome } = sandbox();
    writeFileSync(join(claudeHome, "mine.txt"), "x");
    writeFileSync(join(claudeHome, ".gitignore"), "my-own/\n");

    await install(context(home, claudeHome));
    const first = log(claudeHome);
    await install(context(home, claudeHome));

    expect(first).toHaveLength(2);
    expect(first[1]).toBe("before qsm-setup activate");
    expect(first[0]).toStartWith("qsm-setup activate: ");
    expect(log(claudeHome)).toEqual(first);
    const ignore = readFileSync(join(claudeHome, ".gitignore"), "utf8");
    expect(ignore).toStartWith("my-own/\n");
    expect(ignore).toContain("\nprojects/\n");
  });

  test("a dry run names the git steps and writes nothing", async () => {
    const { home, claudeHome } = sandbox();

    const result = await install({ ...context(home, claudeHome), dryRun: true });

    expect(result.steps?.[0]?.detail).toContain("git init");
    expect(result.steps?.[2]?.detail).toContain("would commit");
    expect(existsSync(join(claudeHome, ".git"))).toBe(false);
    expect(existsSync(join(claudeHome, ".gitignore"))).toBe(false);
  });

  test("a git failure is an error naming the cause, and nothing is written", async () => {
    const { home, claudeHome } = sandbox();
    writeFileSync(join(claudeHome, ".git"), "not a repository");

    const result = await install(context(home, claudeHome));

    expect(result.status).toBe("error");
    expect(result.detail).toContain("git status");
    expect(existsSync(join(claudeHome, "CLAUDE.md"))).toBe(false);
  });
});

describe("the CLAUDE.md choice", () => {
  const Block = "managed rules";
  test("replace adds the block after the user's content and keeps it unchanged", () => {
    const out = mergeBlock("# mine\n\nmy rules\n", Block, "replace");
    expect(out).toStartWith("# mine\n\nmy rules\n\n<!-- qsm-setup-begin -->");
    expect(out).toEndWith("<!-- qsm-setup-end -->\n");
  });

  test("replace changes only our block where it already is", () => {
    const first = mergeBlock("# mine\n", "old", "replace") ?? "";
    const again = mergeBlock(first, Block, "replace") ?? "";
    expect(again).toContain(Block);
    expect(again).not.toContain("old");
    expect(again.match(/qsm-setup-begin/g)).toHaveLength(1);
  });

  test("replace removes the block qsm-essentials wrote before", () => {
    const old = "# mine\n\n<!-- qsm-essentials-begin -->\nold\n<!-- qsm-essentials-end -->\n";
    const out = mergeBlock(old, Block, "replace") ?? "";
    expect(out).not.toContain("qsm-essentials-begin");
    expect(out).toStartWith("# mine\n\n<!-- qsm-setup-begin -->");
  });

  test("overwrite leaves only the block in the whole file", () => {
    expect(mergeBlock("# mine\n", Block, "overwrite")).toBe(
      `<!-- qsm-setup-begin -->\n${Block}\n<!-- qsm-setup-end -->\n`,
    );
  });

  test("skip leaves CLAUDE.md alone and still writes the rest", async () => {
    const { home, claudeHome } = sandbox();
    writeFileSync(join(claudeHome, "CLAUDE.md"), "# mine\n");
    const result = await install(context(home, claudeHome, "skip"));
    expect(readFileSync(join(claudeHome, "CLAUDE.md"), "utf8")).toBe("# mine\n");
    expect(result.detail).not.toContain("CLAUDE.md");
    expect(result.detail).toContain("rules/context.md");
  });
});
