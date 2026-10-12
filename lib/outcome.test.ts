import { describe, expect, test } from "bun:test";
import {
  checkTools,
  doctorVerdict,
  exitOf,
  fail,
  OUTCOME_CODES,
  OUTCOMES,
  ok,
  renderJson,
  renderText,
  toEnvelope,
} from "./outcome.ts";

describe("the outcome table", () => {
  test("seven codes, exits 0 to 6, each with a reason and a cause", () => {
    expect(OUTCOME_CODES).toEqual([
      "ok",
      "failed",
      "usage",
      "worse",
      "missing",
      "blocked",
      "partial",
    ]);
    const exits = OUTCOME_CODES.map((c) => OUTCOMES[c].exit);
    expect(exits).toEqual([0, 1, 2, 3, 4, 5, 0]);
    for (const code of OUTCOME_CODES) {
      expect(OUTCOMES[code].reason.length).toBeGreaterThan(10);
      expect(OUTCOMES[code].cause.length).toBeGreaterThan(10);
    }
  });

  test("exitOf reads the table", () => {
    expect(exitOf("ok")).toBe(0);
    expect(exitOf("worse")).toBe(3);
    expect(exitOf("partial")).toBe(0);
  });
});

describe("constructors", () => {
  test("ok carries data and an optional message", () => {
    expect(ok({ rows: 2 })).toEqual({ code: "ok", data: { rows: 2 } });
    expect(ok(undefined, "nothing to do")).toEqual({ code: "ok", message: "nothing to do" });
  });

  test("fail needs a code and a message", () => {
    expect(fail("missing", "docker not on PATH")).toEqual({
      code: "missing",
      message: "docker not on PATH",
    });
    expect(fail("partial", "2 of 3", { done: ["a", "b"] })).toEqual({
      code: "partial",
      message: "2 of 3",
      data: { done: ["a", "b"] },
    });
  });
});

describe("the envelope", () => {
  test("every key present, absent fields normalised", () => {
    expect(toEnvelope(ok({ n: 1 }))).toEqual({
      code: "ok",
      exit: 0,
      reason: OUTCOMES.ok.reason,
      message: "",
      warnings: [],
      data: { n: 1 },
    });
    expect(toEnvelope(fail("worse", "score 71 < 80"))).toEqual({
      code: "worse",
      exit: 3,
      reason: OUTCOMES.worse.reason,
      message: "score 71 < 80",
      warnings: [],
      data: null,
    });
  });

  test("renderJson is one JSON value, one line, newline-terminated", () => {
    const text = renderJson({ code: "ok", warnings: ["a", "b"], data: { x: "y" } });
    expect(text.endsWith("\n")).toBe(true);
    expect(text.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(text)).toEqual({
      code: "ok",
      exit: 0,
      reason: OUTCOMES.ok.reason,
      message: "",
      warnings: ["a", "b"],
      data: { x: "y" },
    });
  });
});

describe("text mode", () => {
  test("message on stdout, one warning per stderr line", () => {
    const r = renderText({ code: "ok", message: "installed 2", warnings: ["w1", "w2"] });
    expect(r.stdout).toBe("installed 2\n");
    expect(r.stderr).toBe("warning: w1\nwarning: w2\n");
  });

  test("a failure with no warnings prints its code and message on stderr, nothing on stdout", () => {
    const r = renderText(fail("blocked", "value matches a blocked pattern"));
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("blocked: value matches a blocked pattern\n");
  });

  test("a failure of several lines keeps them whole and names the code on its own last line", () => {
    const r = renderText(
      fail("failed", "PASS a: probe passed\nFAIL b: probe exited 1\n1 pass, 1 fail"),
    );
    expect(r.stderr).toBe(
      `PASS a: probe passed\nFAIL b: probe exited 1\n1 pass, 1 fail\nfailed: ${OUTCOMES.failed.reason}\n`,
    );
  });

  test("A collect-all run with one failed item", () => {
    const r = renderText(fail("partial", "2 of 3 installed", { failed: ["c"] }));
    expect(r.stdout).toBe("2 of 3 installed\n");
    expect(r.stderr).toBe(`warning: partial: ${OUTCOMES.partial.reason}\n`);
    expect(toEnvelope(fail("partial", "2 of 3"))).toMatchObject({ code: "partial", exit: 0 });
  });

  test("ok without message prints nothing", () => {
    expect(renderText(ok())).toEqual({ stdout: "", stderr: "" });
  });
});

const TOOLS = [
  { cmd: "grim", hint: "install grim" },
  { cmd: "pandoc", hint: "install pandoc", optional: true },
] as const;

const only =
  (...present: string[]) =>
  (cmd: string) =>
    present.includes(cmd);

describe("checkTools", () => {
  test("one row per tool, in the order named, with its hint and whether it gates", () => {
    expect(checkTools(TOOLS, only("grim"))).toEqual([
      { cmd: "grim", present: true, optional: false, hint: "install grim" },
      { cmd: "pandoc", present: false, optional: true, hint: "install pandoc" },
    ]);
  });
});

describe("doctorVerdict", () => {
  test("every tool present is ok, one line per tool, no warning", () => {
    const outcome = doctorVerdict("qsm-x", checkTools(TOOLS, only("grim", "pandoc")));
    expect(outcome.code).toBe("ok");
    expect(outcome.warnings ?? []).toEqual([]);
    expect(outcome.message).toBe("qsm-x: healthy\n  ok       grim\n  ok       pandoc");
  });

  test("a missing optional tool is a warning naming its install hint, still ok", () => {
    const outcome = doctorVerdict("qsm-x", checkTools(TOOLS, only("grim")));
    expect(outcome.code).toBe("ok");
    expect(outcome.warnings).toEqual(["pandoc is not on PATH: install pandoc"]);
  });

  test("a missing required tool is missing, naming the tool and its install hint", () => {
    const outcome = doctorVerdict("qsm-x", checkTools(TOOLS, only("pandoc")));
    expect(outcome.code).toBe("missing");
    expect(renderText(outcome).stderr).toStartWith("qsm-x: grim is not on PATH: install grim");
  });

  test("a plugin's own finding decides the verdict like a missing required tool", () => {
    const outcome = doctorVerdict("qsm-x", checkTools(TOOLS, only("grim", "pandoc")), [
      "neither gh nor glab is on PATH",
    ]);
    expect(outcome.code).toBe("missing");
    expect(outcome.message).toStartWith("qsm-x: neither gh nor glab is on PATH");
  });

  test("the envelope's data carries every row", () => {
    const outcome = doctorVerdict("qsm-x", checkTools(TOOLS, only()));
    expect(outcome.data?.plugin).toBe("qsm-x");
    expect(outcome.data?.tools.map((t) => t.present)).toEqual([false, false]);
  });
});
