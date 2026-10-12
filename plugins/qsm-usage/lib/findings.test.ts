import { describe, expect, test } from "bun:test";
import { describeFailure, validateFindings } from "./findings.ts";

function validDoc(): Record<string, unknown> {
  return {
    level: "standard",
    window: { sessions: 10, from: "2026-09-01T00:00:00Z", to: "2026-09-25T00:00:00Z" },
    topics: [
      {
        topic: "unused-extensions",
        summary: "3 of 41 extensions had no use in 10 sessions.",
        findings: [
          {
            id: "unused-extensions-1",
            title: "MCP server playwright has no calls in 10 sessions",
            evidence: "0 calls in the ledger; 14 tool names resident",
            change: { kind: "command", target: "/mcp disable playwright", detail: "per project" },
            savingTokens: 0,
            savingNote: "deferred tools cost ~0; one less connection to maintain",
            verdict: "remove",
            question: "removal",
            applied: false,
          },
        ],
      },
    ],
  };
}

describe("validateFindings: a valid document", () => {
  test("returns the typed document", () => {
    const result = validateFindings(validDoc());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.level).toBe("standard");
      expect(result.value.topics).toHaveLength(1);
      expect(result.value.topics[0]?.findings).toHaveLength(1);
    }
  });

  test("accepts an empty findings array", () => {
    const doc = validDoc();
    const [topic] = doc.topics as Record<string, unknown>[];
    if (topic === undefined) {
      throw new Error("test fixture missing its topic");
    }
    topic.findings = [];
    expect(validateFindings(doc).ok).toBe(true);
  });
});

interface Case {
  readonly name: string;
  /** Mutates (or replaces) the valid document to break exactly one field. */
  readonly breakIt: (doc: Record<string, unknown>) => unknown;
  readonly expected: string;
}

function firstFinding(doc: Record<string, unknown>): Record<string, unknown> {
  const topics = doc.topics as Record<string, unknown>[];
  const topic = topics[0] as Record<string, unknown>;
  const findings = topic.findings as Record<string, unknown>[];
  const finding = { ...(findings[0] as Record<string, unknown>) };
  topic.findings = [finding];
  return finding;
}

const CASES: readonly Case[] = [
  {
    name: "the document itself is not an object",
    breakIt: () => "not an object",
    expected: "document: must be an object",
  },
  {
    name: "level is missing",
    breakIt: (doc) => {
      doc.level = undefined;
    },
    expected: "level: required",
  },
  {
    name: "level is not one of the two",
    breakIt: (doc) => {
      doc.level = "thorough";
    },
    expected: "level: must be one of quick, standard",
  },
  {
    name: "window is missing",
    breakIt: (doc) => {
      doc.window = undefined;
    },
    expected: "window: required",
  },
  {
    name: "window.sessions is negative",
    breakIt: (doc) => {
      (doc.window as Record<string, unknown>).sessions = -1;
    },
    expected: "window.sessions: must be a non-negative integer",
  },
  {
    name: "window.from is not an ISO date",
    breakIt: (doc) => {
      (doc.window as Record<string, unknown>).from = "not a date";
    },
    expected: "window.from: must be an ISO date string",
  },
  {
    name: "topics is empty",
    breakIt: (doc) => {
      doc.topics = [];
    },
    expected: "topics: must have at least one item",
  },
  {
    name: "a topic name is not one of the seven",
    breakIt: (doc) => {
      const topics = doc.topics as Record<string, unknown>[];
      const topic = topics[0] as Record<string, unknown>;
      topic.topic = "made-up-topic";
    },
    expected:
      "topics[0].topic: must be one of unused-extensions, duplicates, claude-md-trim, " +
      "hooks-review, permissions-tune, insights, tools-review",
  },
  {
    name: "a finding is missing its saving",
    breakIt: (doc) => {
      firstFinding(doc).savingTokens = undefined;
    },
    expected: "topics[0].findings[0].savingTokens: required",
  },
  {
    name: "a zero saving with no note",
    breakIt: (doc) => {
      firstFinding(doc).savingNote = undefined;
    },
    expected: "topics[0].findings[0].savingNote: required",
  },
  {
    name: "a change target is empty when the kind is not none",
    breakIt: (doc) => {
      firstFinding(doc).change = { kind: "command", target: "" };
    },
    expected: "topics[0].findings[0].change.target: must not be empty unless change.kind is none",
  },
  {
    name: "two findings share one id",
    breakIt: (doc) => {
      const topics = doc.topics as Record<string, unknown>[];
      const topic = topics[0] as Record<string, unknown>;
      const findings = topic.findings as Record<string, unknown>[];
      const original = findings[0] as Record<string, unknown>;
      topic.findings = [original, { ...original }];
    },
    expected: "topics[0].findings[1].id: must be unique in the document",
  },
];

describe("validateFindings: the first broken field", () => {
  for (const testCase of CASES) {
    test(`names ${testCase.expected} when ${testCase.name}`, () => {
      const doc = validDoc();
      const replaced = testCase.breakIt(doc);
      const input = replaced ?? doc;
      const result = validateFindings(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(describeFailure(result)).toBe(testCase.expected);
      }
    });
  }
});
