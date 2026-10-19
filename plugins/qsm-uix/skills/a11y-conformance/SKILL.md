---
name: a11y-conformance
description: "Use when asked which accessibility criterion applies, what WCAG 2.2 level or test decides it, or whether the European Accessibility Act or EN 301 549 makes it a legal duty. Triggers: is this WCAG AA, which criterion is this, 2.5.8 target size, focus not obscured, do I have to, can I be fined, does the EU accessibility law apply to us, EAA, EN 301 549, microenterprise, je to povinne, vztahuje se na nas zakon o pristupnosti. Criteria and law only; driving a UI and filling the conformance table is a11y-audit."
---

# A11y Conformance

An agent asked "is this required" answers from memory, and memory blurs three things: what WCAG
2.2 says, what EN 301 549 contains, and what the European Accessibility Act binds. This skill gives
the person who publishes interfaces the checked mapping between them, so a criterion is cited by
number with its level and its test, and a legal claim says exactly how far it reaches. It is not
legal advice, it does not drive a UI (a11y-audit), and it does not say how to design or fix.

## Three layers, never merged

- **WCAG 2.2** is the technical standard: criteria with levels A, AA, AAA. Conformance at AA means
  every A and AA criterion (55 of them, counted against the 2.2 list: 31 A and 24 AA; 4.1.1 Parsing
  was removed in 2.2).
- **EN 301 549** is the European standard for ICT. Clause 9 covers web, 10 documents, 11 non-web
  software, and each clause numbers WCAG criteria as `<clause>.<criterion>` (`9.1.4.11`,
  `11.2.4.7`). The edition checked here is V3.2.1 (2021-03); its Note 1 says it reflects WCAG 2.1.
  So a criterion new in 2.2 is not in its text.
- **The Act** (Directive (EU) 2019/882) binds through Annex I, which is functional: services must be
  accessible "in a consistent and adequate way by making them perceivable, operable, understandable
  and robust" (Annex I, Section III). It names no WCAG number. Art. 15(1) gives a presumption of
  conformity to what meets a harmonised standard "the references of which have been published in
  the Official Journal", and only "in so far as those standards cover those requirements".

Say "in EN 301 549" for a criterion the standard's text carries, never "mandatory". The word
"enforceable" is for the whole chain: in the standard, the standard cited for the Act, the product
or service in scope. Break any link and the claim weakens, because presumption is a route to proving
conformity, not the duty itself.

Unresolved here, say so when asked: Decision (EU) 2021/1339 publishes V3.2.1 for Directive
2016/2102 (public-sector sites and apps). A citation of it for Directive 2019/882 could not be
confirmed from primary sources, and secondary sources disagree. Check the Commission's list of
harmonised standards for the Directive before telling anyone they hold a presumption.

## The criteria that decide a UI

Level A and AA. "In 301" is whether EN 301 549 V3.2.1 carries it (all WCAG 2.1 criteria: yes).
Test is the least work that decides; a11y-audit runs it.

| Criterion | Lvl | Requires | Test | In 301 |
| --- | --- | --- | --- | --- |
| 1.1.1 Non-text content | A | text alternative for meaningful non-text; decoration hidden | name in tree; decorative has none | yes |
| 1.3.1 Info and relationships | A | structure in markup, not only visual | tree roles match what is shown | yes |
| 1.3.4 Orientation | AA | not locked to one orientation | rotate or resize | yes |
| 1.4.1 Use of color | A | colour not the only carrier | grayscale capture still reads | yes |
| 1.4.3 Contrast (minimum) | AA | text 4.5:1, large text 3:1 | sample rendered pixels | yes |
| 1.4.4 Resize text | AA | 200 percent without loss of content or function | scale text, recapture | yes |
| 1.4.5 Images of text | AA | real text, not a picture of it | inspect | yes |
| 1.4.10 Reflow | AA | no 2-D scroll at 320 CSS px wide (256 high) | resize to 320 | yes |
| 1.4.11 Non-text contrast | AA | UI parts, states and graphics 3:1 against adjacent colour | sample pixels, each theme | yes |
| 1.4.12 Text spacing | AA | no loss when line, paragraph, letter, word spacing are raised | apply spacing override | yes |
| 1.4.13 Hover or focus content | AA | dismissible, hoverable, persistent | hover, Esc, move onto it | yes |
| 2.1.1 Keyboard | A | every function by keyboard, no timing | Tab through, operate | yes |
| 2.1.2 No keyboard trap | A | focus can leave by keyboard | Tab out of every widget | yes |
| 2.1.4 Character key shortcuts | A | single-key shortcut can be off, remapped, or needs focus | list shortcuts | yes |
| 2.2.1 Timing adjustable | A | a time limit can be turned off, adjusted or extended | find timeouts | yes |
| 2.2.2 Pause, stop, hide | A | moving or updating content over 5 s can be paused | find autoplay | yes |
| 2.3.1 Three flashes | A | no more than 3 flashes in any second | burst frames | yes |
| 2.4.3 Focus order | A | order keeps meaning and operability | record the Tab sequence | yes |
| 2.4.6 Headings and labels | AA | describe topic or purpose | read labels | yes |
| 2.4.7 Focus visible | AA | a visible keyboard focus indicator | capture each focus stop | yes |
| 2.4.11 Focus not obscured (min) | AA | focused item not entirely hidden by author content | Tab with sticky UI shown | no, 2.2 |
| 2.5.1 Pointer gestures | A | multipoint or path gesture has a single-pointer option | list gestures | yes |
| 2.5.2 Pointer cancellation | A | action on up-event, or abortable | press, move off, release | yes |
| 2.5.3 Label in name | A | accessible name contains the visible label | tree name vs label | yes |
| 2.5.4 Motion actuation | A | shake or tilt has a UI alternative and can be disabled, unless essential | find motion-triggered actions | yes |
| 2.5.7 Dragging movements | AA | every drag has a single-pointer alternative, unless essential | list drags | no, 2.2 |
| 2.5.8 Target size (minimum) | AA | pointer target 24 by 24 CSS px, see below | tree geometry | no, 2.2 |
| 3.2.1 / 3.2.2 On focus / input | A | no unexpected context change | focus, change values | yes |
| 3.2.3 / 3.2.4 Consistent navigation / identification | AA | same order, same name for same function | compare surfaces | yes |
| 3.2.6 Consistent help | A | help in the same place across pages | compare | no, 2.2 |
| 3.3.1 / 3.3.3 Error identification / suggestion | A / AA | error named in text, with a fix when known | submit bad input | yes |
| 3.3.2 Labels or instructions | A | label or instruction for input | read | yes |
| 3.3.4 Error prevention | AA | legal, financial, data: reversible, checked or confirmed | trace | yes |
| 3.3.7 Redundant entry | A | no re-asking what was already entered | trace the flow | no, 2.2 |
| 3.3.8 Accessible authentication (min) | AA | no cognitive test to log in; paste and password managers work | try | no, 2.2 |
| 4.1.2 Name, role, value | A | name, role, value programmatically determined | platform tree | yes |
| 4.1.3 Status messages | AA | status announced without taking focus | live region in tree | yes |

