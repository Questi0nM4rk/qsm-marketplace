// qsm-cockpit's function-hooks module: the stage tool, the hooks that record the session into its
// state, a band above the prompt, and the /cockpit pane. The rules are lib/cockpit.ts; the hooks
// only record and draw.
import type { EngineInterface, On, Register, RenderChildren } from "claude-code";
import { atom, read, update } from "claude-code";
import {
  askTitle,
  closedIds,
  decisionsOf,
  doingOf,
  guideText,
  isStage,
  OUTCOME_WORD,
  offsetOf,
  reminderText,
  STAGES,
  seconds,
  TIER_COLOR,
  tasksOf,
  tierOf,
} from "../lib/cockpit.ts";
import type { AgentRun, Stage, StageStep } from "../types/state.d.ts";
import { failure, registerNoun } from "./noun.generated.ts";

const PANE = "qsm-cockpit";
const STAGE_TOOL = "mcp__qsm-cockpit__stage";
const steps = atom({ plugin: "qsm-cockpit", key: "steps" } as const, []);
const agents = atom({ plugin: "qsm-cockpit", key: "runs" } as const, []);
const decisions = atom({ plugin: "qsm-cockpit", key: "answers" } as const, []);
const currentAsk = atom({ plugin: "qsm-cockpit", key: "currentAsk" } as const, "");
const openAsks = atom({ plugin: "qsm-cockpit", key: "openAsks" } as const, []);
const tasks = atom({ plugin: "qsm-cockpit", key: "tasks" } as const, []);
const closed = atom({ plugin: "qsm-cockpit", key: "closed" } as const, []);
const isMainWorking = atom({ plugin: "qsm-cockpit", key: "isMainWorking" } as const, false);
const isShowingDone = atom({ plugin: "qsm-cockpit", key: "isShowingDone" } as const, false);

type Elements = ReturnType<EngineInterface["ui"]["resolve"]>;

export const register: Register = (on) => {
  registerNoun(on);
  registerStage(on);
  registerRecords(on);
  registerAgents(on);
  registerBand(on);
  registerPane(on);
};

/** The main chat enters a stage; saying the same stage again only renames what it does there. */
async function enter($: EngineInterface, stage: Stage, why: string): Promise<void> {
  const at = await $.clock.now();
  await update($, steps, (list) => {
    const last = list.at(-1);
    if (last?.stage === stage) {
      return [...list.slice(0, -1), { ...last, why }];
    }
    const step: StageStep = { stage, why, at };
    return [...list, step].slice(-50);
  });
}

async function refreshTasks($: EngineInterface): Promise<void> {
  const list = tasksOf(await $.cockpit.tasks());
  await update($, tasks, () => list);
}

function refreshLater($: EngineInterface): void {
  refreshTasks($).catch((error) => {
    failure($, "tasks", {
      kind: "throw",
      budget: 0,
      message: error instanceof Error ? error.message : String(error),
    });
  });
}

