// The workflow script is not importable as it stands: the runtime injects
// agent(), parallel(), phase(), log() and args as globals, and the body ends in
// a top-level return. Wrapping the whole body in one async function and binding
// those five names reproduces the runtime closely enough to drive the script's
// decisions with stub agents, which is what this file tests. The script source
// is never edited, only wrapped, so a rule that moves in the script moves here.

import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

interface AgentOpts {
  readonly phase?: string;
  readonly label?: string;
  readonly model?: string;
}

interface Call {
  readonly prompt: string;
  readonly opts: AgentOpts;
}

interface Injection {
  readonly agent: (prompt: string, opts: AgentOpts) => Promise<unknown>;
  readonly parallel: (thunks: Array<() => Promise<unknown>>) => Promise<unknown[]>;
  readonly phase: (title: string) => void;
  readonly log: (message: string) => void;
  readonly args: unknown;
}

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly description: string;
  readonly evidence: string;
  readonly reaches: string;
}

interface InlineComment {
  readonly path: string;
  readonly line: number;
  readonly body: string;
}

interface Result {
  readonly mode: string;
  readonly verdict?: string;
  readonly reason?: string;
  readonly difficulty?: number;
  readonly lenses?: readonly string[];
  readonly skippedLenses?: readonly string[];
  readonly findings?: readonly Finding[];
  readonly refuted?: ReadonlyArray<Finding & { readonly reason: string }>;
  readonly payload?: {
    readonly decision: string;
    readonly body: string;
    readonly inline: readonly InlineComment[];
  };
}

const sandbox = mkdtempSync(join(tmpdir(), "qsm-review-flow-"));
afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

const script = join(import.meta.dirname, "..", "workflows", "strict-review.mjs");
const source = readFileSync(script, "utf8").replace(/^export const meta/m, "const meta");
const wrapped = `export async function reviewRun(inj) {
  const { agent, parallel, phase, log } = inj;
  const args = inj.args;
${source}
}`;
const wrappedPath = join(sandbox, "flow.mjs");
writeFileSync(wrappedPath, wrapped, "utf8");
const mod: unknown = await import(pathToFileURL(wrappedPath).href);

function hasReviewRun(
  value: unknown,
): value is { readonly reviewRun: (inj: Injection) => Promise<Result> } {
  return (
    typeof value === "object" &&
    value !== null &&
    "reviewRun" in value &&
    typeof value.reviewRun === "function"
  );
}
if (!hasReviewRun(mod)) throw new Error("the wrapped workflow exports no reviewRun function");
const loaded = mod;

const CTX = {
  platform: "github",
  repo: "owner/name",
  number: 12,
  title: "Add a thing",
  body: "It adds a thing.",
  headSha: "abc1234",
  baseRef: "main",
  files: ["src/a.ts"],
};
const DEFAULT_ARGS = { ctx: CTX, diffPath: "/review/pr-12.diff", worktree: "/review/worktree" };

const RATING = {
  difficulty: 3,
  category: "fix",
  overview: "It adds a thing.",
  lenses: [] as string[],
  is_question: false,
};

const FINDING: Finding = {
  file: "src/a.ts",
  line: 7,
  description: "Parameterize this query",
  evidence: "the value is concatenated into the statement",
  reaches: "the public handler calls it",
};

interface Scenario {
  readonly args?: unknown;
  readonly rate?: unknown;
  readonly anchor?: (index: number) => unknown;
  readonly lens?: (name: string) => unknown;
  readonly check?: (index: number) => unknown;
}

interface Run {
  readonly result: Result;
  readonly calls: readonly Call[];
  readonly logs: readonly string[];
}

const noFindings = () => ({ findings: [] });

