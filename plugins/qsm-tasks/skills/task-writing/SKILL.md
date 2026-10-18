---
name: task-writing
description: "Use when writing the text of an epic, a task or an issue so a maintainer and a first-time contributor both understand it on the first read: its title, plain summary, before and after, done-when criteria, non-goals, decision. Triggers: write the ticket, write the issue, write the task, write the epic, rewrite this issue, make this issue clearer, good first issue, napis ticket, napis issue, popis task, napis epic. Not for the commands of the task tool (task-tool), not for commits, merge requests or READMEs (writing)."
---

# Task Writing

A task is the one document a stranger reads to decide "is this mine?" and then to do the work
without a meeting. It fails two ways: it is written after the diff and only repeats it, or it is
written for the author, who knows what the reader lacks. This skill is the form of that text for
the task tool, whatever it stores (a GitHub or GitLab issue today). It serves two readers at once:
a maintainer who wants exact behaviour, and a newcomer who needs the plain story first. The task
tool's commands are the task-tool skill.

## Skeleton

Sections in this order, each `##`, headings that read as an outline. Drop a section that would be
empty or "N/A".

1. Title: the result or problem in the user's words, under 80 characters ("Invoice PDF shows last
   month's address after a move", not "Address bug"). A decision task states the decision.
2. Plain summary, two to four sentences, no jargon: who is hurt or what is missing, and what is
   different after. Each term is introduced in plain words before a later section uses it. A reader
   who stops here can set priority.
3. Before and after: one picture of the change (see below).
4. Why now and what is not done: the need, the cost of doing nothing, and a `Not in this task`
   list, naming what is likely confused with it ("the email template, tracked in #12").
5. Done when: a checkbox list, one testable fact per line, each an input and the exact expected
   result. Add the fail path as its own line, and `It is not done if` for the obvious (a crash,
   a silent success, a skipped test).
6. Precise part, marked "For maintainers" so a newcomer can skip it: exact behaviour, units,
   bounds, edge cases, names, error codes, and for a bug the numbered reproduction steps with exact
   input and wrong output. The cause is marked measured or guessed.
7. Decision, only when one was made: `Decision: X` first, then the options (including do nothing),
   each with why it lost, numbered so a comment can say "option 2".
8. Background and links: folded in `<details>` so the main facts stand out.

## Show before and after

Pick the lightest form that carries the change:

- Behaviour: a table of `input | today | after`, same input in every row.
- Text or output: two aligned code blocks, old above new, the changed part obvious.
- Flow or structure: a mermaid diagram of the new flow with the changed step named; one viewpoint,
  one question it answers. Mark a guess as a guess.
- UI: a screenshot pair with the same crop.

The picture must pass the five-second test: what does the viewer remember? Show the changed part,
not the whole system.

## Rules the skeleton does not show

- Write the task before the change, because trouble stating the problem in one sentence means the
  change is not understood or not one change (Ousterhout, A Philosophy of Software Design, ch. 15,
  p. 129-130).
- Know the one thing the reader must leave with before drafting; the title and first sentence carry
  it (Hunt and Thomas, The Pragmatic Programmer, "Communicate!", p. 51).
- Plain words first, then the term, defined in the problem's context: a ramp, not a cliff. Plain
  means ordered and defined, never imprecise (Hohpe, The Software Architect Elevator, ch. 18, p.
  145-148).
- Test with teach-back: a newcomer, or a fresh agent with no context, restates the task in their own
  words, and every miss is a fault in the text (Hohpe, ch. 18, p. 147; Ousterhout, ch. 18, p. 142).
- Keep need, solution and current practice apart: problem and need first, the proposed change as one
  option, so a later reader can judge another fix against the same need (Hunt and Thomas,
  "The Requirements Pit", p. 294-295).
- Write what the diff cannot show: the why, the rules, the non-goals, the failure behaviour. Never
  retell the diff (Ousterhout, ch. 12-13, p. 98-104).
