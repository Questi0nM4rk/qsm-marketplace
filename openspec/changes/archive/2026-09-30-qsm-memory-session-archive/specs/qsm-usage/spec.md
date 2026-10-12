## MODIFIED Requirements

### Requirement: Topics are separate skills that run alone or inside a review

Each topic SHALL be one skill that answers its own question when the user asks only that
question, and that returns findings in the findings format when a review dispatches it.

| Skill | Finds | Standard | Deep |
| --- | --- | --- | --- |
| `session-usage` | where the current session's tokens went, grouped by source and weighted by cost | | yes |
| `unused-extensions` | every MCP server, skill, plugin, agent, and command with its uses in the window and its resident cost | yes | yes |
| `duplicates` | the same guidance, capability, or definition in two places | yes | yes |
| `claude-md-trim` | lines a session could derive from the code, and always-loaded guidance that could load lazily | yes | yes |
| `hooks-review` | hooks that are slow, time out, or inject text no later turn uses | yes | yes |
| `permissions-tune` | auto mode as the default mode, and exact allow rules for read-only calls that keep prompting | yes | yes |
| `insights` | recurring friction, prompting mistakes, and instructions the user gave in two or more sessions | | yes |
| `tools-review` | work done the long way that a qsm tool or a cataloged tool does in fewer tokens | | yes |

A deep review SHALL run every topic skill of this plugin.

#### Scenario: A single question

- **WHEN** the user asks only which hooks slow their sessions down
- **THEN** `hooks-review` answers in the reply, and no level question or report runs

#### Scenario: A deep review

- **WHEN** a deep review runs
- **THEN** all eight topics return findings and the report has one section per topic
