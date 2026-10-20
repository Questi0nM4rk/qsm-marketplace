# qsm-opencode Specification

## Purpose

Let Claude Code supervise a bounded OpenCode V2 worker without making OpenCode the canonical
harness or duplicating the marketplace's content, and let a temporary OpenCode session select
the models of its registered agents.

## Requirements

### Requirement: The skill stays a Claude-side skill under OpenCode

The driving-opencode skill SHALL carry `metadata.opencode/autoinvoke: false`, so an OpenCode model
is not offered a skill about supervising an OpenCode worker, while the skill stays loadable by its
ID and Claude Code still offers it by description. The plugin README SHALL point the reader at the
setup plugin's OpenCode mapping and SHALL carry no machine path.

#### Scenario: An OpenCode session lists its skills

- **WHEN** an OpenCode session in the marketplace asks which skills it has
- **THEN** driving-opencode is not offered, and the marketplace's other skills are

#### Scenario: A consumer reads how the marketplace maps

- **WHEN** a consumer reads the plugin README
- **THEN** it names the setup plugin's README as the place that holds the mapping, and it carries no
  machine path

### Requirement: Explicit, bounded worker handoff

The driving-opencode skill SHALL require an objective, workspace, scope, acceptance check and
explicit provider/model selection. An editing worker SHALL use an isolated workspace. Native
Claude Code subagent work SHALL remain outside this skill's responsibility. The skill SHALL use
the installed OpenCode V2 help and V2 documentation, not V1 flags or guessed model aliases.

#### Scenario: An editing task goes to an external worker

- **WHEN** the person asks Claude Code to hand a bounded implementation to OpenCode
- **THEN** the supervisor supplies the task contract and isolated workspace, resolves the model
  and captures the worker's output without giving it authority over unrelated files

### Requirement: Execution mode matches the handoff

One-shot tasks SHALL use headless execution with a durable output log. Interactive tasks the
person wants to watch SHALL use a uniquely named tmux session. Continuation SHALL name the
worker's actual OpenCode session ID; the supervisor SHALL NOT use the last unrelated session.
Auto-approval SHALL NOT be enabled unless the person explicitly authorizes it.

#### Scenario: A one-shot answer

- **WHEN** the person requests one answer from an OpenCode worker
- **THEN** the supervisor uses opencode run rather than starting an unattended interactive TUI

#### Scenario: An existing worker needs another instruction

- **WHEN** the supervisor continues a worker
- **THEN** it uses that worker's recorded session ID and retains its workspace and model

### Requirement: Take back and cleanup

The supervisor SHALL distinguish process exit, worker claims and independently verified
acceptance. It SHALL inspect editing results and integrate accepted work before presenting it.
It SHALL clean up only its own worker processes and tmux sessions, and SHALL preserve logs until
the result is reviewed. Credentials and unrelated OpenCode sessions SHALL remain untouched.

#### Scenario: The worker claims success but the check fails

- **WHEN** the worker exits successfully but its acceptance check fails
- **THEN** the supervisor reports the failure and does not present the task as complete

### Requirement: Model discovery is immediate and live

The driving-opencode skill SHALL include a compact model-reference and variant table so a
supervisor can see candidate IDs when loading the skill. It SHALL distinguish that quick index
from account-specific availability and require the worker's live server and location catalog
before launch. It SHALL NOT infer cost, speed or authorization from a model name.

The runtime qsm_agent_model tool SHALL support models, returning a Markdown table from the live
model registry with enabled provider/model IDs, supported variants, tool support and context
limits. An optional provider filter SHALL use the exact provider ID. An empty result SHALL say
that no enabled models matched, not invent a fallback. Discovery SHALL NOT alter overrides,
agents, sessions or configuration. Credentials and quota remain prerequisites, not guarantees
made by the table.

#### Scenario: A supervisor needs candidate model names

- **WHEN** it loads driving-opencode
- **THEN** the quick table and the complete live discovery route SHALL be available in the skill

#### Scenario: Provider availability changes

- **WHEN** models is called after the live registry changes
- **THEN** the table SHALL reflect enabled models from that registry, not a saved inventory

### Requirement: Runtime model selection covers the entire agent registry

The optional OpenCode V2 runtime plugin SHALL expose qsm_agent_model with models, list, set and
reset. It SHALL discover agents from the live registry rather than a fixed qsm agent allowlist, so
every registered marketplace agent and later registrations are addressable by exact ID. A set SHALL
validate the provider, model, enabled state and optional variant against the live model registry
before updating the agent definition through an agent transform. Reset SHALL remove only this
plugin's override, revealing the underlying definition or model inheritance. Overrides SHALL be
local to the plugin instance, SHALL NOT edit configuration files, and SHALL disappear on unload.
Agent system text, permissions and other properties SHALL remain unchanged. Existing sessions SHALL
retain their selected models; overrides affect subsequent agent dispatches.

#### Scenario: Every marketplace agent can receive an override

- **WHEN** the caller enumerates registered marketplace agents and sets an available model on each
- **THEN** list and subsequent agent reads SHALL show that model for every one, with no special
  case for the plugin that owns the agent

#### Scenario: An agent appears after plugin startup

- **WHEN** OpenCode registers another agent after this runtime plugin starts
- **THEN** list and set SHALL work for that agent without changing an allowlist or restarting the
  model-control plugin

#### Scenario: An invalid target cannot silently succeed

- **WHEN** set names an absent agent, disabled model or unknown variant
- **THEN** the tool SHALL fail with the target named, leaving prior overrides unchanged

#### Scenario: Reset restores the original model

- **WHEN** reset removes an override
- **THEN** the agent SHALL regain the underlying model, including inherited selection when the
  original definition had no explicit model