/** The stage tool, and the line every prompt carries about it. */
function registerStage(on: On): void {
  on("session.start", async ($, e, next) => {
    await $.command.register({ name: "cockpit", description: "Open the qsm cockpit pane" });
    await $.tool.register({
      name: "stage",
      isDeferred: false,
      description:
        "Say which stage of the qsm loop you are in, each time you enter one: LOAD (notes, ready tasks, the governing spec), PLAN (six questions, size, grilling, split, spec-propose), EXECUTE (apply, claim, delegate), VERIFY (the real path ran), LEARN (a rule, a feedback task, a decision reason), CLOSE (archive, push, a note). Call it again when you go back, as VERIFY failing to EXECUTE. It answers what the stage asks, when it is done, and the next stage; the person sees it in the cockpit.",
      inputSchema: {
        type: "object",
        properties: {
          stage: { type: "string", enum: STAGES },
          doing: {
            type: "string",
            description: 'What you do in it, a few words: "grilling the cockpit epic".',
          },
        },
        required: ["stage"],
      },
    });
    refreshLater($);
    return next(e);
  });

  // The caller says its stage: the main chat's moves the cockpit, an agent's only its own row.
  on("tool.call", { tool: STAGE_TOOL }, async ($, e) => {
    const stage = "stage" in e ? e.stage : undefined;
    const doing = "doing" in e ? e.doing : undefined;
    if (!isStage(stage)) {
      return {
        result: `stage must be one of ${STAGES.join(", ")}; got ${String(stage)}`,
        isError: true,
      };
    }
    const id = e.agentId;
    if (id === undefined) {
      await enter($, stage, typeof doing === "string" ? doing.slice(0, 60) : "");
    } else {
      await update($, agents, (list) =>
        list.map((run) => (run.id === id ? { ...run, stage } : run)),
      );
    }
    return { result: guideText(stage) };
  });

  on("prompt.submit", async ($, e, next) => {
    const line = reminderText((await read($, steps)).at(-1), await $.clock.now());
    // A typed prompt is the ask the next decisions answer to.
    if (e.origin.kind === "composer" && e.text.trim() !== "") {
      await update($, currentAsk, () => askTitle(e.text));
    }
    return next({ ...e, context: [...(e.context ?? []), line] });
  })
    // a reminder that fails never holds the prompt
    .catch(($, e, next) => {
      failure($, "prompt.submit", next.error);
      return next(e);
    });
}

/** What an agent runs now: set before its call, back to thinking after it. */
async function agentCall<T>(
  $: EngineInterface,
  id: string,
  doing: string,
  run: () => Promise<T>,
): Promise<T> {
  await update($, agents, (list) => list.map((one) => (one.id === id ? { ...one, doing } : one)));
  try {
    return await run();
  } finally {
    await update($, agents, (list) =>
      list.map((one) =>
        one.id === id && one.doing === doing ? { ...one, doing: "thinking" } : one,
      ),
    );
  }
}

/** Everything the band and the pane read, recorded as it happens whether the pane is open or not. */
function registerRecords(on: On): void {
  on("tool.call", async ($, e, next) => {
    const args: Record<string, unknown> = e;
    if (e.agentId !== undefined) {
      return agentCall($, e.agentId, doingOf(e.tool, args), () => next(e));
    }
    const result = await next(e);
    if (e.tool === "AskUserQuestion" && result.result !== undefined) {
      const [ask, at] = await Promise.all([read($, currentAsk), $.clock.now()]);
      const picked = decisionsOf(args, result.result, ask, at);
      await update($, decisions, (list) => [...list, ...picked].slice(-60));
    }
    if (e.tool === "Bash" && typeof args.command === "string" && /\bbr\b/.test(args.command)) {
      const ids = closedIds(args.command);
      await update($, closed, (list) => [...list, ...ids]);
      refreshLater($);
    }
    return result;
  })
    // an observer never blocks a call
    .catch(($, e, next) => {
      failure($, "tool.call", next.error);
      return next(e);
    });
}

/** Every agent the session starts, and how and when its turn ends; the main chat's turn too. */
function registerAgents(on: On): void {
  on("agent.spawn", async ($, e, next) => {
    const started = await next(e);
    if (started.agentId === undefined) {
      return started;
    }
    const model = e.fork ? e.parentModel : started.model;
    const run: AgentRun = {
      id: started.agentId,
      tier: tierOf(model),
      model,
      description: e.description,
      kind: e.fork ? "fork" : e.subagentType,
      startedAt: await $.clock.now(),
      tookMs: null,
      outcome: "running",
      doing: "starting",
    };
    await update($, agents, (list) => [...list, run].slice(-100));
    return started;
  }).catch(($, e, next) => {
    failure($, "agent.spawn", next.error);
    return next(e);
  });

  on("turn.start", async ($, e, next) => {
    // Only the main chat's turn starts from a prompt.
    await update($, isMainWorking, () => true);
    return next(e);
  });

  on("turn.complete", async ($, e, next) => {
    const id = e.agentId;
    if (id === undefined) {
      await update($, isMainWorking, () => false);
    } else {
      await update($, agents, (list) =>
        list.map((run) =>
          run.id === id && run.tookMs === null
            ? { ...run, tookMs: e.durationMs, outcome: e.reason }
            : run,
        ),
      );
    }
    return next(e);
  });
}

