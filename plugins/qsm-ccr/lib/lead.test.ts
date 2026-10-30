// The lead's teammate command, through runLead in the sandbox world: the running binary when it is
// compiled, else qsm-ccr from PATH.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { which } from "bun";
import { claudeLaunches, makeWorld } from "./fixtures/world.ts";
import { runLead } from "./lead.ts";

setDefaultTimeout(30_000);

describe("the teammate command the lead hands its teammates", () => {
  test("a compiled binary names itself, wherever it was run from", async () => {
    const w = makeWorld();
    const outcome = await runLead(undefined, [], w.env, "/opt/elsewhere/qsm-ccr");
    expect(outcome.code).toBe("ok");
    expect(claudeLaunches(w)[0]?.env.CLAUDE_CODE_TEAMMATE_COMMAND).toBe("/opt/elsewhere/qsm-ccr");
  });

  test("run from source it is qsm-ccr on PATH, and the lead refuses when there is none", async () => {
    const w = makeWorld();
    await runLead(undefined, [], w.env, null);
    expect(claudeLaunches(w)[0]?.env.CLAUDE_CODE_TEAMMATE_COMMAND).toBe(join(w.bin, "qsm-ccr"));
    // claude stays on PATH, qsm-ccr goes: only the lead's own binary can be what is missing
    const bare = makeWorld();
    rmSync(join(bare.bin, "qsm-ccr"));
    const noSelf = { ...bare.env, PATH: bare.bin };
    expect(which("claude", { PATH: noSelf.PATH })).not.toBeNull();
    const outcome = await runLead(undefined, [], noSelf, null);
    expect(outcome.code).toBe("missing");
    expect(outcome.message).toContain("qsm-ccr");
    expect(claudeLaunches(bare)).toHaveLength(0);
  });
});