Not in the table: 1.2.x (media captions and description), 1.3.2, 1.3.3, 1.3.5, 1.4.2, 2.4.1,
2.4.2, 2.4.4, 2.4.5, 3.1.x. They apply when the UI has that content; a11y-audit marks them `not
applicable` or `not tested` with the reason. Reduced motion (2.3.3) and focus appearance (2.4.13)
are AAA, so they are good practice, never a conformance failure at AA.

## 2.5.8 in full

The target is at least 24 by 24 CSS pixels, except: undersized targets whose 24 px circles, centred
on each bounding box, intersect no other target or circle (spacing); the same function by another
control on the page (equivalent); a target inside a sentence or bound by its line height (inline);
a size set by the user agent (user agent control); a presentation that is essential or legally
required. The maintainer's 32 px for frequent controls is taste, not this criterion.

## What the Act covers

- **Products** placed on the market after 28 June 2025 (Art. 2(1)): consumer general-purpose
  computer hardware and operating systems, self-service terminals (payment, ticketing, check-in,
  interactive information), consumer terminal equipment for electronic communications and for
  audiovisual media access, e-readers.
- **Services** provided to consumers after that date (Art. 2(2)): electronic communications,
  access to audiovisual media, elements of air, bus, rail and waterborne passenger transport
  (websites, mobile apps, e-tickets, travel information, terminals), consumer banking, e-books and
  dedicated software, e-commerce.
- **Microenterprise exemption** (Art. 4(5)): a microenterprise providing services is exempt from
  the service requirements. Microenterprise (Art. 3): fewer than 10 persons and turnover or balance
  sheet total not above EUR 2 million. It covers services only, products get no exemption, and
  recital 53 says a firm must genuinely fulfil Recommendation 2003/361/EC and the case law against
  circumvention, so ownership links can take a small firm out of the exemption.
- **Limits** (Art. 14): no fundamental alteration of the product or service, no disproportionate
  burden.
- **Penalties** (Art. 30): set by each Member State, "effective, proportionate and dissuasive".
  The Act names no figure; a number belongs to a named country's law, so look it up or say none.

A desktop shell, a developer CLI, or a tool for oneself is in scope only if it is one of those
products or services. When the reading is contested, say a lawyer decides it.

## Red flags

- When about to write "required", "mandatory" or "you will be fined", name the chain link you can
  prove (criterion, standard clause, Act article) and stop there, because each link has a gap above.
- When a 2.2 criterion (2.4.11, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8) is called enforceable via EN 301
  549 V3.2.1, say it is not in that text, because the standard reflects 2.1.
- When asked about a fine, say penalties are national and the Act sets none, and quote no figure
  from memory even hedged, because an unchecked number gets repeated as fact; name the national
  act whose penalty provision to read, or fetch it.
- When asked "are we exempt", ask for headcount, turnover, product or service, and ownership links,
  because the exemption is conditional on all four.
- When a source cannot be fetched, leave the claim out, because a plausible clause number is worse
  than a gap.

## Say it in the reply

The criterion by number and level, its test, and the chain: in WCAG, in EN 301 549 (clause number),
in scope of the Act (article). Name the one link you could not confirm, and close with "a lawyer
decides contested readings" when the question was legal.

How each rule is built and exposed on a stack is its family: desktop (desktop-ui, qml-ui),
terminal (cli-ui, tui-ui), web (css-ui, react-ui, web-motion).
