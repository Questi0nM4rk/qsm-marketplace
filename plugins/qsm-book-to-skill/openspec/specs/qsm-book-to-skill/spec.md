# qsm-book-to-skill Specification

## Purpose

Converts a book or document into one self-contained skill document: its summary, rules, ideas
and abstractions as instructions the agent can act on, naming the book only as its source.

## Requirements

### Requirement: Install compiles the pipeline binary and nothing else

The plugin's installer SHALL be the shared install base with no upstream tool
and no extra step: it compiles the pipeline binary into the user's bin
directory, writes that binary's shell completion, and reports a binary whose
content did not change as already installed. The optional external
converters SHALL NOT gate the install; the `doctor` verb reports them instead.

#### Scenario: First install

- **WHEN** the binary is not in the bin directory
- **THEN** install SHALL compile it there and report it installed

#### Scenario: Nothing changed since the last run

- **WHEN** install runs again and the compiled binary hashes the same
- **THEN** install SHALL report it already installed

### Requirement: The conversion pipeline runs as one CLI, one verb per stage

The plugin SHALL expose the conversion pipeline (validating input, extracting
text, analyzing structure, drafting per-chapter working notes, assembling the
generated skill, and scanning it) as one CLI with one verb per stage, rather than as agent-followed
prose steps.

#### Scenario: A stage runs on its own

- **WHEN** a caller invokes one stage's verb, passing the prior stage's
  output
- **THEN** that stage SHALL run without re-running the stages before it

### Requirement: Extraction turns source documents into consolidated text

Given one or more source documents (PDF, EPUB, DOCX, HTML, Markdown,
MOBI/AZW, plain text, RTF), the plugin SHALL extract and consolidate their
text plus per-source metadata: size, page count, word and token estimates,
and detected chapters.

#### Scenario: No input resolves

- **WHEN** none of the given inputs can be extracted
- **THEN** the run SHALL fail and SHALL report which sources failed and why

#### Scenario: Partial failure across sources

- **WHEN** some sources extract and others fail
- **THEN** the run SHALL continue with the sources that succeeded and SHALL
  report the ones skipped

### Requirement: Doctor reports optional converter availability

The plugin's doctor SHALL report which optional external converters (needed
for formats such as PDF, EPUB and MOBI/AZW) are installed, without performing
a conversion.

#### Scenario: An optional converter is missing

- **WHEN** a source needs a converter that is not installed
- **THEN** extraction of that source SHALL fail naming the missing
  converter, and the other sources SHALL be unaffected

#### Scenario: Doctor on a machine without the converters

- **WHEN** a user runs `qsm-book-to-skill doctor` with no converter on PATH
- **THEN** the verdict SHALL be `ok`, with one warning per converter naming
  what installs it and the formats it reads

### Requirement: Generation produces one self-contained skill document

Once structure analysis is complete, the plugin SHALL assemble ONE skill
document (a single `SKILL.md`, no per-chapter files) holding the summary,
rules, ideas and abstractions the book teaches, named from the caller's slug
or the text's first heading, with a description the caller supplies, and SHALL
scan the result before it is called done. The skill SHALL name the book only
as its source and SHALL stand without the book: the scan SHALL refuse a skill
that holds a draft placeholder, a page reference, or a reference to a chapter
of the source, because the skill states the author's rules and not where the
book said them.

#### Scenario: Assembly yields one document

- **WHEN** assemble runs on a drafted book
- **THEN** the output SHALL be one skill document with the chapters' content
  merged into it, and no per-chapter files beside it

#### Scenario: Assembly without a description

- **WHEN** assemble runs with no description
- **THEN** it SHALL fail as a usage error, because a generic description never
  triggers the skill

#### Scenario: Scan passes

- **WHEN** the scan of the assembled skill finds nothing
- **THEN** it SHALL report the skill's location

#### Scenario: Generated skill fails its own scan

- **WHEN** the scan finds a placeholder, a page reference or a chapter
  reference
- **THEN** it SHALL name the file and the problem and exit non-zero

### Requirement: The skill drives the pipeline and keeps the judgement stages

The plugin SHALL ship the `book-to-skill` skill, which loads when a person asks to turn a book,
paper or long document into a skill. The skill SHALL hand the agent the stage order of the CLI,
the rule for filling one chapter at a time (the rule and its reason in the author's names, no page
or chapter reference), and the decisions it must ask for (the destination and the description).
It SHALL refuse to hand-write the skill in place of `assemble`, and SHALL NOT call the run done
while the scan reports a finding or a placeholder remains.

#### Scenario: A person asks for a skill from a book

- **WHEN** a person asks to turn a PDF or EPUB into a skill
- **THEN** the agent SHALL run the stages in order, read one chapter's source at a time, and
  assemble through the CLI

#### Scenario: The scan finds a problem

- **WHEN** the scan reports a placeholder, a page reference or a chapter reference
- **THEN** the agent SHALL fix or delete that section and scan again before saying done
