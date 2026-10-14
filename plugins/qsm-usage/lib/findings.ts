// The one shape every topic skill returns and the report renders from.

import { isPlainObject } from "./toon-scalar.ts";

const LEVELS = ["quick", "standard"] as const;
type Level = (typeof LEVELS)[number];

const CHANGE_KINDS = ["edit", "command", "remove", "none"] as const;
type ChangeKind = (typeof CHANGE_KINDS)[number];

const VERDICTS = ["remove", "keep", "fix", "warn"] as const;
type Verdict = (typeof VERDICTS)[number];

const QUESTIONS = ["removal", "cleanup", "permissions", "none"] as const;
type Question = (typeof QUESTIONS)[number];

const TOPIC_NAMES = [
  "unused-extensions",
  "duplicates",
  "claude-md-trim",
  "hooks-review",
  "permissions-tune",
  "insights",
  "tools-review",
] as const;
type TopicName = (typeof TOPIC_NAMES)[number];

interface FindingsWindow {
  readonly sessions: number;
  readonly from: string;
  readonly to: string;
}

export interface Change {
  readonly kind: ChangeKind;
  readonly target: string;
  readonly detail?: string;
}

export interface Finding {
  readonly id: string;
  readonly title: string;
  readonly evidence: string;
  readonly change: Change;
  readonly savingTokens: number;
  readonly savingNote?: string;
  readonly verdict: Verdict;
  readonly question: Question;
  readonly applied: boolean;
}

export interface Topic {
  readonly topic: TopicName;
  readonly summary: string;
  readonly findings: readonly Finding[];
}

export interface FindingsDocument {
  readonly level: Level;
  readonly window: FindingsWindow;
  readonly topics: readonly Topic[];
}

/** Thrown only inside `validateFindings`, which catches it; never escapes this module. */
class Broken extends Error {
  readonly field: string;
  readonly reason: string;
  constructor(field: string, reason: string) {
    super(`${field}: ${reason}`);
    this.field = field;
    this.reason = reason;
  }
}

function broken(field: string, reason: string): never {
  throw new Broken(field, reason);
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    broken(field, "must be an object");
  }
  return value;
}

function nested(obj: Record<string, unknown>, key: string, field: string): Record<string, unknown> {
  if (obj[key] === undefined) {
    broken(field, "required");
  }
  return asObject(obj[key], field);
}

function str(obj: Record<string, unknown>, key: string, field: string): string {
  const value = obj[key];
  if (value === undefined) {
    broken(field, "required");
  }
  if (typeof value !== "string") {
    broken(field, "must be a string");
  }
  return value;
}

function optionalStr(obj: Record<string, unknown>, key: string, field: string): string | undefined {
  const value = obj[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    broken(field, "must be a string");
  }
  return value;
}

function nonEmptyStr(obj: Record<string, unknown>, key: string, field: string): string {
  const value = str(obj, key, field);
  if (value.length === 0) {
    broken(field, "must not be empty");
  }
  return value;
}

function num(obj: Record<string, unknown>, key: string, field: string): number {
  const value = obj[key];
  if (value === undefined) {
    broken(field, "required");
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    broken(field, "must be a number");
  }
  return value;
}

function nonNegativeInt(obj: Record<string, unknown>, key: string, field: string): number {
  const value = num(obj, key, field);
  if (!Number.isInteger(value) || value < 0) {
    broken(field, "must be a non-negative integer");
  }
  return value;
}

function nonNegativeNum(obj: Record<string, unknown>, key: string, field: string): number {
  const value = num(obj, key, field);
  if (value < 0) {
    broken(field, "must be >= 0");
  }
  return value;
}

function bool(obj: Record<string, unknown>, key: string, field: string): boolean {
  const value = obj[key];
  if (value === undefined) {
    broken(field, "required");
  }
  if (typeof value !== "boolean") {
    broken(field, "must be a boolean");
  }
  return value;
}

function isoString(obj: Record<string, unknown>, key: string, field: string): string {
  const value = str(obj, key, field);
  if (Number.isNaN(Date.parse(value))) {
    broken(field, "must be an ISO date string");
  }
  return value;
}

