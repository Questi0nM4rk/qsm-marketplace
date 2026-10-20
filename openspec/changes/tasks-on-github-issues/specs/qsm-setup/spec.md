## MODIFIED Requirements

### Requirement: Each instruction file owns one subject

`CLAUDE.md` SHALL hold who the user is, how to talk, the prime directive, intent first, which rule
wins, where things live, the loop with the owner of each of its seven steps, and the one place for
feedback: the GitHub issue titled `Feedback on agents and tools` that carries the label `epic`,
found by title and never by number, with how to file under it. The implementation rule SHALL hold
the six questions asked before any design, the table of kinds of things with the three answers per
kind, one error system per project, contracts before code, and the design gate. The context rule
SHALL hold understand before act, the restate and when a go is waited for, what is closed, only the
ask, large output to files, secrets never in context, done means verified, memory is never
acceptance criteria, the model tiers with the four agents, and workflows. The output style SHALL
hold the shape of a turn, words, form, language, and the check before sending. A rule SHALL appear
in one of the four, and the others SHALL point to it at most in one line.

#### Scenario: A rule is found in two files

- **WHEN** a review finds the same rule stated in two instruction files with more than one line
  each
- **THEN** one file keeps it and the other is reduced to a pointer or nothing

#### Scenario: A fix-sized ask whose intent is certain

- **WHEN** the ask sizes as a fix and every one of the six questions already has an answer
- **THEN** the agent restates in one line what it understood and the size, and acts without
  waiting for a go

#### Scenario: Feedback is filed under the issue epic

- **WHEN** an agent or a subagent reads the feedback rule in `CLAUDE.md`
- **THEN** it names the issue by title and label in the marketplace repository, says a feedback task
  is a sub-issue with the label `source:<who>`, and names no task-tool epic id
