// Guards for JSON read from disk or from a child's stdout: parse to unknown, check what is read.
import type {
  ActivationOption,
  ActivationState,
  InstallResult,
  InstallStatus,
} from "../../../lib/install-contract.ts";
import { OUTCOME_CODES, type OutcomeCode } from "../../../lib/outcome.ts";
import type { CommandArg, CommandDecl, QsmManifest } from "../../../lib/qsm-manifest.ts";

export function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

/** The entries of `x` whose value is a string; {} when `x` is not an object. */
export function stringRecord(x: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isRecord(x)) {
    for (const [k, v] of Object.entries(x)) {
      if (typeof v === "string") {
        out[k] = v;
      }
    }
  }
  return out;
}

const ARG_TYPES = new Set(["string", "number", "boolean"]);

function isCommandArg(x: unknown): x is CommandArg {
  return (
    isRecord(x) &&
    typeof x.name === "string" &&
    typeof x.type === "string" &&
    ARG_TYPES.has(x.type) &&
    typeof x.description === "string" &&
    (x.positional === undefined || x.positional === true) &&
    (x.required === undefined || x.required === true) &&
    (x.repeatable === undefined || x.repeatable === true) &&
    (x.choices === undefined || isStringArray(x.choices))
  );
}

function isCommandDecl(x: unknown): x is CommandDecl {
  return (
    isRecord(x) &&
    typeof x.description === "string" &&
    (x.args === undefined || (Array.isArray(x.args) && x.args.every((a) => isCommandArg(a)))) &&
    (x.passthrough === undefined || x.passthrough === true) &&
    (x.noNoun === undefined || x.noNoun === true)
  );
}

export function isQsmManifest(x: unknown): x is QsmManifest {
  if (!isRecord(x) || !isRecord(x.qsm)) {
    return false;
  }
  const { bin, noun, commands } = x.qsm;
  return (
    (x.name === undefined || typeof x.name === "string") &&
    (bin === undefined ||
      (isRecord(bin) && Object.values(bin).every((v) => typeof v === "string"))) &&
    (noun === undefined || typeof noun === "string") &&
    isRecord(commands) &&
    Object.values(commands).every((c) => isCommandDecl(c))
  );
}

/** The declarations of `x` that are well formed, for a reader that skips what it cannot use. */
export function commandDecls(x: unknown): Record<string, CommandDecl> {
  const out: Record<string, CommandDecl> = {};
  if (isRecord(x)) {
    for (const [k, v] of Object.entries(x)) {
      if (isCommandDecl(v)) {
        out[k] = v;
      }
    }
  }
  return out;
}

const INSTALL_STATUSES: readonly InstallStatus[] = [
  "installed",
  "already",
  "skipped",
  "suggested",
  "missing-prereq",
  "error",
];

function isInstallStatus(x: unknown): x is InstallStatus {
  return INSTALL_STATUSES.some((s) => s === x);
}

export function isInstallResult(x: unknown): x is InstallResult {
  return (
    isRecord(x) &&
    typeof x.tool === "string" &&
    isInstallStatus(x.status) &&
    typeof x.detail === "string" &&
    Array.isArray(x.steps) &&
    x.steps.every(
      (s) =>
        isRecord(s) &&
        typeof s.name === "string" &&
        isInstallStatus(s.status) &&
        typeof s.detail === "string",
    )
  );
}

function isActivationOption(x: unknown): x is ActivationOption {
  return (
    isRecord(x) &&
    typeof x.name === "string" &&
    isStringArray(x.values) &&
    typeof x.description === "string"
  );
}

const ACTIVATION_STATES: readonly ActivationState[] = ["activated", "absent", "differs"];

export interface ActivationReport {
  readonly state: ActivationState;
  readonly options: readonly ActivationOption[];
}

export function isActivationReport(x: unknown): x is ActivationReport {
  return (
    isRecord(x) &&
    ACTIVATION_STATES.some((s) => s === x.state) &&
    Array.isArray(x.options) &&
    x.options.every(isActivationOption)
  );
}

export interface ParsedEnvelope {
  readonly code: OutcomeCode;
  readonly message: string;
  /** unchecked beyond being present: the caller narrows it with its own guard */
  readonly data: unknown;
}

function isOutcomeCode(x: unknown): x is OutcomeCode {
  return OUTCOME_CODES.some((c) => c === x);
}

/** The envelope a qsm binary prints under --json, or null when the text is not one. */
export function parseEnvelope(text: string): ParsedEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isOutcomeCode(parsed.code)) {
    return null;
  }
  return {
    code: parsed.code,
    message: typeof parsed.message === "string" ? parsed.message : "",
    data: parsed.data ?? null,
  };
}
