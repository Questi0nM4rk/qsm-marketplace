# qsm-essentials

The core method for an agent working beside a senior programmer: ten skills and four agents for
design, testing, debugging, delegation and more.

## Why it exists

Without a shared method, every session relearns how this person works: it builds before it
understands, settles design by default, forgets what an earlier session decided, and either does
everything itself or hands everything away. qsm-essentials is that method: the thinking of a senior
programmer about a real problem, written as skills and bounded agents an agent applies, not as a
summary a plain model already knows. It takes the stance that a skill earns its place only when the
agent works measurably better with it than without. It refuses to hold anything specific to a
language, a framework, a project or a machine, and refuses to restate what a plain model does well.
When the harness ships this method itself, or a plain model matches it, this plugin has no reason
to exist.

## What you get

| Kind | Name | What it does |
| --- | --- | --- |
| Skill | `debugging` | Finds the root cause of a bug or a flaky test before any fix is tried |
| Skill | `distributed-systems` | Service boundaries, sync or async, data ownership, failure across a network |
| Skill | `domain-modeling` | Entities, values, aggregates and where a business rule lives |
| Skill | `refactoring` | Changes structure without changing behaviour, in steps that each stay working |
| Skill | `run-and-verify` | Starts the project and proves a change works before anyone says it does |
| Skill | `software-architecture` | Picks an architecture style, weighs trade-offs, records the decision |
| Skill | `software-design` | Cuts modules, shapes interfaces and types, decides where complexity lives |
| Skill | `software-testing` | Decides if a change needs a test and picks the cheapest one that runs the real path |
| Skill | `subagents` | Writes the task for an agent, splits work, accepts what comes back |
| Skill | `writing` | Commit messages, tickets, review replies, READMEs, error messages |
| Agent | `researcher` | Answers where, what and how over a code tree, with file and line citations |
| Agent | `runner` | Runs one noisy command, keeps the log, returns a short briefing |
| Agent | `implementer` | Builds one bounded task in its own worktree and proves it end to end |
| Agent | `web-research` | Answers one question from the web in at most five rounds, with sources |

## Install

```bash
claude plugin install qsm-essentials@qsm-marketplace
```

Install adds the skills and agents only. It has no binary and no dependency.

The `web-research` agent is the default for the web-research role. A plug-in that ships its own
agent of that name replaces it, and the role is that agent's; the
core one is the one to use when no plug-in does.

## Use

Skills fire on the kind of ask, so there is nothing to call.

- ask: "why does this test fail only on CI?" loads `debugging`.
- ask: "should this be its own service?" loads `distributed-systems`.
- ask: "write the commit message for this" loads `writing`.
- ask: "hand these three tasks to agents" loads `subagents`, which then picks `implementer`,
  `researcher` or `runner` for each.

## Caveats

- No language idioms and no project or machine facts. Those live in other plug-ins.
- The core names no other plug-in. A tool the skills mention, such as a code index or web search,
  is used by role when one is installed.
- Every agent must name its model: a hook refuses an Agent call, a workflow agent or a plugin's
  spawn without one (a fork excepted), puts the tier in front of the description (`[sonnet]
  researcher: …`), and draws the tier in colour before the Agent row in the transcript.
