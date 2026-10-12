import { describe, expect, test } from "bun:test";
import { readScript, ScriptError, secretSteps, withSecrets } from "./steps.ts";

describe("readScript", () => {
  test("an ordered script of known actions is accepted with its tab", () => {
    const script = readScript({
      tab: 2,
      steps: [
        { action: "navigate", url: "https://a.test" },
        { action: "fill", selector: "#user", value: "someone" },
        { action: "click", selector: "#go" },
        { action: "wait", selector: ".done", timeoutMs: 5000 },
        { action: "extract", selector: "h1", limit: 3 },
        { action: "screenshot", path: "done.png" },
      ],
    });
    expect(script.tab).toBe(2);
    expect(script.steps).toHaveLength(6);
  });

  test("an unknown action is refused with the step's index", () => {
    try {
      readScript({ steps: [{ action: "navigate", url: "https://a.test" }, { action: "scroll" }] });
      expect.unreachable("an unknown action must be refused");
    } catch (err) {
      expect(err).toBeInstanceOf(ScriptError);
      expect((err as ScriptError).index).toBe(1);
    }
  });

  test("a step missing what it needs is refused with the index and the field", () => {
    try {
      readScript({ steps: [{ action: "fill", selector: "#user" }] });
      expect.unreachable("a fill without a value must be refused");
    } catch (err) {
      expect((err as ScriptError).index).toBe(0);
      expect((err as ScriptError).message).toContain("value");
    }
  });

  test("a wait needs a selector, a text, or a plain timeout", () => {
    expect(readScript({ steps: [{ action: "wait", timeoutMs: 1000 }] }).steps).toHaveLength(1);
    expect(() => readScript({ steps: [{ action: "wait" }] })).toThrow(ScriptError);
  });

  test("an empty script and a non-object are refused before anything runs", () => {
    expect(() => readScript({ steps: [] })).toThrow(ScriptError);
    expect(() => readScript("navigate")).toThrow(ScriptError);
  });
});

describe("fill-secret", () => {
  const script = readScript({
    steps: [
      { action: "fill", selector: "#user", value: "someone" },
      { action: "fill-secret", selector: "#pass", item: "an-entry" },
    ],
  });

  test("only the secret steps are collected, with their indexes", () => {
    expect(secretSteps(script).map((s) => s.index)).toEqual([1]);
  });

  test("a fill-secret without an entry is refused", () => {
    expect(() => readScript({ steps: [{ action: "fill-secret", selector: "#pass" }] })).toThrow(
      ScriptError,
    );
  });

  test("the resolved value lands in an ordinary fill marked for redaction", () => {
    const filled = withSecrets(script, new Map([[1, "the-value"]]));
    expect(filled.steps[1]).toEqual({
      action: "fill",
      selector: "#pass",
      value: "the-value",
      redact: true,
    });
    expect(filled.steps[0]).toEqual({ action: "fill", selector: "#user", value: "someone" });
  });

  test("a secret step left unresolved fails instead of filling an empty value", () => {
    expect(() => withSecrets(script, new Map())).toThrow(ScriptError);
  });
});
