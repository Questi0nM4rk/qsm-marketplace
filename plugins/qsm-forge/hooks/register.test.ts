// `claude plugin test plugins/qsm-forge` drives register.tsx's guard against the engine itself.
// reviewGuard's own decisions are proved by lib/forge-guard.test.ts.
import { expect, test } from "claude-code/testing";

test("a raw review call over Bash is denied before it reaches the tool", async ($, on) => {
  on("tool.call", () => ({ result: "ran" }));
  on("ui.log", () => ({ value: undefined }));

  const result = await $.tool.call({ tool: "Bash", command: "gh api repos/o/n/pulls/12/comments" });

  expect(result.result).toBeUndefined();
  expect(result.deny).toContain("qsm-forge gh comments");
});