/** The six stages in one line: the current one on a blue chip, the reached ones plain, the rest dim. */
function stageLine(Text: Elements["Text"], current: Stage | undefined, reached: Set<Stage>) {
  return STAGES.flatMap((stage, i) => [
    ...(i === 0
      ? []
      : [
          <Text key={`s${i}`} dimColor>
            ›
          </Text>,
        ]),
    stage === current ? (
      <Text key={stage} backgroundColor="blue" color="white" weight="semibold">{` ${stage} `}</Text>
    ) : (
      <Text key={stage} dimColor={!reached.has(stage)}>{` ${stage} `}</Text>
    ),
  ]);
}

function tierChip(Text: Elements["Text"], run: AgentRun) {
  return (
    <Text backgroundColor={TIER_COLOR[run.tier] ?? "gray"} color="black" weight="semibold">
      {` ${run.tier} `}
    </Text>
  );
}

/** What a running agent does: its stage when it said one, its command, and how long it has run. */
function agentState(run: AgentRun, now: number): string {
  const stage = run.stage === undefined ? "" : `${run.stage} · `;
  return `${stage}${run.doing} · ${seconds(now - run.startedAt)}`;
}

/** The dot that says whether the agent is working now. */
function workingDot(Text: Elements["Text"], isWorking: boolean) {
  return (
    <Text color={isWorking ? "blue" : undefined} dimColor={!isWorking} weight="semibold">
      {isWorking ? "● " : "○ "}
    </Text>
  );
}

function registerBand(on: On): void {
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const [history, all, claimed] = await Promise.all([
      read($, steps),
      read($, agents),
      read($, tasks),
    ]);
    if (e.props.hasSurvey || (history.length === 0 && all.length === 0)) {
      return next(e);
    }
    const { Box, Text } = $.ui.resolve(e);
    const now = await $.clock.now();
    const last = history.at(-1);
    const running = all.filter((run) => run.outcome === "running");
    const room = Math.max(1, e.props.maxRows - 2);
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          {workingDot(Text, e.props.isWorking)}
          {stageLine(Text, last?.stage, new Set(history.map((step) => step.stage)))}
          {claimed[0] !== undefined && <Text dimColor>{`  ${claimed[0].id}`}</Text>}
        </Box>
        {last !== undefined && last.why !== "" && (
          <Text wrap="truncate-end">{`${" ".repeat(2 + offsetOf(last.stage))}└ ${last.why}`}</Text>
        )}
        {running.slice(0, room).map((run) => (
          // One Text per row: a chip beside a Text in a row Box takes the row's height and spills.
          <Text key={run.id} wrap="truncate-end">
            {tierChip(Text, run)}
            {` ${run.description} `}
            <Text dimColor>{agentState(run, now)}</Text>
          </Text>
        ))}
        {running.length > room && <Text dimColor>{`+${running.length - room} more running`}</Text>}
      </Box>
    );
  });
}

function card(els: Elements, title: string, note: string, body: RenderChildren) {
  const { Box, Text } = els;
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      borderDimColor
      paddingX={1}
      marginBottom={1}
    >
      <Text>
        <Text weight="semibold">{title}</Text>
        <Text dimColor>{note === "" ? "" : `  ${note}`}</Text>
      </Text>
      {body}
    </Box>
  );
}

async function chatCard($: EngineInterface, els: Elements) {
  const { Box, Text } = els;
  const [history, isWorking] = await Promise.all([read($, steps), read($, isMainWorking)]);
  const last = history.at(-1);
  return card(
    els,
    "Chat",
    isWorking ? "● working" : "○ idle",
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        {stageLine(Text, last?.stage, new Set(history.map((step) => step.stage)))}
      </Box>
      {last === undefined && <Text dimColor>not said yet: the agent calls the stage tool</Text>}
      {last !== undefined && last.why !== "" && (
        <Text wrap="truncate-end">
          <Text dimColor>{`${" ".repeat(offsetOf(last.stage))}└ `}</Text>
          <Text color="blue">{last.why}</Text>
        </Text>
      )}
    </Box>,
  );
}