async function drive(scenario: Scenario = {}): Promise<Run> {
  const calls: Call[] = [];
  const logs: string[] = [];
  let anchors = 0;
  let checks = 0;
  const review = (label: string): unknown => {
    if (!label.startsWith("anchor")) {
      return scenario.lens ? scenario.lens(label) : noFindings();
    }
    const index = anchors;
    anchors += 1;
    return scenario.anchor ? scenario.anchor(index) : noFindings();
  };
  const reply = (opts: AgentOpts): unknown => {
    if (opts.phase === "Rate") {
      return scenario.rate === undefined ? RATING : scenario.rate;
    }
    if (opts.phase === "Review") {
      return review(opts.label ?? "");
    }
    const index = checks;
    checks += 1;
    return scenario.check ? scenario.check(index) : { refuted: false, reason: "it stands" };
  };
  const agent = (prompt: string, opts: AgentOpts): Promise<unknown> => {
    calls.push({ prompt, opts });
    return Promise.resolve(reply(opts));
  };
  const result = await loaded.reviewRun({
    agent,
    parallel: (thunks) =>
      Promise.all(
        thunks.map((thunk) =>
          Promise.resolve()
            .then(thunk)
            .catch(() => null),
        ),
      ),
    phase: () => {
      // the progress display is not under test
    },
    log: (message) => {
      logs.push(message);
    },
    args: scenario.args === undefined ? DEFAULT_ARGS : scenario.args,
  });
  return { result, calls, logs };
}

const reviewCalls = (calls: readonly Call[], kind: "anchor" | "lens") =>
  calls.filter(
    (c) =>
      c.opts.phase === "Review" &&
      (c.opts.label ?? "").startsWith("anchor") === (kind === "anchor"),
  );

test("rating 1 runs one anchor and no lens slots", async () => {
  const { calls } = await drive({ rate: { ...RATING, difficulty: 1, lenses: ["auth", "data"] } });
  expect(reviewCalls(calls, "anchor")).toHaveLength(1);
  expect(reviewCalls(calls, "lens")).toHaveLength(0);
});

test("rating 5 runs two anchors, five lens slots and two refutation votes", async () => {
  const { calls, result } = await drive({
    rate: {
      ...RATING,
      difficulty: 5,
      lenses: ["auth", "input", "api", "data", "testing"],
    },
    anchor: (i) => (i === 0 ? { findings: [FINDING] } : noFindings()),
  });
  expect(reviewCalls(calls, "anchor")).toHaveLength(2);
  expect(reviewCalls(calls, "lens")).toHaveLength(5);
  expect(calls.filter((c) => c.opts.phase === "Check")).toHaveLength(2);
  expect(result.lenses).toEqual(["correctness", "auth", "input", "api", "data", "testing"]);
});

test("a lens pick longer than the rating's cap is truncated and logged", async () => {
  const { calls, logs, result } = await drive({
    rate: { ...RATING, difficulty: 3, lenses: ["auth", "input", "api", "data"] },
  });
  expect(reviewCalls(calls, "lens")).toHaveLength(2);
  expect(result.lenses).toEqual(["correctness", "auth", "input"]);
  expect(logs.join("\n")).toContain("caps the pick at 2: api, data not reviewed");
});

test("two reviewers reporting the same finding on one line collapse to one candidate", async () => {
  const { calls, logs } = await drive({
    rate: { ...RATING, difficulty: 5, lenses: [] },
    anchor: () => ({ findings: [FINDING] }),
  });
  // Two anchors, one candidate, two votes on it: four check calls would mean the dedup missed.
  expect(calls.filter((c) => c.opts.phase === "Check")).toHaveLength(2);
  expect(logs.join("\n")).toContain("2 raw finding(s)");
  expect(logs.join("\n")).toContain("1 after dedup");
});

test("a finding no vote refutes survives and the verdict is request-changes", async () => {
  const { result } = await drive({ anchor: () => ({ findings: [FINDING] }) });
  expect(result.verdict).toBe("request-changes");
  expect(result.findings).toHaveLength(1);
  expect(result.payload?.decision).toBe("request-changes");
  expect(result.payload?.inline).toEqual([
    {
      path: "src/a.ts",
      line: 7,
      body: "Parameterize this query\n\nthe value is concatenated into the statement\n\nReached by: the public handler calls it",
    },
  ]);
});

