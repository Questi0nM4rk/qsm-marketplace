## ADDED Requirements

### Requirement: Every skill and agent has cases that meet the eval bar

Every skill and every agent in the marketplace SHALL have, in its plugin's `evals/`, a case tagged
`fire` and a case tagged `scenario` that meet the eval bar, and every plugin SHALL have one case
tagged `negative`. A case meets the bar when every run with the plugin passed and at most one of
three runs without it passed (3/3 with, at most 1/3 without). A `negative` case meets the bar when
every run with the plugin passed, because its without arm passes by design.

A `scenario` case SHALL pose a problem with several steps and SHALL be graded on the agent's
thought process and output in one to three points that only the skill's rule decides. A grader
SHALL NOT require what the prompt does not make necessary, SHALL NOT match a phrase copied from
the skill text, and a regex grader SHALL be case-insensitive. When the sandbox lacks what the job
needs, the prompt SHALL say so to both arms and the grade SHALL fall on the agent's stated plan.

A case still below the bar after one re-run and two rewrites SHALL be reported in its plugin's
task with the measured counts, what the case tests, why it fails, and how it could be fixed. A
skill whose scenario still passes without the plugin after it was made harder SHALL be proposed
for removal.

#### Scenario: A scenario that needs the skill meets the bar

- **WHEN** a scenario case passes in 3 of 3 runs with the plugin and in 0 of 3 runs without it
- **THEN** the case meets the bar

#### Scenario: A scenario the model passes unaided is below the bar

- **WHEN** a scenario case passes in 3 of 3 runs with the plugin and in 2 of 3 runs without it
- **THEN** the case is below the bar, because the model already knows the answer

#### Scenario: A negative case meets the bar on the with arm alone

- **WHEN** a negative case passes in 3 of 3 runs with the plugin and in 3 of 3 runs without it
- **THEN** the case meets the bar

#### Scenario: A missing tool is graded as a plan

- **WHEN** a scenario needs the web and the prompt tells both arms there is no web
- **THEN** the grader judges what the agent says it would search and why, not a fetched result

### Requirement: The eval wrapper prints a bar verdict per case and never gates on it

`bun run eval <plugin>` SHALL run the eval with `--scaffold` and `--allow-tools Bash Write Edit`,
SHALL, after the run, read the run's `aggregate-result.json` and print one line per case,
`<case>: meets bar (with <n>/<runs>, without <n>/<runs>, turns <with> vs <without>)` or the same
with `below bar`, where turns is the mean per arm, followed by `<n>/<total> cases meet the bar`. A
run without the ablation arm SHALL print `without n/a` and judge the with arm alone. The wrapper's
exit code SHALL stay the eval's own, whatever the verdicts. A run that left no
`aggregate-result.json` SHALL print that no verdict could be read, and why.

#### Scenario: The wrapper prints a verdict for every case

- **WHEN** the person runs `bun run eval qsm-review` and the run finishes with five cases
- **THEN** the output ends with five verdict lines and `<n>/5 cases meet the bar`

#### Scenario: A case below the bar does not change the exit code

- **WHEN** one case is below the bar and the eval itself succeeded
- **THEN** the wrapper exits 0 and the case's line reads `below bar`

#### Scenario: A run that wrote no results says so

- **WHEN** the eval run fails before it writes `aggregate-result.json`
- **THEN** the wrapper prints that no verdict could be read and exits with the eval's code

#### Scenario: A scenario runs its seeded repository

- **WHEN** a case's `case.yaml` names a scaffold script that writes a small project
- **THEN** the agent finds the project in its workspace and can run it with Bash

### Requirement: Validation fails on a missing or malformed eval case

`bun run validate` SHALL fail, naming the file, when a skill or agent is missing a case tagged
`fire` or a case tagged `scenario`, when a plugin with skills or agents has no case tagged
`negative`, or when a regex grader is case-sensitive.

#### Scenario: A skill without a scenario fails validation

- **WHEN** a plugin adds a skill with a `fire` case and no `scenario` case
- **THEN** `bun run validate` fails and names the skill

#### Scenario: A case-sensitive regex fails validation

- **WHEN** a grader is `type: regex` with `pattern: 'rebase'`
- **THEN** `bun run validate` fails and names the grader file
