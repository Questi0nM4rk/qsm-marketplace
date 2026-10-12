// What the Bash guard answers for one command line: deny for a commit or a
// push that skips the git hooks, ask for `QSM_LANGDEV_ALLOW`, nothing for the
// rest. The guard hook itself is spawned in scripts/guard.test.ts.
import { expect, test } from "bun:test";
import { gitDecision } from "./blocked-git.ts";

const decision = (command: string) => gitDecision(command)?.decision;

test("gitDecision denies a hookless commit or push, asks for allow, passes the rest", () => {
  for (const command of [
    "git commit --no-verify -m x",
    "git commit -n -m x",
    "git commit -an -m x",
    "git -C repo push --no-verify origin main",
    "git add -A && git commit -n -m x",
    "QSM_LANGDEV_ALLOW=x git commit -n -m x",
  ]) {
    expect(decision(command)).toBe("deny");
  }
  expect(decision('cd repo; QSM_LANGDEV_ALLOW="known" git push origin main')).toBe("ask");
  for (const command of ["git commit -m x", "git push -n origin main", "qsm-langdev check", ""]) {
    expect(decision(command)).toBeUndefined();
  }
});