test("zero findings is approve and an empty inline list", async () => {
  const { result } = await drive();
  expect(result.verdict).toBe("approve");
  expect(result.payload?.inline).toEqual([]);
  expect(result.payload?.body).toContain("No findings.");
});

test("a refuted finding leaves the review with its reason", async () => {
  const { result } = await drive({
    anchor: () => ({ findings: [FINDING] }),
    check: () => ({ refuted: true, reason: "the call site already parameterizes it" }),
  });
  expect(result.findings).toHaveLength(0);
  expect(result.verdict).toBe("approve");
  expect(result.refuted?.[0]?.reason).toBe("the call site already parameterizes it");
});

test("a dead correctness anchor aborts instead of approving", async () => {
  const { result } = await drive({ anchor: () => null });
  expect(result.mode).toBe("aborted");
  expect(result.verdict).toBe("aborted");
  expect(result.payload).toBeUndefined();
});

test("a check pass that returned nothing keeps the finding as unverified", async () => {
  const { result } = await drive({
    anchor: () => ({ findings: [FINDING] }),
    check: () => null,
  });
  expect(result.verdict).toBe("request-changes");
  expect(result.findings?.[0]?.description).toBe("Verify: Parameterize this query");
  expect(result.refuted).toHaveLength(0);
});

test("a dead lens slot is reported rather than passed off as coverage", async () => {
  const { result, logs } = await drive({
    rate: { ...RATING, difficulty: 3, lenses: ["auth", "data"] },
    lens: (name) => (name === "data" ? null : noFindings()),
  });
  expect(result.skippedLenses).toEqual(["data"]);
  expect(logs.join("\n")).toContain("data not reviewed");
});

test("args that arrive as a JSON string are read, not discarded", async () => {
  const { result, calls } = await drive({ args: JSON.stringify(DEFAULT_ARGS) });
  expect(result.mode).toBe("review");
  expect(calls[0]?.prompt).toContain("owner/name");
  expect(calls[0]?.prompt).toContain("/review/pr-12.diff");
});

test("no diff path aborts before a single agent runs", async () => {
  const { result, calls } = await drive({ args: { ctx: CTX } });
  expect(result.mode).toBe("aborted");
  expect(result.reason).toContain("no diff path");
  expect(calls).toHaveLength(0);
});

test("a rating outside the ladder is clamped instead of running an empty squad", async () => {
  const high = await drive({ rate: { ...RATING, difficulty: 9 } });
  expect(high.result.difficulty).toBe(5);
  expect(reviewCalls(high.calls, "anchor")).toHaveLength(2);

  const junk = await drive({ rate: { ...RATING, difficulty: "big" } });
  expect(junk.result.difficulty).toBe(3);
  expect(reviewCalls(junk.calls, "anchor")).toHaveLength(1);
});

test("a finding outside the changed lines is folded into the body, not posted inline", async () => {
  const { result } = await drive({
    args: { ...DEFAULT_ARGS, ctx: { ...CTX, changedLines: { "src/a.ts": [3, 4] } } },
    anchor: () => ({
      findings: [FINDING, { ...FINDING, line: 3, description: "Close this handle" }],
    }),
  });
  expect(result.findings).toHaveLength(2);
  expect(result.payload?.inline.map((c) => c.line)).toEqual([3]);
  expect(result.payload?.body).toContain("Outside the diff");
  expect(result.payload?.body).toContain("src/a.ts:7");
});

test("every dispatch names the model it runs on", async () => {
  const { calls } = await drive({
    rate: { ...RATING, difficulty: 5, lenses: ["auth"] },
    anchor: (i) => (i === 0 ? { findings: [FINDING] } : noFindings()),
  });
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(call.opts.model).toBeTruthy();
  }
  expect(calls.find((c) => c.opts.label === "auth")?.opts.model).toBe("sonnet");
  expect(calls.find((c) => (c.opts.label ?? "").startsWith("anchor"))?.opts.model).toBe("opus");
});
