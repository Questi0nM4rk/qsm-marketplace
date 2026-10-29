// One outcome system for every qsm binary.
import { which } from "bun";

export const OUTCOME_CODES = [
  "ok",
  "failed",
  "usage",
  "worse",
  "missing",
  "blocked",
  "partial",
] as const;

export type OutcomeCode = (typeof OUTCOME_CODES)[number];

export interface OutcomeRow {
  readonly exit: number;
  /** what the code means, one line */
  readonly reason: string;
  /** how a call usually ends up here, one line */
  readonly cause: string;
}

export const OUTCOMES: Readonly<Record<OutcomeCode, OutcomeRow>> = {
  ok: {
    exit: 0,
    reason: "the verb did what was asked",
    cause: "the call parsed and the handler reported success",
  },
  failed: {
    exit: 1,
    reason: "the verb ran and reports that the work did not succeed",
    cause: "a test went red, a fetch returned an error, a write was refused",
  },
  usage: {
    exit: 2,
    reason: "the call itself was wrong: verb, flag, or argument",
    cause: "an unknown verb or flag, a missing required argument, a value outside choices",
  },
  worse: {
    exit: 3,
    reason: "a comparison found the working state worse than its reference",
    cause: "a quality score dropped, new findings appeared against the reference commit",
  },
  missing: {
    exit: 4,
    reason: "a prerequisite is absent: a tool, a file, a configuration",
    cause: "a binary is not on PATH, a config file was never written, an env var is unset",
  },
  blocked: {
    exit: 5,
    reason: "a policy refused the action",
    cause: "a secret value would have printed, a guard matched, a gate said no",
  },
  partial: {
    exit: 0,
    reason: "some items were done and some were not; the data says which, nothing stops",
    cause: "a collect-all install or a multi-input verb met one item it could not finish",
  },
};

export interface Outcome<T = unknown> {
  readonly code: OutcomeCode;
  /** specific to this call; the table's reason is the generic line */
  readonly message?: string;
  /** never changes the exit code */
  readonly warnings?: readonly string[];
  readonly data?: T;
}

export interface Envelope<T = unknown> {
  readonly code: OutcomeCode;
  readonly exit: number;
  readonly reason: string;
  readonly message: string;
  readonly warnings: readonly string[];
  readonly data: T | null;
}

/** A call that is wrong in a way the parser could not see; runCli turns it into the usage outcome. */
export class UsageError extends Error {}

/** The message of a caught value. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A JSON object: not null, not an array. Narrows the input of a reader that then checks each field
 * it uses. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function exitOf(code: OutcomeCode): number {
  return OUTCOMES[code].exit;
}

export function ok<T>(data?: T, message?: string): Outcome<T> {
  return {
    code: "ok",
    ...(message === undefined ? {} : { message }),
    ...(data === undefined ? {} : { data }),
  };
}

/** Every non-ok outcome names why, so a reader never meets a bare code. */
export function fail<T>(code: Exclude<OutcomeCode, "ok">, message: string, data?: T): Outcome<T> {
  return { code, message, ...(data === undefined ? {} : { data }) };
}

export function toEnvelope<T>(outcome: Outcome<T>): Envelope<T> {
  return {
    code: outcome.code,
    exit: exitOf(outcome.code),
    reason: OUTCOMES[outcome.code].reason,
    message: outcome.message ?? "",
    warnings: outcome.warnings ?? [],
    data: outcome.data ?? null,
  };
}

/** Exactly one JSON value, one line, for stdout under --json. */
export function renderJson<T>(outcome: Outcome<T>): string {
  return `${JSON.stringify(toEnvelope(outcome))}\n`;
}

export interface TextRender {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Text mode: a success message goes to stdout; a failure's code and message and every warning go
 * to stderr, one per line.
 */
export function renderText(outcome: Outcome): TextRender {
  const warnings = (outcome.warnings ?? []).map((w) => `warning: ${w}\n`).join("");
  if (outcome.code === "ok" || outcome.code === "partial") {
    const stdout = outcome.message === undefined ? "" : `${outcome.message}\n`;
    const partial =
      outcome.code === "partial" ? `warning: partial: ${OUTCOMES.partial.reason}\n` : "";
    return { stdout, stderr: `${partial}${warnings}` };
  }
  const message = outcome.message ?? OUTCOMES[outcome.code].reason;
  const next =
    isRecord(outcome.data) && typeof outcome.data.next === "string"
      ? `next: ${outcome.data.next}\n`
      : "";
  // A report of several lines stays whole; the code then gets its own line,
  // never glued onto the report's first one.
  const text = message.includes("\n")
    ? `${message}\n${outcome.code}: ${OUTCOMES[outcome.code].reason}`
    : `${outcome.code}: ${message}`;
  return { stdout: "", stderr: `${text}\n${next}${warnings}` };
}

// The doctor of a plugin whose health is its upstream tools: is each one on PATH.

export interface ToolCheck {
  readonly cmd: string;
  readonly present: boolean;
  readonly optional: boolean;
  readonly hint: string;
}

export interface DoctorData {
  readonly plugin: string;
  readonly tools: readonly ToolCheck[];
}

/** The one variable a PATH lookup reads; any environment record has this shape. */
type PathEnv = { readonly PATH?: string | undefined };

/** `command -v <cmd>` */
export type OnPath = (cmd: string) => boolean;

/** Where `cmd` resolves on the PATH of `env` (the process's own when omitted), or null. */
export function binPath(cmd: string, env?: PathEnv): string | null {
  return env === undefined ? which(cmd) : which(cmd, { PATH: env.PATH ?? "" });
}

export function onPath(cmd: string, env?: PathEnv): boolean {
  return binPath(cmd, env) !== null;
}

/** An upstream tool as a plugin names it. The installer's `UpstreamTool`
 * has this shape, so a plugin hands doctor the same rows it installs from. */
export interface RequiredTool {
  readonly cmd: string;
  /** present when any of these is on PATH; `cmd` then only names the row */
  readonly anyOf?: readonly string[];
  readonly hint: string;
  /** absent is a warning, never the verdict */
  readonly optional?: true;
}

export function checkTools(tools: readonly RequiredTool[], probe: OnPath = onPath): ToolCheck[] {
  return tools.map((tool) => ({
    cmd: tool.cmd,
    present: (tool.anyOf ?? [tool.cmd]).some((c) => probe(c)),
    optional: tool.optional === true,
    hint: tool.hint,
  }));
}

function absent(check: ToolCheck): string {
  return `${check.cmd} is not on PATH: ${check.hint}`;
}

function row(check: ToolCheck): string {
  if (check.present) {
    return `  ok       ${check.cmd}`;
  }
  return `  ${check.optional ? "absent " : "missing"}  ${check.cmd}`;
}

/** One verdict on the outcome table: ok, or missing with every cause named
 * first and a line per tool after. */
export function doctorVerdict(
  plugin: string,
  checks: readonly ToolCheck[],
  findings: readonly string[] = [],
): Outcome<DoctorData> {
  const data: DoctorData = { plugin, tools: checks };
  const rows = checks.map(row);
  const causes = [...findings, ...checks.filter((c) => !(c.present || c.optional)).map(absent)];
  if (causes.length > 0) {
    return fail("missing", [`${plugin}: ${causes.join("; ")}`, ...rows].join("\n"), data);
  }
  const warnings = checks.filter((c) => !c.present).map(absent);
  return { ...ok(data, [`${plugin}: healthy`, ...rows].join("\n")), warnings };
}
