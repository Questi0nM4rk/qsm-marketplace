// Guards for JSON read from disk or from a child's stdout: parse to unknown, check what is read.
import type {
  ActivationOption,
  ActivationState,
  InstallResult,
  InstallStatus,
} from "../../../lib/install-contract.ts";
import { isRecord, OUTCOME_CODES, type OutcomeCode } from "../../../lib/outcome.ts";

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
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
  readonly exit: number;
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
  if (!isRecord(parsed) || !isOutcomeCode(parsed.code) || typeof parsed.exit !== "number") {
    return null;
  }
  return {
    code: parsed.code,
    exit: parsed.exit,
    message: typeof parsed.message === "string" ? parsed.message : "",
    data: parsed.data ?? null,
  };
}
