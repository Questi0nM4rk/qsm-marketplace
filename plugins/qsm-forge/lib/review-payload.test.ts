import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { UsageError } from "../../../lib/outcome.ts";
import { QsmError } from "../../../lib/qsm-error.ts";
import { parseReviewPayload, readPayloadFile } from "./review-payload.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

describe("a well-formed payload", () => {
  test("a decision, an overall comment, and inline comments come through", () => {
    const payload = parseReviewPayload(
      JSON.stringify({
        decision: "request-changes",
        body: "two things",
        inline: [{ path: "src/a.ts", line: 42, body: "this leaks a handle" }],
      }),
    );
    expect(payload.decision).toBe("request-changes");
    expect(payload.body).toBe("two things");
    expect(payload.inline).toEqual([{ path: "src/a.ts", line: 42, body: "this leaks a handle" }]);
  });

  test("a payload with no inline comments is a whole review", () => {
    expect(parseReviewPayload('{"decision":"approve"}').inline).toEqual([]);
  });

  test("an approval that is all inline comments needs no overall comment", () => {
    const payload = parseReviewPayload(
      '{"decision":"approve","inline":[{"path":"a.ts","line":1,"body":"here"}]}',
    );
    expect(payload.body).toBe("");
    expect(payload.inline).toHaveLength(1);
  });
});

describe("Empty or malformed input", () => {
  test.each([
    ["nothing at all", ""],
    ["whitespace", "   \n "],
    ["not JSON", "decision: approve"],
    ["a list, not a review", "[]"],
    ["no decision", '{"body":"hm"}'],
    ["a decision nobody declared", '{"decision":"merge"}'],
    ["a body that is not text", '{"decision":"approve","body":7}'],
    ["inline that is not a list", '{"decision":"approve","inline":{}}'],
    ["an inline comment with no path", '{"decision":"approve","inline":[{"line":1,"body":"x"}]}'],
    [
      "an inline comment with no line",
      '{"decision":"approve","inline":[{"path":"a.ts","body":"x"}]}',
    ],
    [
      "an inline comment at line zero",
      '{"decision":"approve","inline":[{"path":"a.ts","line":0,"body":"x"}]}',
    ],
    [
      "an inline comment saying nothing",
      '{"decision":"approve","inline":[{"path":"a.ts","line":1,"body":"  "}]}',
    ],
    ["a comment review with no overall text", '{"decision":"comment","inline":[]}'],
    [
      "a request-changes review with blank overall text",
      '{"decision":"request-changes","body":"  ","inline":[{"path":"a.ts","line":1,"body":"x"}]}',
    ],
  ])("%s is refused", (_what, raw) => {
    expect(() => parseReviewPayload(raw)).toThrow(UsageError);
  });

  test("the refusal names what is wrong, and which comment", () => {
    expect(() =>
      parseReviewPayload(
        '{"decision":"approve","inline":[{"path":"a.ts","line":1,"body":"ok"},{}]}',
      ),
    ).toThrow(/inline\[1\]/);
  });

  test("the refusal for a missing body names the decision", () => {
    expect(() => parseReviewPayload('{"decision":"comment"}')).toThrow(/a comment review/);
  });
});

describe("the payload named by --file", () => {
  test("a file that is there comes back whole", () => {
    const path = join(sandboxDir("qsm-forge-payload-"), "review.json");
    writeFileSync(path, '{"decision":"approve"}');
    expect(parseReviewPayload(readPayloadFile(path)).decision).toBe("approve");
  });

  test("a path that is not there is an absent prerequisite, not a wrong argument", () => {
    const dir = sandboxDir("qsm-forge-payload-");
    expect(() => readPayloadFile(join(dir, "absent.json"))).toThrow(QsmError);
    expect(() => readPayloadFile(join(dir, "absent.json"))).not.toThrow(UsageError);
    expect(() => readPayloadFile(join(dir, "absent.json"))).toThrow(/nothing was posted/);
  });
});
