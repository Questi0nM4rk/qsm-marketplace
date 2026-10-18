## MODIFIED Requirements

### Requirement: The pane shows the whole session

`/cockpit` SHALL open a pane of cards: Chat (working or idle, the step line and the `doing`),
Agents (the running ones with their command, the finished ones behind a dropdown, newest first,
with how each ended and how long it ran), and Decisions (one dropdown per typed prompt that
questions answered, titled by the prompt, holding each `question` and its `answer`). Every hook
SHALL record into the session's state whether the pane is open or not, so the pane opened late
shows the session since the plugin loaded.

#### Scenario: The pane opens late

- **WHEN** two agents ran and a question was answered before `/cockpit` was typed
- **THEN** the pane shows both agents under the finished dropdown and the answer under its prompt

#### Scenario: Decisions under their prompt

- **WHEN** the person typed "make a cockpit mod" and then answered two questions
- **THEN** the Decisions card has one closed dropdown "make a cockpit mod (2)", and pressing it
  shows both questions with their answers

## REMOVED Requirements

### Requirement: Dependencies

**Reason**: The only dependency, qsm-tasks, existed for the Tasks card.

**Migration**: `qsm-tasks` leaves `plugin.json` `dependencies`; INSTALL.md and README.md stop saying
install brings it.

### Requirement: One verb answers the claimed tasks

**Reason**: The Tasks card is dropped, so nothing asks for the claimed tasks; the card would need a
network read after every task-tool command of the chat.

**Migration**: `lib/tasks.ts`, the `tasks` verb in `qsm.json` and `scripts/cli.ts`, the Tasks card
in the hooks module and the `br close` detection in `lib/cockpit.ts` are deleted, the noun is
regenerated, and `doctor` stops probing `br`.