- One abstraction level per section: user-visible behaviour, design choice and implementation detail
  each get their own, because mixed levels are the commonest fault in technical text (Hohpe, ch. 22,
  p. 186).
- One word per concept in title, criteria and examples; define it once, link a glossary, never
  rename it midway (Khononov, Learning Domain-Driven Design, ch. 2, p. 26 and 29; Hunt and Thomas,
  Tip 54, p. 303).
- Say what the user observes, not the table or file that implements it; implementation belongs in
  the decision (Khononov, ch. 2, p. 25; Patton, Software Testing, ch. 4, p. 60).
- Give a vague word ("fast", "small", "stable") a number or delete it, and ban "etc.", "such as",
  "handled", "processed": a list is closed or its rule is stated, and "handle X" says what the user
  sees (Patton, ch. 4, p. 61).
- Every "if" has its "else", and try to break every "always" and "never" with a counter-case
  (Patton, ch. 4, p. 61).
- State the fail criteria even when obvious: a second reader does not share your assumptions
  (Patton, ch. 18, p. 283).
- List rejected options with their reasons; one option is a smell (Harmel-Law, Facilitating
  Software Architecture, ch. 6, p. 121-123).
- Open with the decision, sparse, and keep the reasoning below it, so an implementer can stop
  reading after it (Harmel-Law, ch. 6, p. 117-120).
- Readers scan: the title and first two lines must let a stranger decide without reading on, so
  order by what the reader needs to act (Krug, Don't Make Me Think, ch. 2-3, p. 22-36).
- Cut half, then half of what is left; no welcome, no "this issue tracks...", no instructions on how
  to read it (Krug, ch. 5, p. 49-52).
- Bold a handful of key terms at most; when everything is bold, fold the background instead of
  adding more (Krug, ch. 3, p. 41; Wathan and Schoger, Refactoring UI, p. 46-47).
- Hold a closed decision as a record: a changed decision is a new comment or task that supersedes
  it, with the old why intact (Harmel-Law, ch. 6, p. 118-119, 155).

Pages for Ousterhout and Hunt and Thomas are PDF pages of the editions read, the others printed.

Our own rules, not from a book:

- Every "Done when" line traces to the need in the plain summary; a line with no root there is cut,
  which is how scope stays small.
- A table only for rows that compare (input, old, new); a list or a sentence otherwise.
- State status in words, never by emoji colour alone.
- A bug names a measured cause only when a command's output proves it.

## Example

Weak:

```markdown
# Fix address bug
There is an issue with addresses on invoices. Should be handled properly etc.
```

Strong:

```markdown
# Invoice PDF shows last month's address after a move

Customers who change their address still get invoices with the old one, so mail goes to the wrong
door. After this task the invoice shows the address valid on the invoice date.

## Before and after

| Customer | Moved on | Invoice date | Today | After |
| --- | --- | --- | --- | --- |
| 17 | 3 May | 10 May | Elm St 4 | Oak Rd 9 |
| 17 | 3 May | 1 May | Elm St 4 | Elm St 4 |

## Not in this task

The email template, tracked in #12.

## Done when

- [ ] Row 1 prints Oak Rd 9 and row 2 Elm St 4
- [ ] A customer with no address record fails with `ADDRESS_MISSING`, not a blank line
- [ ] Not done if the PDF renders with an empty address

<details><summary>For maintainers</summary>

Steps: 1. set customer 17 address on 3 May. 2. render invoice 10 May. Cause (guessed): the PDF
reads the cached address. Unverified.

</details>
```

## Red flags

- When the title names a topic ("Address bug"), rewrite it as the problem in the user's words,
  because the reader chooses what to open by it.
- When a criterion says "works" or "correctly", replace it with an input and an exact result,
  because nobody can run "correctly".
- When the plain summary needs a term the newcomer lacks, define it there, because they cannot ask.
- When the task retells the diff, delete it and write the why, because the diff is already there.
- When there is one option and no "do nothing", add them, because a decision with no alternative
  was not weighed.

## Say it in the reply

One line above the text: who reads it and what they do after. Then name the teach-back result, or
that it was not run.
