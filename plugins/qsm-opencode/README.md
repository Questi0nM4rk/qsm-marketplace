# qsm-opencode

## Why it exists

Claude Code is the main harness, but a bounded task can sometimes be handed to an OpenCode
worker without moving the whole session there. qsm-opencode exists to keep that handoff scoped,
observable and reviewable by the agent that owns the work. It treats the worker's answer as a
claim to check, not acceptance. It is not an OpenCode configuration manager or a second copy of
this marketplace, and has no reason to exist when native subagents cover the task.

## What it ships

One skill, `driving-opencode`, for starting, supervising and taking back an OpenCode V2 worker.
One-shot work uses `opencode run`; an interactive worker the person wants to watch uses tmux.
It ships no binary or Claude hook. An optional OpenCode V2 runtime plugin exposes
`qsm_agent_model`: show the live models table, list registered agents, set a model and variant for
any exact agent ID, or
reset this plugin's override. Its targets come from the live registry, not a list of qsm names.
Claude agent files still need thin OpenCode subagent definitions pointing to their canonical bodies;
the tool controls every registered agent but does not import new Claude agents itself.

## Install

```sh
claude plugin install qsm-opencode@qsm-marketplace
```

OpenCode V2 must already be on PATH; tmux is needed only for interactive work. The skill does
not install either or change the person's OpenCode configuration.

An OpenCode consumer that wants the whole marketplace's skills points the `skills` config entry
at the marketplace's `plugins/` directory; every skill then loads from its canonical file:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "skills": ["/path/to/qsm-marketplace/plugins"]
}
```

For runtime model control, install this directory's dependencies with Bun and add its `opencode/`
directory to `plugins` in OpenCode's configuration. This is separate from installing the Claude
skill:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/path/to/qsm-marketplace/plugins/qsm-opencode/opencode"]
}
```

## The marketplace under OpenCode V2

OpenCode has no Claude Code marketplace, so every kind of content needs its own door: the skills
come from one `skills` entry, and every agent needs a thin wrapper that names its canonical body.
The setup plugin's README holds that mapping, with what does not port: `AGENTS.md` is the only
instruction file V2 reads, and Claude hooks do not run.

A skill that only makes sense in Claude Code says so in its own frontmatter:
`metadata.opencode/autoinvoke: false` keeps it out of an OpenCode model's skill list and leaves it
loadable by ID. The `driving-opencode` skill carries it: it is a Claude-side skill about
supervising an OpenCode worker, not an OpenCode-side one.

## Use

Ask Claude Code: “delegate this bounded task to OpenCode”, “spawn OpenCode in tmux”, or
“continue the OpenCode worker”. Choose the worker's model explicitly and give an editing worker
its own workspace. Claude Code reviews and integrates the result before presenting it.

The skill includes a quick model/variant table. In OpenCode, `qsm_agent_model` with
`{ "action": "models" }` returns the live table across all enabled providers; add
`"provider": "openai"` to filter it. From Claude, use `opencode models` or the model API
against the worker's server and workspace. Model discovery changes no agent or session.

## Caveats

- This is external worker supervision, not native subagent dispatch.
- The worker needs its own provider credentials. They are never copied into its prompt or log.
- A successful process exit does not prove the task passed its acceptance check.
- Model overrides are local to the OpenCode plugin instance and disappear on unload; reset
  reveals the original model or inheritance. They affect future agent dispatches, not the models
  already stored on existing sessions. No Claude hooks, credentials or permissions are ported.
- OpenCode V2 documentation: <https://opencode.ai/v2/docs/cli>.
