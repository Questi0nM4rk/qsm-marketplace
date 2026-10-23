// What the Bash guard answers for one command line: a refusal for a commit or a push that skips
// the git hooks and for any `QSM_LANGDEV_ALLOW`, nothing for the rest. The guard hook itself is
// spawned in scripts/guard.test.ts.
import { expect, test } from "bun:test";
import { gitDenial } from "./blocked-git.ts";

test("gitDenial refuses a hookless commit or push and any allow, passes the rest", () => {
  for (const command of [
    "git commit --no-verify -m x",
    "git commit -n -m x",
    "git commit -an -m x",
    "git -C repo push --no-verify origin main",
    "git add -A && git commit -n -m x",
    "QSM_LANGDEV_ALLOW=x git commit -n -m x",
    'cd repo; QSM_LANGDEV_ALLOW="known" git push origin main',
  ]) {
    expect(gitDenial(command)).toContain("! QSM_LANGDEV_ALLOW=");
  }
  for (const command of ["git commit -m x", "git push -n origin main", "qsm-langdev check", ""]) {
    expect(gitDenial(command)).toBeNull();
  }
});
