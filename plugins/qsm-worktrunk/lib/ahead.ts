// The local branches the working branch has not absorbed: finished work its tree does not have.
import { spawnSync } from "node:child_process";
import { QsmError } from "../../../lib/qsm-error.ts";

/** Local branches with commits `HEAD` lacks, by name; none outside a git repository. One
 * for-each-ref call, so the session-end hook that asks stays well inside its 1.5 s. */
export function branchesAhead(cwd: string): string[] {
  const run = spawnSync(
    "git",
    ["for-each-ref", "--no-merged=HEAD", "--format=%(refname:short)", "refs/heads"],
    { cwd, encoding: "utf8", timeout: 1000 },
  );
  if (run.error !== undefined && "code" in run.error && run.error.code === "ENOENT") {
    throw new QsmError("missing", `git did not run: ${run.error.message}`, {
      next: "install git",
    });
  }
  if (run.error !== undefined) {
    throw new QsmError("failed", `git for-each-ref did not finish: ${run.error.message}`);
  }
  if (run.status !== 0) {
    if (run.stderr.includes("not a git repository")) {
      return [];
    }
    throw new QsmError(
      "failed",
      `git for-each-ref failed (${run.status}): ${run.stderr.trim().slice(0, 200)}`,
    );
  }
  return run.stdout.split("\n").filter((name) => name !== "");
}
