// Collect-all over the plugins' own installers.
import { spawnSync } from "node:child_process";
import { NOTHING } from "../../../lib/install-base.ts";
import type {
  ActivationOption,
  ActivationState,
  InstallResult,
  Step,
} from "../../../lib/install-contract.ts";
import type { PluginNode } from "./discover.ts";

export interface InstallOutcome {
  readonly plugin: string;
  /** install-contract status, or blocked / failed from this runner. */
  readonly status: string;
  readonly detail: string;
  readonly steps: readonly Step[];
}
export interface RunResult {
  readonly code: number;
  /** the envelope's data, or null when the installer printed no envelope */
  readonly result: InstallResult | null;
  readonly stderr: string;
}
export type Runner = (installer: string, dryRun: boolean) => RunResult;

const FAILED = new Set(["error", "missing-prereq", "blocked", "failed"]);

export function isFailedOutcome(o: { readonly status: string }): boolean {
  return FAILED.has(o.status);
}

/** The envelope cliMain prints under --json: `{ code, ..., data: InstallResult }`. */
function parseEnvelope(stdout: string): InstallResult | null {
  const text = stdout.trim();
  if (text.length === 0) {
    return null;
  }
  try {
    const envelope = JSON.parse(text) as { data?: InstallResult | null };
    return envelope.data ?? null;
  } catch {
    return null;
  }
}

export const bunRunner: Runner = (installer, dryRun) => {
  const r = spawnSync("bun", [installer, "--json", ...(dryRun ? ["--dry-run"] : [])], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { code: r.status ?? 1, result: parseEnvelope(r.stdout ?? ""), stderr: r.stderr ?? "" };
};

interface ActivationReport {
  readonly state: ActivationState;
  readonly options: readonly ActivationOption[];
}
/** What an activation script says of the machine, or the reason it could not. */
export type ActivationReader = (activation: string) => ActivationReport | string;

export const bunActivationReader: ActivationReader = (activation) => {
  const r = spawnSync("bun", [activation, "--status", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const envelope = JSON.parse(r.stdout) as { data: ActivationReport | null; message: string };
    return envelope.data ?? envelope.message;
  } catch {
    const last = (r.stderr ?? "").trim().split("\n").at(-1) ?? "";
    return `status exited ${r.status} and printed no envelope: ${last}`;
  }
};

function outcomeOf(name: string, r: RunResult): InstallOutcome {
  if (r.result !== null) {
    return {
      plugin: name,
      status: r.result.status,
      detail: r.result.detail,
      steps: r.result.steps,
    };
  }
  const last = r.stderr
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .at(-1);
  // An installer that printed no envelope cannot say what it did, so it did
  // not install: loud, never an empty success.
  const why = `installer exited ${r.code} and printed no envelope`;
  return {
    plugin: name,
    status: "failed",
    detail: last === undefined ? why : `${why}; its last stderr line: ${last}`,
    steps: [],
  };
}

export function runInstallers(
  nodes: readonly PluginNode[],
  order: readonly string[],
  opts: {
    readonly dryRun: boolean;
    readonly run: Runner;
    /** plugin -> the plugins that pulled it in, for one not named by the user */
    readonly requiredBy?: ReadonlyMap<string, readonly string[]>;
  },
): InstallOutcome[] {
  const why = (name: string, o: InstallOutcome): InstallOutcome => {
    const by = opts.requiredBy?.get(name);
    return by === undefined ? o : { ...o, detail: `required by ${by.join(", ")}; ${o.detail}` };
  };
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const failed = new Set<string>();
  const out: InstallOutcome[] = [];
  for (const name of order) {
    const node = byName.get(name);
    if (node === undefined) {
      continue;
    }
    const blocker = node.dependencies.find((d) => failed.has(d));
    if (blocker !== undefined) {
      failed.add(name);
      out.push({
        plugin: name,
        status: "blocked",
        detail: `requirement ${blocker} failed`,
        steps: [],
      });
      continue;
    }
    if (node.installer === null) {
      out.push(why(name, { plugin: name, status: "already", detail: NOTHING, steps: [] }));
      continue;
    }
    const r = opts.run(node.installer, opts.dryRun);
    const outcome = why(name, outcomeOf(name, r));
    if (isFailedOutcome(outcome) || (r.code !== 0 && !opts.dryRun)) {
      failed.add(name);
      out.push({ ...outcome, status: isFailedOutcome(outcome) ? outcome.status : "failed" });
      continue;
    }
    out.push(outcome);
  }
  return out;
}
