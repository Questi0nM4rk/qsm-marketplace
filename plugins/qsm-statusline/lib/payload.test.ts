import { describe, expect, test } from "bun:test";
import { DEFAULT_CONTEXT_SIZE, epochSeconds, num, parsePayload, readSnapshot } from "./payload.ts";

// The fixture is a whole payload of the shape the harness sends, so a change
// to a field path shows up here rather than on somebody's prompt.
const FULL = {
  model: { display_name: "Opus 5", id: "claude-opus-5" },
  version: "2.1.251",
  context_window: { context_window_size: 200_000, used_percentage: 21 },
  workspace: { current_dir: "/tmp/project" },
  cwd: "/tmp/elsewhere",
  rate_limits: {
    five_hour: { used_percentage: 24, resets_at: 1_800_000_000 },
    seven_day: { used_percentage: 41, resets_at: "2027-01-15T10:00:00Z" },
  },
};

describe("readSnapshot", () => {
  test("reads every segment's source out of a full payload", () => {
    const snapshot = readSnapshot(FULL);
    expect(snapshot.model).toBe("Opus 5");
    expect(snapshot.contextSize).toBe(200_000);
    expect(snapshot.usedPercent).toBe(21);
    expect(snapshot.cwd).toBe("/tmp/project");
    expect(snapshot.session).toEqual({ percent: 24, resetsAt: 1_800_000_000 });
    expect(snapshot.week?.percent).toBe(41);
  });

  test("falls back to the top-level working directory when the workspace has none", () => {
    expect(readSnapshot({ cwd: "/tmp/elsewhere" }).cwd).toBe("/tmp/elsewhere");
  });

  test("an empty payload yields defaults and no rate limits, never a throw", () => {
    const snapshot = readSnapshot({});
    expect(snapshot.model).toBe("unknown");
    expect(snapshot.contextSize).toBe(DEFAULT_CONTEXT_SIZE);
    expect(snapshot.usedPercent).toBe(0);
    expect(snapshot.session).toBeNull();
    expect(snapshot.week).toBeNull();
  });

  test("a rate limit window with no readable percentage is absent, not zero", () => {
    const snapshot = readSnapshot({
      rate_limits: { five_hour: { used_percentage: null }, seven_day: "nonsense" },
    });
    expect(snapshot.session).toBeNull();
    expect(snapshot.week).toBeNull();
  });

  test("one field of the wrong type costs its own segment and no other", () => {
    const snapshot = readSnapshot({
      model: { display_name: 7 },
      context_window: { context_window_size: [], used_percentage: 33 },
      rate_limits: FULL.rate_limits,
    });
    expect(snapshot.model).toBe("unknown");
    expect(snapshot.contextSize).toBe(DEFAULT_CONTEXT_SIZE);
    expect(snapshot.usedPercent).toBe(33);
    expect(snapshot.session?.percent).toBe(24);
  });
});

describe("num", () => {
  test("floors a number, parses a numeric string, refuses anything else", () => {
    expect(num(21.7)).toBe(21);
    expect(num("42")).toBe(42);
    expect(num("42.9")).toBe(42);
    expect(num("forty")).toBeNull();
    expect(num(Number.NaN)).toBeNull();
    expect(num(true)).toBeNull();
  });
});

describe("epochSeconds", () => {
  test("reads the integer epoch the payload sends and the ISO string the API sends", () => {
    expect(epochSeconds(1_800_000_000)).toBe(1_800_000_000);
    expect(epochSeconds("2027-01-15T10:00:00Z")).toBe(Date.parse("2027-01-15T10:00:00Z") / 1000);
  });

  test("an unreadable stamp is absent, which drops the reset time and keeps the bar", () => {
    expect(epochSeconds("soon")).toBeNull();
    expect(epochSeconds(null)).toBeNull();
  });
});

describe("parsePayload", () => {
  test("text that is not JSON renders defaults rather than failing", () => {
    expect(parsePayload("{not json").model).toBe("unknown");
    expect(parsePayload("").model).toBe("unknown");
  });

  test("the fixture round-trips through JSON exactly as the object does", () => {
    expect(parsePayload(JSON.stringify(FULL))).toEqual(readSnapshot(FULL));
  });
});
