import { expect, test } from "bun:test";
import { QSM_BINS, skipKey, TOOLS } from "./catalog.ts";

/** The four rows a system package manager or sudo owns: suggested, never run. */
const SUGGEST_ONLY = ["acli", "br", "comby", "hurl", "usql"];

test("every binary name appears once across both groups", () => {
  const bins = [...TOOLS, ...QSM_BINS].map((entry) => entry.bin);
  expect(new Set(bins).size).toBe(bins.length);
});

test("every row carries an install line, a prerequisite and a version probe", () => {
  for (const tool of TOOLS) {
    expect(tool.install.length).toBeGreaterThan(0);
    expect(tool.prereq.length).toBeGreaterThan(0);
    expect(tool.prereqHint.length).toBeGreaterThan(0);
    expect(tool.versionArgs.length).toBeGreaterThan(0);
  }
});

test("only the rows a system package manager owns, and br (qsm-tasks installs it), refuse to run", () => {
  const suggested = TOOLS.filter((tool) => tool.run === null).map((tool) => tool.bin);
  expect(suggested).toEqual(SUGGEST_ONLY);
});

test("a row that runs starts its argv with its own prerequisite, or a shell", () => {
  for (const tool of TOOLS) {
    if (tool.run !== null) {
      expect([tool.prereq, "sh"]).toContain(tool.run[0] ?? "");
    }
  }
});

test("the skip key is the binary name, upper case, punctuation flattened", () => {
  expect(skipKey("ast-grep")).toBe("QSM_AST_GREP_SKIP");
  expect(skipKey("lightrag-server")).toBe("QSM_LIGHTRAG_SERVER_SKIP");
  expect(skipKey("yq")).toBe("QSM_YQ_SKIP");
});
