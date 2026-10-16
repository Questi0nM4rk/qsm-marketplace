// Throwaway git repositories for tests, whatever the machine's git config says.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { isolatedEnv } from "./cli.ts";
import { sandboxDir, writeIn } from "./sandbox.ts";

/** git in `repo`: no hook, no signing, no global config, one fixed identity. */
export function git(repo: string, ...args: string[]): string {
  const r = spawnSync(
    "git",
    ["-C", repo, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args],
    {
      encoding: "utf8",
      env: isolatedEnv(repo, {
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_SYSTEM: "/dev/null",
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
      }),
    },
  );
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  }
  return r.stdout.trim();
}

/** A commit of everything in the tree. */
export function commit(repo: string, message: string): void {
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", message);
}

/** A sandbox holding `repo/` with `files` (path to text) in one commit. */
export function repoWith(
  prefix: string,
  files: Record<string, string>,
): { root: string; repo: string } {
  const root = sandboxDir(prefix);
  const repo = join(root, "repo");
  for (const [rel, text] of Object.entries(files)) {
    writeIn(repo, rel, text);
  }
  git(root, "init", "-q", repo);
  commit(repo, "one");
  return { root, repo };
}
