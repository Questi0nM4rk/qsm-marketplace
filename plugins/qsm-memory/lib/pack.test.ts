// The date rule of `pack`, with the person's own cases as data. Dates are local noon, so the rule
// reads the local calendar date whatever the time zone of the machine.
import { describe, expect, test } from "bun:test";
import { ageOf, daysOfUse, IDLE_DAYS, notDueBecause, type PackState } from "./pack.ts";

const noon = (date: string) => new Date(`${date}T12:00:00`);
const iso = (date: string) => noon(date).toISOString();

/** The age on `today` of a transcript last changed on `changed`: the sessions started by that day
 * are what the archive held then. */
const age = (changed: string, started: readonly string[], today: string) =>
  ageOf(
    noon(changed).getTime(),
    daysOfUse(started.filter((day) => day <= today).map(iso), noon(today)),
  );

describe("a transcript's age in days of use", () => {
  test("a week off between two Mondays leaves it at 5, so it stays", () => {
    // changed Monday 2026-10-05; sessions Tuesday to Friday; none for 7 days; Monday 2026-10-19
    const started = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
    expect(age("2026-10-05", started, "2026-10-19")).toBe(5);
    expect(age("2026-10-05", started, "2026-10-19")).toBeLessThan(IDLE_DAYS);
  });

  test("a 14-day break with sessions on 2 of its days adds 2", () => {
    // age 1 on 10-02; then sessions on 10-08 and 10-12 and none on the other days of the break
    const started = ["2026-10-02", "2026-10-08", "2026-10-12"];
    expect(age("2026-10-01", started, "2026-10-02")).toBe(1);
    expect(age("2026-10-01", started, "2026-10-12")).toBe(3);
  });

  test("the first day back after a 20-day break ages it by one", () => {
    const started = ["2026-10-01", "2026-10-02", "2026-10-03"];
    expect(age("2026-09-30", started, "2026-10-03")).toBe(3);
    // 20 days with no session, then today
    expect(age("2026-09-30", started, "2026-10-23")).toBe(4);
  });

  test("a session on the day it changed does not age it", () => {
    expect(age("2026-10-05", ["2026-10-05", "2026-10-05"], "2026-10-05")).toBe(0);
  });

  test("two sessions on one day are one day of use", () => {
    expect(age("2026-10-05", ["2026-10-06", "2026-10-06"], "2026-10-07")).toBe(2);
  });
});

describe("whether a pack is due", () => {
  const state = (over: Partial<PackState> = {}): PackState => ({
    retention: "qsm",
    activatedAt: iso("2026-08-01"),
    lastPackAt: null,
    ...over,
  });
  const now = noon("2026-10-30");

  test("due when qsm is chosen and nothing waits", () => {
    expect(notDueBecause(state(), now)).toBeNull();
    expect(notDueBecause(state({ lastPackAt: iso("2026-09-20") }), now)).toBeNull();
  });

  test("10 days after activation is inside the grace", () => {
    expect(notDueBecause(state({ activatedAt: iso("2026-10-20") }), now)).toContain(
      "within 30 days of activation on 2026-10-20",
    );
  });

  test("12 days after the last pack is inside the cadence", () => {
    expect(notDueBecause(state({ lastPackAt: iso("2026-10-18") }), now)).toContain(
      "the last pack was on 2026-10-18; the next pack is 2026-11-17",
    );
  });

  test("the choice claude, or none, is never due", () => {
    expect(notDueBecause(state({ retention: "claude" }), now)).toContain("claude");
    expect(notDueBecause(state({ retention: null }), now)).toContain("no retention choice");
  });
});
