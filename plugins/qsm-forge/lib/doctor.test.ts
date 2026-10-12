import { describe, expect, test } from "bun:test";
import { forgeDoctor } from "./doctor.ts";

const only =
  (...present: string[]) =>
  (cmd: string) =>
    present.includes(cmd);

describe("forgeDoctor", () => {
  test("Only one forge CLI installed", () => {
    const outcome = forgeDoctor(only("gh"));
    expect(outcome.code).toBe("ok");
    expect(outcome.warnings).toEqual([
      "glab is not on PATH: install the GitLab CLI and run glab auth login",
    ]);
  });

  test("both present is ok with no warning", () => {
    const outcome = forgeDoctor(only("gh", "glab"));
    expect(outcome.code).toBe("ok");
    expect(outcome.warnings).toEqual([]);
  });

  test("No forge CLI installed", () => {
    const outcome = forgeDoctor(only());
    expect(outcome.code).toBe("missing");
    expect(outcome.message).toContain("neither gh nor glab is on PATH");
    expect(outcome.message).toContain("gh auth login");
    expect(outcome.message).toContain("glab auth login");
  });
});
