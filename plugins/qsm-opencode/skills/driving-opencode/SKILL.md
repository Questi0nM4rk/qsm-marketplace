---
name: driving-opencode
description: "Use when Claude Code hands a bounded task to an external OpenCode V2 worker and supervises it: delegate this to OpenCode, run OpenCode on X, spawn OpenCode in tmux, monitor the OpenCode worker, continue the OpenCode session, or list available OpenCode worker models and variants. Covers the model table, headless one-shot work and interactive workers the person can watch. Native Claude Code subagents belong to the subagents skill; configuring OpenCode itself is outside this skill."
metadata:
  opencode/autoinvoke: false
---

# Driving OpenCode

Claude Code owns the task; OpenCode is a temporary worker. This skill keeps the external handoff
bounded and observable, then brings the result back for review. The worker has none of the
conversation and its answer is a claim, not acceptance. It does not install OpenCode, port Claude
hooks, manage the marketplace, or replace native Claude Code subagents.

## Prepare the handoff

1. Give the worker an objective, workspace, permitted paths, forbidden changes, acceptance check
   and expected briefing. Put any constraint it needs in the task itself: it cannot read your
   conversation. A design decision still open stays with the person, not the worker.
2. Give an editing worker an isolated workspace through the project's worktree route. Record its
   branch and base before launch, because two agents writing one tree can overwrite each other.
   Read-only research can use the target tree. Do not invent a second worktree mechanism.
3. Use the model table below, then resolve the person's explicit provider/model and variant against
   the live catalog.
   Missing model selection is a question, not permission to choose a cheap alias. Do not change
   global model defaults to select one worker.
4. Read `opencode --version` and the relevant installed help. Use only V2 documentation:
   <https://opencode.ai/v2/docs/cli> and <https://opencode.ai/v2/docs/api>. V1 `--attach`, `--dir`
   and a separate `--variant` are not the V2 route; the process's working directory is the workspace
   and the model reference is `provider/model#variant`.

## OpenCode models

These exact OpenAI model IDs are starting points, not an account-specific allowlist. The live
catalog decides availability; a listed model still needs its provider connection and quota.

| Model reference | Supported variants |
| --- | --- |
| `openai/gpt-6.1-sol` | `low`, `medium`, `high`, `xhigh`, `max` |
| `openai/gpt-6-luna` | `none`, `low`, `medium`, `high`, `xhigh`, `max` |
| `openai/gpt-6-astra` | `low`, `medium`, `high`, `xhigh`, `max` |
| `openai/gpt-5.6-terra` | `none`, `low`, `medium`, `high`, `xhigh`, `max` |
| `openai/gpt-5.5` | `none`, `low`, `medium`, `high`, `xhigh` |
| `openai/gpt-5.3-codex-spark` | `none`, `low`, `medium`, `high`, `xhigh` |

Append the selected variant as `#variant`, for example `openai/gpt-6-luna#medium`. Variants are
model-specific; `none` is an explicit variant, not the same as omitting the suffix. Do not infer
price or speed from a name, and do not treat missing price data as free. A model reference is
not permission to choose it without the person's selection.

For the complete current table, including other providers and older models:

- **Inside OpenCode with the runtime plugin:** call `qsm_agent_model` with
  `{ "action": "models" }`, or add `"provider": "openai"` to narrow the table. It reads the
  live registry and shows enabled model IDs, variants, tool support and context limits.
- **From Claude Code supervising a worker:** run `opencode models` from the worker's workspace.
  For variant and capability details use `opencode api get /api/model`; include the worker's
  `location[directory]` query when selecting a project-specific catalog. Follow the same server
  route as the worker; a catalog from a different server or directory is not its availability.

Recheck before launching or changing a worker when the table and the live catalog disagree.
Keep account-specific inventories out of the public plugin; the table above is only a quick index.

## Run and observe

For a one-shot task, run from the recorded workspace and capture stdout and stderr separately:

```sh
opencode run --model "$model" --title "$worker" --format json "$task" > "$log" 2> "$errors"
```

Keep the exit status and the actual OpenCode session ID reported by the run. Use the harness's
background execution when a task is long, rather than repeatedly waiting on the foreground
process. A unique worker name and log path distinguish its output from another concurrent run.
Logs may contain project content; keep them local and report paths, not a transcript dump.

For interactive work the person wants to watch, use a uniquely named tmux session, with its
working directory set to the recorded workspace. Create an OpenCode session and select its model
through the installed V2 API before opening `opencode --session <recorded-id>` in that pane: the
interactive CLI has no `--model` flag. Read the request schemas from the running server's
`/openapi.json`, and use `opencode api` so discovery and authentication stay with OpenCode. Give
the person the tmux attach command. Capture the owned pane only when it helps diagnose a stall;
do not mix another session's output into the briefing.

Continue headless work from the same workspace:

```sh
opencode run --session "$session" --model "$model" --format json "$followup" > "$nextLog" 2> "$nextErrors"
```

Name the actual session, never `--continue`: the most recent session may belong to unrelated
work. Do not add `--auto`, bypass permission prompts, copy credentials, or take over unrelated
sessions. A permission request stays visible to the person unless they explicitly authorized
automatic approval. Missing credentials are a blocker, not a reason to read token files.

## Take back

- Read the worker's briefing, log and diff. Separate its claim from what the process and the
  acceptance check actually show; exit 0 alone means only that the process succeeded.
- Run the named acceptance check when authorized by the task and project. If a project requires
  explicit permission for checks, leave them unverified until the person grants it. Never invent
  evidence or call an unverified result accepted.
- Review editing results and integrate accepted changes through the project's normal route
  before presenting them. Work left only in the worker's scratch tree is not delivered.
- Stop only the worker you started and close only its tmux session. Keep its logs and workspace
  until review is finished; remove your temporary workspace through the owning worktree tool.
  An interrupted or failed run returns its partial state, not a silent fresh restart.

## Red flags

- When a handoff names no model or acceptance check, fill the contract before starting: the
  worker otherwise decides cost or completion for the person.
- When the latest session looks convenient, use the recorded ID: recency is not ownership.
- When the worker says done but the check fails, report the failure: its confidence is not proof.
- When a native subagent is enough, use the subagents skill: an external harness adds a process,
  credentials and a second session to supervise.

## Say it in the reply

Name the workspace, selected model, worker session and log paths. State complete, blocked or
partial; distinguish worker-reported, independently verified and integrated work. For an
interactive worker include the tmux attach command and whether your worker is still running.
