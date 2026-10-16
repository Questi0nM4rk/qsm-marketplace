import { describe, expect, test } from "bun:test";
import { forgeDoctor } from "./doctor.ts";

const only =
  (...present: string[]) =>
  (cmd: string) =>
    present.includes(cmd);

describe("forgeDoctor", () => {
  test("one forge CLI is enough", () => {
    expect(forgeDoctor(only("gh")).code).toBe("ok");
    expect(forgeDoctor(only("glab")).code).toBe("ok");
  });

  test("No forge CLI installed: one missing naming both", () => {
    const outcome = forgeDoctor(only());
    expect(outcome.code).toBe("missing");
    expect(outcome.message).toContain("gh or glab is not on PATH");
    expect(outcome.message).toContain("gh auth login");
    expect(outcome.message).toContain("glab auth login");
  });
});
