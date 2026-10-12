// One ordered script of page actions, checked before any of it runs.

type StepAction = "navigate" | "fill" | "fill-secret" | "click" | "wait" | "extract" | "screenshot";

export interface Step {
  readonly action: StepAction;
  /** navigate */
  readonly url?: string;
  /** fill, fill-secret, click, wait, extract */
  readonly selector?: string;
  /** fill */
  readonly value?: string;
  /** fill-secret: the entry in the password store, and which of its fields */
  readonly item?: string;
  readonly field?: string;
  /** wait */
  readonly text?: string;
  readonly timeoutMs?: number;
  /** extract */
  readonly limit?: number;
  /** screenshot */
  readonly path?: string;
  /** set on a fill the driver must report without its value */
  readonly redact?: boolean;
}

export interface Script {
  readonly tab?: number;
  readonly steps: readonly Step[];
}

const ACTIONS = new Set<string>([
  "navigate",
  "fill",
  "fill-secret",
  "click",
  "wait",
  "extract",
  "screenshot",
]);

/** What each action cannot do without. `wait` is the exception: it takes a
 * selector, a text, or neither (a plain timeout), so it is checked apart. */
const REQUIRED: Partial<Record<StepAction, readonly (keyof Step)[]>> = {
  navigate: ["url"],
  fill: ["selector", "value"],
  "fill-secret": ["selector", "item"],
  click: ["selector"],
};

export class ScriptError extends Error {
  readonly index: number | null;
  constructor(message: string, index: number | null) {
    super(message);
    this.name = "ScriptError";
    this.index = index;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse and check a script. Throws ScriptError naming the first bad step,
 * so the caller reports which step it refused and why. */
export function readScript(input: unknown): Script {
  if (!isRecord(input)) {
    throw new ScriptError("a script is one JSON object", null);
  }
  const raw = input.steps;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ScriptError("a script needs a non-empty steps array", null);
  }
  const { tab } = input;
  if (tab !== undefined && typeof tab !== "number") {
    throw new ScriptError("tab must be a number", null);
  }
  const steps = raw.map((s, i) => readStep(s, i));
  return tab === undefined ? { steps } : { tab, steps };
}

function requireWaitCondition(step: Step, index: number): void {
  if (
    step.action === "wait" &&
    step.selector === undefined &&
    step.text === undefined &&
    typeof step.timeoutMs !== "number"
  ) {
    throw new ScriptError("wait needs a selector, a text, or a timeoutMs", index);
  }
}

function readStep(s: unknown, index: number): Step {
  if (!isRecord(s)) {
    throw new ScriptError("a step is one JSON object", index);
  }
  const { action } = s;
  if (typeof action !== "string" || !ACTIONS.has(action)) {
    throw new ScriptError(`unknown action ${JSON.stringify(action)}`, index);
  }
  const step = s as unknown as Step;
  for (const key of REQUIRED[action as StepAction] ?? []) {
    const v = step[key];
    if (typeof v !== "string" || v.length === 0) {
      throw new ScriptError(`${action} needs a ${key}`, index);
    }
  }
  requireWaitCondition(step, index);
  return step;
}

/** The steps whose value comes from the password store, with their index. */
export function secretSteps(script: Script): Array<{ index: number; step: Step }> {
  const out: Array<{ index: number; step: Step }> = [];
  script.steps.forEach((step, index) => {
    if (step.action === "fill-secret") {
      out.push({ index, step });
    }
  });
  return out;
}

/**
 * Replace each fill-secret with an ordinary fill carrying the resolved value and a redact marker,
 * so the driver fills the field but reports the value as redacted.
 */
export function withSecrets(script: Script, values: ReadonlyMap<number, string>): Script {
  const steps = script.steps.map((step, index) => {
    if (step.action !== "fill-secret") {
      return step;
    }
    const value = values.get(index);
    if (value === undefined) {
      throw new ScriptError("no value resolved for fill-secret", index);
    }
    return { action: "fill" as const, selector: step.selector, value, redact: true } as Step;
  });
  return script.tab === undefined ? { steps } : { tab: script.tab, steps };
}