async function agentsCard($: EngineInterface, els: Elements) {
  const { Box, Button, Text } = els;
  const [all, isOpen, now] = await Promise.all([
    read($, agents),
    read($, isShowingDone),
    $.clock.now(),
  ]);
  const running = all.filter((run) => run.outcome === "running");
  const finished = all
    .filter((run) => run.outcome !== "running")
    .toReversed()
    .slice(0, 12);
  return card(
    els,
    "Agents",
    `${running.length} running`,
    <Box flexDirection="column">
      {running.length === 0 && <Text dimColor>none running</Text>}
      {running.map((run) => (
        <Box key={run.id} flexDirection="column">
          <Text wrap="truncate-end">
            {tierChip(Text, run)}
            {` ${run.description}`}
          </Text>
          <Text
            dimColor
            wrap="truncate-end"
          >{`${" ".repeat(run.tier.length + 2)}└ ${agentState(run, now)}`}</Text>
        </Box>
      ))}
      {finished.length > 0 && (
        <Button
          key="done"
          label={`${isOpen ? "▾" : "▸"} ${all.length - running.length} finished`}
          onPress={() => update($, isShowingDone, (shown) => !shown)}
        />
      )}
      {isOpen &&
        finished.map((run) => (
          <Text key={run.id} dimColor wrap="truncate-end">
            {`${run.tier.padEnd(6)} ${(OUTCOME_WORD[run.outcome] ?? run.outcome).padEnd(7)} ${seconds(run.tookMs ?? 0).padStart(6)}  ${run.description}`}
          </Text>
        ))}
    </Box>,
  );
}

async function tasksCard($: EngineInterface, els: Elements) {
  const { Box, Text } = els;
  const [claimed, done] = await Promise.all([read($, tasks), read($, closed)]);
  return card(
    els,
    "Tasks",
    done.length === 0 ? "" : `${done.length} closed this session`,
    <Box flexDirection="column">
      {claimed.length === 0 && <Text dimColor>none claimed</Text>}
      {claimed.map((task) => (
        <Text key={task.id} wrap="truncate-end">
          <Text color="blue">{task.id}</Text>
          {` ${task.title}`}
        </Text>
      ))}
    </Box>,
  );
}

/** Decisions grouped under the typed ask they answered, in the order the asks came, each a dropdown. */
async function decisionsCard($: EngineInterface, els: Elements) {
  const { Box, Button, Text } = els;
  const [picked, open] = await Promise.all([read($, decisions), read($, openAsks)]);
  const asks = [...new Set(picked.map((decision) => decision.ask))];
  const toggle = (ask: string) =>
    update($, openAsks, (list) =>
      list.includes(ask) ? list.filter((one) => one !== ask) : [...list, ask],
    );
  return card(
    els,
    "Decisions",
    "",
    <Box flexDirection="column">
      {asks.length === 0 && <Text dimColor>no question answered yet</Text>}
      {asks.map((ask, i) => {
        const answers = picked.filter((decision) => decision.ask === ask);
        const isOpen = open.includes(ask);
        return (
          <Box key={`ask${i}`} flexDirection="column">
            <Button
              key={`ask:${i}`}
              label={`${isOpen ? "▾" : "▸"} ${ask === "" ? "before the first prompt" : ask}  (${answers.length})`}
              onPress={() => toggle(ask)}
            />
            {isOpen &&
              answers.map((decision) => (
                <Text key={`${decision.at}-${decision.question}`} wrap="truncate-end">
                  <Text dimColor>{`  ${decision.question} `}</Text>
                  {decision.answer}
                </Text>
              ))}
          </Box>
        );
      })}
    </Box>,
  );
}

function registerPane(on: On): void {
  on("command.run", { command: "cockpit" }, async ($) => {
    await $.ui.open({ id: PANE, title: "qsm cockpit" });
    return { text: "qsm cockpit opened." };
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e);
    const cards = await Promise.all([
      chatCard($, els),
      agentsCard($, els),
      tasksCard($, els),
      decisionsCard($, els),
    ]);
    return <els.Box flexDirection="column">{cards}</els.Box>;
  });
}
