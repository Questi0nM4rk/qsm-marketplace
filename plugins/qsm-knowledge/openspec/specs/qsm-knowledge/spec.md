# qsm-knowledge Specification

## Purpose

qsm-knowledge is the grounded knowledge base: a notebook answering only from source material put
into it, and a vault holding the durable notes distilled from those answers.

## Requirements

### Requirement: The notebook binary installs to a resolvable path

The plugin SHALL install the notebook binary so it resolves on PATH, using
the upstream installer for its toolchain. Doctor SHALL probe that the
binary is present and answers a help invocation, and SHALL report failure,
not silence, on either check.

#### Scenario: Binary absent

- **WHEN** doctor runs before the binary exists or is linked onto PATH
- **THEN** doctor SHALL report it missing and SHALL NOT report success

#### Scenario: Binary present and responsive

- **WHEN** doctor runs after install
- **THEN** doctor SHALL report success only if the binary is on PATH and
  answers a help invocation

### Requirement: Deciding whether a topic earns a notebook

The plugin SHALL provide guidance, triggered when work needs grounding in
source material, deciding whether a topic justifies a notebook over a
one-off lookup, weighing whether sources will be revisited, whether the
topic outlives the task, and whether sources are reachable only through
the notebook. It SHALL discourage a notebook for one question answered
once.

#### Scenario: One question, never reopened

- **WHEN** the user needs one fact and will not return to the sources
- **THEN** the guidance SHALL recommend a one-off lookup, not a notebook

#### Scenario: Recurring topic

- **WHEN** three or more sources will be queried repeatedly across sessions
- **THEN** the guidance SHALL recommend a notebook

### Requirement: Stocking and maintaining a notebook's sources

The plugin SHALL provide guidance for adding sources, verifying each
ingested its intended content, and re-checking freshness before relying on
it. It SHALL prefer primary sources over secondary summaries and SHALL
call for sources that disagree, not only sources that agree.

#### Scenario: A source ingests as something other than intended

- **WHEN** an added source resolves to a login or empty page rather than
  its content
- **THEN** the guidance SHALL call for verifying what landed before
  treating the source as available

#### Scenario: Staleness matters only when acted on

- **WHEN** a notebook is about to be used to decide something
- **THEN** the guidance SHALL call for checking freshness then, not on a
  fixed schedule

### Requirement: Asking the notebook a question

The plugin SHALL provide guidance favoring a single-shot query returning a
cited markdown answer, reserving a stateful query for follow-ups depending
on prior answers. The guidance SHALL call for reading an answer's
citations, not only its prose, and SHALL flag one source cited repeatedly
as too thin a corpus for the question.

#### Scenario: A follow-up depends on the prior answer

- **WHEN** the next question only makes sense given what the notebook said
- **THEN** the guidance SHALL call for the stateful conversational query

#### Scenario: An answer's citations are thin

- **WHEN** a query returns a confident answer citing one source repeatedly
- **THEN** the guidance SHALL treat this as the corpus not covering the
  question, not as a reliable answer

### Requirement: A query fails when the service is down or unauthenticated

Querying a notebook SHALL fail explicitly, distinguishing an expired
session from an upstream outage, not a fabricated answer.

#### Scenario: Upstream service unavailable

- **WHEN** the notebook service reports itself unavailable for a query type
- **THEN** the guidance SHALL call for retrying the single-shot query path
  before treating the topic as unanswerable

#### Scenario: Session expired

- **WHEN** a query fails on authentication
- **THEN** the guidance SHALL call for re-authenticating before retrying

### Requirement: Running a multi-pass grounded research flow

The plugin SHALL provide a research flow, triggered for a topic already
sized as deep, that decomposes it into three to five falsifiable
sub-questions covering disagreement and gaps, queries the notebook in a
broad pass, a sharp pass, then an adversarial pass challenging the
strongest claim, and closes gaps the notebook cannot answer by dispatching
external research whose findings feed back into it.

#### Scenario: A gap the notebook cannot close

- **WHEN** a pass returns thin citations or states the corpus does not
  cover a sub-question