function oneOf<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  field: string,
  options: readonly T[],
): T {
  const value = str(obj, key, field);
  const match = options.find((option) => option === value);
  if (match === undefined) {
    broken(field, `must be one of ${options.join(", ")}`);
  }
  return match;
}

function arr(obj: Record<string, unknown>, key: string, field: string): unknown[] {
  const value = obj[key];
  if (value === undefined) {
    broken(field, "required");
  }
  if (!Array.isArray(value)) {
    broken(field, "must be an array");
  }
  return value;
}

function readWindow(doc: Record<string, unknown>): FindingsWindow {
  const w = nested(doc, "window", "window");
  return {
    sessions: nonNegativeInt(w, "sessions", "window.sessions"),
    from: isoString(w, "from", "window.from"),
    to: isoString(w, "to", "window.to"),
  };
}

function readChange(finding: Record<string, unknown>, field: string): Change {
  const c = nested(finding, "change", field);
  const kind = oneOf(c, "kind", `${field}.kind`, CHANGE_KINDS);
  const target = str(c, "target", `${field}.target`);
  if (kind !== "none" && target.length === 0) {
    broken(`${field}.target`, "must not be empty unless change.kind is none");
  }
  const detail = optionalStr(c, "detail", `${field}.detail`);
  return detail === undefined ? { kind, target } : { kind, target, detail };
}

function readFinding(raw: unknown, field: string, seenIds: Set<string>): Finding {
  const f = asObject(raw, field);
  const id = nonEmptyStr(f, "id", `${field}.id`);
  if (seenIds.has(id)) {
    broken(`${field}.id`, "must be unique in the document");
  }
  seenIds.add(id);
  const title = nonEmptyStr(f, "title", `${field}.title`);
  const evidence = nonEmptyStr(f, "evidence", `${field}.evidence`);
  const change = readChange(f, `${field}.change`);
  const savingTokens = nonNegativeNum(f, "savingTokens", `${field}.savingTokens`);
  const savingNote =
    savingTokens === 0
      ? nonEmptyStr(f, "savingNote", `${field}.savingNote`)
      : optionalStr(f, "savingNote", `${field}.savingNote`);
  const verdict = oneOf(f, "verdict", `${field}.verdict`, VERDICTS);
  const question = oneOf(f, "question", `${field}.question`, QUESTIONS);
  const applied = bool(f, "applied", `${field}.applied`);
  return {
    id,
    title,
    evidence,
    change,
    savingTokens,
    ...(savingNote === undefined ? {} : { savingNote }),
    verdict,
    question,
    applied,
  };
}

function readTopic(raw: unknown, field: string, seenIds: Set<string>): Topic {
  const t = asObject(raw, field);
  const topic = oneOf(t, "topic", `${field}.topic`, TOPIC_NAMES);
  const summary = nonEmptyStr(t, "summary", `${field}.summary`);
  const findings = arr(t, "findings", `${field}.findings`).map((entry, i) =>
    readFinding(entry, `${field}.findings[${i}]`, seenIds),
  );
  return { topic, summary, findings };
}

export interface ValidationFailure {
  readonly field: string;
  readonly reason: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly value: FindingsDocument }
  | ({ readonly ok: false } & ValidationFailure);

/** `field: reason`, the shape USAGE.md documents for a broken input. */
export function describeFailure(failure: ValidationFailure): string {
  return `${failure.field}: ${failure.reason}`;
}

/**
 * Pure: validates one JSON value against the findings format and returns either the typed document
 * or the first field that broke, walked in the order USAGE.md's field table lists it.
 */
export function validateFindings(input: unknown): ValidationResult {
  try {
    const doc = asObject(input, "document");
    const level = oneOf(doc, "level", "level", LEVELS);
    const window = readWindow(doc);
    const topicsRaw = arr(doc, "topics", "topics");
    if (topicsRaw.length === 0) {
      broken("topics", "must have at least one item");
    }
    const seenIds = new Set<string>();
    const topics = topicsRaw.map((raw, i) => readTopic(raw, `topics[${i}]`, seenIds));
    return {
      ok: true,
      value: { level, window, topics },
    };
  } catch (error) {
    if (error instanceof Broken) {
      return { ok: false, field: error.field, reason: error.reason };
    }
    throw error;
  }
}
