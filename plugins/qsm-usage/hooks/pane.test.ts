// claude plugin test plugins/qsm-usage: /qsm-usage opens a pane drawn from the
// summary breakdown and the ledger, with no model call and no turn.
import type { ModelUsage, On } from "claude-code";
import { type Engine, expect, test } from "claude-code/testing";
import { newSeen, type Store, stubHost, stubStore } from "./test-host.tsx";

/** A model reply's cost, zeroed: this stub answers `model.complete` only to
 * prove the count, never to assert on what it cost. */
const NO_USAGE: ModelUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

const START = { cwd: "/repo", surface: null, isInteractive: true } as const;
const RUN = {
  command: "qsm-usage",
  args: "",
  origin: { kind: "composer" },
  presentation: { isFullscreen: true, columns: 160 },
} as const;
const PANE = {
  title: "qsm-usage",
  isFocused: false,
  bodyColumns: 60,
  placement: "dock",
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
} as const;

interface Counts {
  opened: string[];
  beneath: number;
  turns: number;
  models: number;
}

/** Counts what must not happen: a command beneath, a turn, a model call. */
function watch(on: On): Counts {
  const counts: Counts = { opened: [], beneath: 0, turns: 0, models: 0 };
  on("ui.open", (_$, e) => {
    counts.opened.push(e.id);
    return { value: { isPlaced: true } };
  });
  on("command.run", () => {
    counts.beneath += 1;
    return { text: "ran beneath" };
  });
  on("turn.start", (_$, e) => {
    counts.turns += 1;
    return e as never;
  });
  on("model.complete", () => {
    counts.models += 1;
    return { value: { isAnswered: true, text: "", usage: NO_USAGE } };
  });
  return counts;
}

async function paneText($: Engine, surface: "terminal" | "desktop"): Promise<string> {
  const ui = await $.ui.mount({
    plugin: "qsm-usage",
    surface,
    component: "Pane",
    props: PANE,
    requestId: "qsm-usage",
  });
  const found = await ui.find({ type: "Markdown" });
  await ui.unmount();
  return String(found?.props.text ?? "");
}

test("Running the command", async ($, on) => {
  const store: Store = new Map();
  stubStore(on, store);
  stubHost(on, "p1", newSeen());
  const counts = watch(on);

  await $.session.start(START);
  await $.command.run(RUN);

  expect(counts.opened).toEqual(["qsm-usage"]);
  for (const surface of ["terminal", "desktop"] as const) {
    const text = await paneText($, surface);
    expect(text).toContain("42k of 200k used, 158k left");
    expect(text).toContain("| Messages | 27k |");
    expect(text).toContain(
      "MCP server idle has no calls this session: `/mcp disable idle` saves ~12k tokens per turn",
    );
  }
  expect(counts.beneath).toBe(0);
  expect(counts.turns).toBe(0);
  expect(counts.models).toBe(0);
});

test("A new session before its first turn", async ($, on) => {
  stubStore(on, new Map());
  stubHost(on, "p2", newSeen());
  watch(on);

  await $.session.start(START);
  await $.command.run(RUN);

  const text = await paneText($, "terminal");
  expect(text).toContain("No turn has run yet");
  expect(text).toContain("| System prompt | 3k |");
});