- **THEN** the flow SHALL dispatch external research for that gap and feed
  the findings back into the notebook before continuing

#### Scenario: No web access

- **WHEN** the flow runs where external research cannot be dispatched
- **THEN** the flow SHALL still produce the research plan, the sub-questions
  and the sources each one needs, SHALL name the gaps it could not close,
  and SHALL be judged on that plan rather than on fetched answers

#### Scenario: No sub-questions decomposed

- **WHEN** the topic has not been split into sub-questions or sized by
  prior planning
- **THEN** the flow SHALL NOT proceed and SHALL send it back to be sized
  first

### Requirement: Handing off findings instead of writing notes directly

The research flow SHALL NOT write vault notes itself. It SHALL accumulate
findings with citations in a durable working file, then hand that file to
note-drafting and vault-writing responsibilities owned elsewhere, reporting
what was concluded, what stayed open, and where the notebook and notes now
live.

#### Scenario: Passes complete

- **WHEN** the broad, sharp, and adversarial passes are done
- **THEN** the flow SHALL hand its findings file onward for synthesis and
  note-writing rather than drafting notes itself

### Requirement: Synthesizing research into note drafts

Once research closes, on request the agent SHALL turn its findings file
into exactly the requested number of note-ready drafts, each grounded in a
cited source, written to files rather than returned inline. It SHALL NOT
fetch new sources or write the durable vault note itself.

#### Scenario: A findings file with an agreed output shape

- **WHEN** given a findings file, an output shape naming drafts and themes,
  and a destination
- **THEN** the agent produces exactly that many drafts with full
  frontmatter and cross-links, writes them to files, and returns the paths

#### Scenario: Findings that contradict each other

- **WHEN** two claims in the findings file contradict each other
- **THEN** the agent SHALL keep both as an open question, not resolve one
  in favor of the other

### Requirement: Writing a vault note

The skill SHALL write one atomic note per invocation: one concept, required
frontmatter filled, wikilinked to related notes, placed under the vault's
existing directory for its type. It SHALL NOT invent a top-level directory
and SHALL NOT combine two concepts into one note.

#### Scenario: Distilled knowledge ready to save

- **WHEN** the user asks to save a concept, TIL, project note, debug note,
  or research summary, and the vault path was not given
- **THEN** the skill asks for the vault path and note type, drafts one note
  with title, date, type, and tags, and links it to related notes

#### Scenario: No matching directory for the note's type

- **WHEN** the vault has no directory matching the note's type
- **THEN** the skill SHALL ask where it goes rather than invent one

### Requirement: Validating a written note

After writing a note, the skill SHALL run it through validation and SHALL
NOT report it done until validation has run. Validation SHALL check
required frontmatter fields, a valid note type, a `YYYY-MM-DD` date,
lowercase hyphenated tags, and at least one wikilink.

#### Scenario: A required field is missing or malformed

- **WHEN** a note misses a required field, carries an unknown type, a bad
  date, or an uppercase or spaced tag
- **THEN** validation SHALL report `failed`, list each problem, and the skill
  SHALL fix and re-validate the note before reporting it done

#### Scenario: No wikilink in the body

- **WHEN** a note's body has no `[[wikilink]]`
- **THEN** validation SHALL report it as a warning, and the skill flags the
  gap as a follow-up rather than blocking on it

### Requirement: Hooks expose the knowledge noun

The plugin SHALL register a function hook that adds `$.knowledge`, one method per verb in
`qsm.json`, and the hook SHALL hold no logic of its own.

#### Scenario: A hook calls a verb

- **WHEN** another plugin's hook calls `$.knowledge.validate({ note })`
- **THEN** the result SHALL be the one `qsm-knowledge validate` prints in a shell

### Requirement: Dependencies

The plugin SHALL declare each plug-in it needs in `dependencies` with one reason per name.

- `qsm-essentials`: the research flow dispatches the `web-research` worker for a gap the notebook
  cannot close.

#### Scenario: Dependencies

- **WHEN** the plugin is installed
- **THEN** `claude plugin install` installs `qsm-essentials` with it
