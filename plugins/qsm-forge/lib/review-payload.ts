// One review payload, the same on both forges.

import { readFileSync } from "node:fs";
import { UsageError } from "./errors.ts";
import { MissingError } from "./missing-error.ts";

/** The decision in the words the spec uses. The forge-specific spelling
 * (GitHub's APPROVE, GitLab's approve call) is built where it is sent. */
type Decision = "comment" | "approve" | "request-changes";

const DECISIONS: readonly Decision[] = ["comment", "approve", "request-changes"];

interface InlineComment {
  readonly path: string;
  readonly line: number;
  readonly body: string;
}

export interface ReviewPayload {
  readonly decision: Decision;
  /** The overall comment. Empty only when the review approves. */
  readonly body: string;
  readonly inline: readonly InlineComment[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDecision(value: unknown): value is Decision {
  return DECISIONS.some((d) => d === value);
}

function inlineCommentOf(value: unknown, index: number): InlineComment {
  if (!isRecord(value)) {
    throw new UsageError(`inline[${index}] is not an object`);
  }
  const { path, line, body } = value;
  if (typeof path !== "string" || path.length === 0) {
    throw new UsageError(`inline[${index}].path must be a file path`);
  }
  if (typeof line !== "number" || !Number.isInteger(line) || line < 1) {
    throw new UsageError(`inline[${index}].line must be a line number`);
  }
  if (typeof body !== "string" || body.trim().length === 0) {
    throw new UsageError(`inline[${index}].body must say something`);
  }
  return { path, line, body };
}

/** Parses and validates the payload. */
export function parseReviewPayload(raw: string): ReviewPayload {
  if (raw.trim().length === 0) {
    throw new UsageError("empty review payload: name a file with --file or pipe one to stdin");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new UsageError("review payload is not JSON", { cause });
  }
  if (!isRecord(parsed)) {
    throw new UsageError("review payload must be an object");
  }
  const { decision, body, inline } = parsed;
  if (!isDecision(decision)) {
    throw new UsageError(`decision must be one of ${DECISIONS.join(", ")}`);
  }
  const said = bodyOf(body, decision);
  return { decision, body: said, inline: inlineOf(inline).map(inlineCommentOf) };
}

function bodyOf(body: unknown, decision: Decision): string {
  if (body !== undefined && typeof body !== "string") {
    throw new UsageError("body must be text");
  }
  const said = body ?? "";
  // GitHub takes a review with no overall text only when it approves, and refuses the rest at the
  // endpoint.
  if (decision !== "approve" && said.trim().length === 0) {
    throw new UsageError(`a ${decision} review needs a body: only an approval may say nothing`);
  }
  return said;
}

function inlineOf(inline: unknown): readonly unknown[] {
  if (inline === undefined) {
    return [];
  }
  if (!Array.isArray(inline)) {
    throw new UsageError("inline must be a list of comments");
  }
  return inline;
}

/** The payload named by `--file`. */
export function readPayloadFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (cause) {
    throw new MissingError(`--file ${path}: cannot be read; nothing was posted`, { cause });
  }
}
