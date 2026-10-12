import { describe, expect, test } from "bun:test";
import { eventsHooked, hooksResults, needsHooksTests } from "./test-hooks.ts";

describe("hooksResults", () => {
  test("counts only the hooks/ section, ignores lib and scripts files the harness cannot load", () => {
    const output = [
      "lib/wt.test.ts:",
      "(fail) the file did not load",
      "  cannot import bun:test",
      "",
      "hooks/register.test.ts:",
      "(pass) a Bash call reaching for raw git worktree is denied [1ms]",
      "(pass) the session ending clears the marker [1ms]",
      "(fail) the declared command answers with the doctor's report [1ms]",
      "  Error: expect(received).toContain()",
      "",
      "scripts/install.test.ts:",
      "(fail) the file did not load",
      "",
      " 2 pass",
      " 3 fail",
    ].join("\n");
    expect(hooksResults(output)).toEqual({
      pass: 2,
      fail: 1,
      failures: ["(fail) the declared command answers with the doctor's report [1ms]"],
    });
  });

  test("no hooks section means no results", () => {
    expect(hooksResults("lib/a.test.ts:\n(fail) the file did not load\n")).toEqual({
      pass: 0,
      fail: 0,
      failures: [],
    });
  });
});

describe("eventsHooked", () => {
  test("lists bare event names, stripping matchers, including a matcher with an internal comma", () => {
    const output = [
      "Validating hooks: /repo/plugins/qsm-example/hooks/hooks.json",
      "",
      '  ❯ ./register.tsx hooks: engine.create, prompt.context, session.start, command.run{command=/"^(exit|clear|compact)$"/}, session.end, ui.render{component=Pane, requestId=qsm-example-pane}, turn.complete, command.run{command=qsm-example}',
      "",
      "✔ Validation passed",
    ].join("\n");
    expect(eventsHooked(output)).toEqual([
      "engine.create",
      "prompt.context",
      "session.start",
      "command.run",
      "session.end",
      "ui.render",
      "turn.complete",
    ]);
  });

  test("only engine.create yields just that event", () => {
    const output = [
      "Validating hooks: /repo/plugins/qsm-book-to-skill/hooks/hooks.json",
      "",
      "  ❯ ./register.tsx hooks: engine.create",
      "  ❯ ./register.tsx calls: $.process.run",
      "",
      "✔ Validation passed",
    ].join("\n");
    expect(eventsHooked(output)).toEqual(["engine.create"]);
  });

  test("no hooks: line means no events", () => {
    expect(
      eventsHooked("Validating plugin manifest: /repo/plugins/qsm-x/.claude-plugin/plugin.json\n"),
    ).toEqual([]);
  });
});

describe("needsHooksTests", () => {
  test("empty events need no hooks/ test", () => {
    expect(needsHooksTests([])).toBe(false);
  });

  test("engine.create alone needs no hooks/ test", () => {
    expect(needsHooksTests(["engine.create"])).toBe(false);
  });

  test("anything beyond engine.create needs a hooks/ test", () => {
    expect(needsHooksTests(["engine.create", "tool.call"])).toBe(true);
    expect(needsHooksTests(["session.start"])).toBe(true);
  });
});
