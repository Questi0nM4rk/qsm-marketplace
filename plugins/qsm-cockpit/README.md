# qsm-cockpit

The loop at a glance for one developer who runs several agents at once: which step the main chat is
in, which agents run on which model, and what was decided.

## Why it exists

A session that runs a loop of steps and several agents at once hides both in a scrolling
transcript, so the person cannot tell at a glance where the work stands or which model each agent
spends. This plug-in makes the step something the agent says out loud and the person sees, instead
of something inferred from its tool calls and guessed wrong. It refuses to judge the work or to
move the loop by itself; it only shows what the agent and its agents report. It would have no
reason to exist if the harness showed the step and each agent's model in its own interface.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Tool | `stage` | The agent says its step (LOAD, PLAN, EXECUTE, VERIFY, LEARN, CLOSE) and a few words; the answer is what the step asks and the next one |
| Band | above the prompt | The six steps with the current one on a blue chip, what the chat does there, and every running agent on a chip in its tier's colour (haiku green, sonnet cyan, opus magenta, fable yellow) with the command it runs now |
| Pane | `/cockpit` | Cards for the chat, the agents (finished ones behind a dropdown), the claimed tasks, and the decisions grouped under the prompt they answered |
| Context | every prompt | One line: the step the chat said, how long ago, and the next step |

## Install

```bash
claude plugin install qsm-cockpit@qsm-marketplace
```

Install brings `qsm-tasks` with it, because the Tasks card reads the claimed tasks from the task
tool.

## Use

- The agent calls `stage` each time it enters a step, back to EXECUTE after a failed VERIFY
  included. The loop in the instructions says so.
- Type `/cockpit` to open the pane. It shows the whole session since the plug-in loaded, whether
  the pane was open or not.

## Caveats

- The step is what the agent said. An agent that never calls `stage` leaves the band on "not said".
- The Tasks card asks the task tool for the claimed tasks in the session's directory. A directory
  without a tracker leaves the card as it was and logs why. A task an agent closes shows only after
  the main chat runs a task-tool command.
- A subagent's `stage` call moves its own row, never the chat's step.
