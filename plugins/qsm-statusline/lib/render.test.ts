import { describe, expect, test } from "bun:test";
import type { GitState } from "./git.ts";
import { readSnapshot, type Snapshot } from "./payload.ts";
import { bar, formatTokens, render, untilReset } from "./render.ts";

const NOW = 1_800_000_000;

// One captured payload feeds every rendering test, so a segment that stops
// appearing shows up here rather than on somebody's prompt.
const FIXTURE = {
  model: { display_name: "Opus 5" },
  context_window: { context_window_size: 200_000, used_percentage: 21 },
  workspace: { current_dir: "/tmp/project" },
  rate_limits: {
    five_hour: { used_percentage: 24, resets_at: NOW + 3 * 3600 },
    seven_day: { used_percentage: 41, resets_at: NOW + 4 * 86_400 },
  },
};

const GIT: GitState = { branch: "main", staged: 2, modified: 1, untracked: 3, conflicts: 0 };

function lines(snapshot: Snapshot, git: GitState | null): string[] {
  return render({ snapshot, git, now: NOW, color: false });
}

describe("render", () => {
  test("Full state available", () => {
    const [model, context, limits] = lines(readSnapshot(FIXTURE), GIT);
    expect(model).toBe("Opus 5 | 42k/200k");
    expect(context).toContain("context: ");
    expect(context).toContain("21%");
    expect(context).toContain("git main: +2 ~1 ?3");
    expect(limits).toContain("session: ");
    expect(limits).toContain("24% resets in 3h");
    expect(limits).toContain("week: ");
    expect(limits).toContain("41% resets in 4d");
  });

  test("a repository with nothing to report reads clean", () => {
    const clean: GitState = { branch: "main", staged: 0, modified: 0, untracked: 0, conflicts: 0 };
    expect(lines(readSnapshot(FIXTURE), clean)[1]).toContain("git main: clean");
  });

  test("unmerged paths are counted apart from ordinary edits", () => {
    const conflicted: GitState = { ...GIT, staged: 0, modified: 0, untracked: 0, conflicts: 2 };
    expect(lines(readSnapshot(FIXTURE), conflicted)[1]).toContain("git main: !2");
  });

  test("A source is unavailable", () => {
    const [, context] = lines(readSnapshot(FIXTURE), null);
    expect(context).not.toContain("git");
    expect(context).toContain("21%");
  });

  test("colour wraps the same text rather than changing it", () => {
    const plain = render({ snapshot: readSnapshot(FIXTURE), git: GIT, now: NOW, color: false });
    const painted = render({ snapshot: readSnapshot(FIXTURE), git: GIT, now: NOW, color: true });
    // Built rather than written as a literal: an escape character inside a
    // regex literal is a finding this repository does not suppress.
    const ansi = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "g");
    expect(painted.map((line) => line.replaceAll(ansi, ""))).toEqual(plain);
  });
});

describe("render without a source", () => {
  test("no rate limits drops the whole limits line", () => {
    const withoutLimits = readSnapshot({ ...FIXTURE, rate_limits: undefined });
    const printed = lines(withoutLimits, GIT);
    expect(printed).toHaveLength(2);
    expect(printed.join("\n")).not.toContain("session");
  });

  test("one window present renders that window alone", () => {
    const sessionOnly = readSnapshot({
      ...FIXTURE,
      rate_limits: { five_hour: { used_percentage: 24 } },
    });
    const limits = lines(sessionOnly, GIT)[2] ?? "";
    expect(limits).toContain("session: ");
    expect(limits).not.toContain("week: ");
  });

  test("a window with no reset stamp keeps its bar and drops the reset time", () => {
    const noStamp = readSnapshot({
      ...FIXTURE,
      rate_limits: { five_hour: { used_percentage: 24 } },
    });
    const limits = lines(noStamp, GIT)[2] ?? "";
    expect(limits).toContain("24%");
    expect(limits).not.toContain("resets in");
  });

  test("an empty payload still renders, which is the whole requirement", () => {
    const printed = lines(readSnapshot({}), null);
    expect(printed[0]).toBe("unknown | 0k/200k");
    expect(printed[1]).toContain("0%");
  });
});

describe("bar", () => {
  test("empty at zero, full at a hundred, and clamped past it", () => {
    expect(bar(0, 4)).toBe("░░░░");
    expect(bar(100, 4)).toBe("████");
    expect(bar(240, 4)).toBe("████");
    expect(bar(-5, 4)).toBe("░░░░");
  });
});

describe("formatTokens", () => {
  test("thousands below a million, millions above it", () => {
    expect(formatTokens(42_000)).toBe("42k");
    expect(formatTokens(1_000_000)).toBe("1m");
  });
});

describe("untilReset", () => {
  test("days and hours far out, minutes near, and now once it has passed", () => {
    expect(untilReset(NOW + 4 * 86_400 + 2 * 3600, NOW)).toBe("4d 2h");
    expect(untilReset(NOW + 27 * 60, NOW)).toBe("27m");
    expect(untilReset(NOW + 30, NOW)).toBe("<1m");
    expect(untilReset(NOW - 1, NOW)).toBe("now");
  });

  test("minutes drop once the reset is more than a day out", () => {
    expect(untilReset(NOW + 86_400 + 90, NOW)).toBe("1d");
  });
});
