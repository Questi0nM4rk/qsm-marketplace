// The cockpit's rules, apart from its wiring: the six stages and what each asks, how a model maps to
// its tier and colour, how a tool call is said short, and what an answered question records.
import type { Decision, Stage, StageStep } from "../types/index.d.ts";

export const STAGES: Stage[] = ["LOAD", "PLAN", "EXECUTE", "VERIFY", "LEARN", "CLOSE"];

/** The chip colour of each model tier; its keys are the tiers. */
export const TIER_COLOR: Readonly<Record<string, string>> = Object.fromEntries([
  ["haiku", "green"],
  ["sonnet", "cyan"],
  ["opus", "magenta"],
  ["fable", "yellow"],
]);

/** How an agent's turn ended, said as the pane says it. */
export const OUTCOME_WORD: Readonly<Record<string, string>> = {
  answer: "done",
  aborted: "stopped",
  refusal: "refused",
  error: "failed",
};

/** What each stage asks, when it is done, and where the loop goes next: the loop of the instructions. */
const GUIDE: Record<Stage, { asks: string; done: string; next: Stage }> = {
  LOAD: {
    asks: "read the notes for this tree, the ready tasks and the spec that governs the change; search past sessions before asking twice",
    done: "you know what was decided and what is open",
    next: "PLAN",
  },
  PLAN: {
    asks: "the six questions, a probe for what exists, the size: a fix goes to EXECUTE; an epic goes through grilling (intent, criteria), the split, and a spec per piece",
    done: "the person said yes to the epic, the split and the spec",
    next: "EXECUTE",
  },
  EXECUTE: {
    asks: "apply the spec change, claim the task, delegate and take the work back",
    done: "the change is in and the run that proves it is ready",
    next: "VERIFY",
  },
  VERIFY: {
    asks: "run the real path end to end; lint and typecheck; a skill passes its eval",
    done: "you read the output and it holds; a failure goes back to EXECUTE",
    next: "LEARN",
  },
  LEARN: {
    asks: "a rule found into its instruction file or skill, a tool defect into a task, a decision's reason into the spec design or the commit",
    done: "nothing learned is left only in the chat",
    next: "CLOSE",
  },
  CLOSE: {
    asks: "spec-archive closes the change's task; the epic closes when every task is done, its criteria hold, test-it passed and the work is pushed after review; a note when work stays open",
    done: "the task is closed or the note is written",
    next: "LOAD",
  },
};

export function isStage(value: unknown): value is Stage {
  return typeof value === "string" && (STAGES as string[]).includes(value);
}

/** The tier word of a model alias or id (`claude-sonnet-5-5` is sonnet), else the model itself. */
export function tierOf(model: string): string {
  return Object.keys(TIER_COLOR).find((tier) => model.includes(tier)) ?? model;
}

/** What the stage tool answers: the stage's ask, its done test, and the next stage. */
export function guideText(stage: Stage): string {
  const { asks, done, next } = GUIDE[stage];
  return `${stage}. Asks: ${asks}. Done when: ${done}. Next: ${next}; call stage again when you move, back to EXECUTE included.`;
}

/** The one line every prompt carries, so the main chat always knows where it stands. */
export function reminderText(step: StageStep | undefined, now: number): string {
  if (step === undefined) {
    return "qsm stage: not said yet. Call the stage tool with the stage you start in.";
  }
  const note = step.why === "" ? "" : `, ${step.why}`;
  return `qsm stage: ${step.stage} (${seconds(now - step.at)}${note}); next ${GUIDE[step.stage].next}. Call the stage tool when you move.`;
}

/** A duration said short: `42s`, `3m05s`. */
export function seconds(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

/** The column the current stage starts at in the stage line (` LOAD ›` is seven), so its note sits under it. */
export function offsetOf(current: Stage | undefined): number {
  const at = current === undefined ? 0 : STAGES.indexOf(current);
  return STAGES.slice(0, at).reduce((sum, stage) => sum + stage.length + 3, 0) + 1;
}

/** A path said by its last part, anything else as it is. */
function shortArg(value: string): string {
  return value.includes("/") && !value.includes(" ") ? (value.split("/").pop() ?? value) : value;
}

/** A tool call said short, as the state of whoever made it: `Bash sleep 30`, `Edit register.tsx`. */
export function doingOf(tool: string, args: Record<string, unknown>): string {
  const pick = ["command", "file_path", "pattern", "skill", "description", "url", "query"]
    .map((key) => args[key])
    .find((value): value is string => typeof value === "string");
  const name = tool.includes("__") ? (tool.split("__").pop() ?? tool) : tool;
  if (pick === undefined) {
    return name;
  }
  const short = tool === "Bash" ? bare(pick) : shortArg(pick);
  return `${name} ${short.replace(/\s+/g, " ").slice(0, 48)}`;
}

/**
 * A shell command without what only frames it: a leading `cd <dir> &&`, `set -o …;`, a wrapping
 * subshell, and trailing `2>&1`, `| tee …` or `> file`. `cd /tmp && (sleep 30 && echo done) 2>&1 |
 * tee x.log` is `sleep 30 && echo done`.
 */
function bare(command: string): string {
  let rest = command.trim();
  for (let before = ""; before !== rest;) {
    before = rest;
    rest = rest
      .replace(/^cd\s+\S+\s*(&&|;)\s*/, "")
      .replace(/^set\s+[-+]\S+(\s+\S+)?\s*(&&|;)\s*/, "")
      .replace(/\s*\|\s*tee\s+\S+\s*$/, "")
      .replace(/\s*\d?>&\d\s*$/, "")
      .replace(/\s*\d?>>?\s*\S+\s*$/, "")
      .replace(/^\((.*)\)$/, "$1")
      .trim();
  }
  return rest;
}

/** The decisions one AskUserQuestion call made: each question it asked that has an answer. */
export function decisionsOf(
  args: Record<string, unknown>,
  result: unknown,
  ask: string,
  at: number,
): Decision[] {
  const answers = (result as { answers?: Record<string, unknown> }).answers ?? {};
  const asked = Array.isArray(args.questions) ? (args.questions as { question: string }[]) : [];
  return asked.flatMap(({ question }) => {
    const answer = answers[question];
    return typeof answer === "string" ? [{ ask, question, answer, at }] : [];
  });
}

/** The task ids a shell command closes with `br close`. */
export function closedIds(command: string): string[] {
  return [...command.matchAll(/\bbr close\s+([\w.-]+(?:\s+[\w.-]+)*)/g)]
    .flatMap((match) => (match[1] ?? "").split(/\s+/))
    .filter((id) => /^[a-z]+-\w/.test(id));
}

/** A typed prompt said as the title of its decisions. */
export function askTitle(text: string): string {
  return text.trim().replace(/\s+/g, " ").slice(0, 200);
}
