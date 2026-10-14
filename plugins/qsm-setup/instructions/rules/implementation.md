# Implementation rule

Read this before you design or change anything. It changes the questions you ask, not the steps
you take; the steps live in the skills the harness loads when a task matches. A way of working no
skill holds gets its source named, or is called a guess.

## First: why

Answer these six in writing before you design. A missing answer is a question for the user.

1. Who is this for, specifically, and what do they do with it?
2. What problem does it solve, and why now? What happens if we do not build it?
3. What are we not doing?
4. What exists already that does this, and why is this better than using it?
5. What must be true for it to work, and what proves it works: a test, an output, a number?
6. Budget: how much time and code is this worth? Cut the solution to fit the budget, never the
   other way round.

## Then: what kind of thing is it

Look at the thing as a black box, through the eyes of its user: "when I do this, I expect that."
For your kind, answer the table's three columns before you design: who the user is and what they
expect, the contract that must hold, and what the user sees when it fails. A kind missing from the
table gets the same three answers, written by you.

| Kind | Its user, and what they expect | The contract that must hold | Where it fails, and what the user sees |
| ------ | ------------------------------- | ----------------------------- | ---------------------------------------- |
| CLI tool | A person or a script at a shell: one command, one result, composable with pipes | Argument names, stdout shape, exit codes | Bad input, missing tool, stopped halfway. Error on stderr, exit code says which |
| API / service | Another program, often not ours: a predictable schema and status | Request and response schema, status codes, versions | Network drops mid-request, partial write, bad client. Error body with a stable code |
| Web app / frontend | A person in a browser: sees state, acts, sees the result | URL behaviour, what each screen promises | User leaves mid-flow, server down, stale data. The screen says what happened and what to do |
| Feature in an existing codebase | The code around it and the people who own it: nothing they rely on changes | Existing tests, conventions, the public behaviour of neighbours | A neighbour breaks. Errors go through the codebase's own error system, never a second one |
| Library / package | Other code: import, call, get a value | Public API, types, semantic versioning | Misuse caught at compile time, not at run time. Typed errors |
| One-off script | You, once: a correct result today | None beyond "the result is right" | A silent wrong result. Fail loud, print what was done |
| Agent tooling (skill, hook, plugin) | A model: fires on the right task, receives a small correct context | Trigger condition, output shape, size | Never fires, fires wrong, floods context. A hook says nothing unless it must block |

Follow the pattern the code around you already uses without asking, because the neighbours'
conventions are the contract. Ask only before you break a pattern, or when the code holds two
that disagree.

## Errors: one system per project

Every project has one error system: a typed error with a reusable code, a message a human can act
on, and the data needed to act. A new failure is a new code in that system, never an ad-hoc
string. Show the person the error code and what to do next. Write the supporting data to the log.
A tool, hook, installer, or gate that cannot be used fails loud and names the cause; a warning is
only for a half-state that still works, because a silent success on a broken state is the worst
failure to find later.

## One path: no fallback, no compatibility, no history

Until the person says otherwise, code takes one path and fails when that path fails. A missing
tool, a wrong input, a file in an old shape: throw the project's error with its code and stop.
Never a fallback to a second way, because a crippled program that carries on does more damage
than a dead one, and a dead one tells no lies (Hunt and Thomas, The Pragmatic Programmer, "Crash
Early"). A failure stopped at its cause is found in minutes; one a fallback carried further is
found far from it, if at all (Jim Shore, "Fail Fast", IEEE Software 2004). Never backward
compatibility with an older shape: migrate it once and delete the old reader, because every
compatibility branch is a second path that nobody runs and nobody tests (You Aren't Gonna Need
It). Never history in the code: no deprecated marker, no renamed-from note, no `v2` copy, no
date, because git already holds what the code used to be.

## Contracts: written before code

Anything that crosses a boundary, another system, another agent, the shell, the browser, gets a
written contract first: inputs, outputs, errors, and who owns a change to it. The interface is the
cost its users pay forever. The software-design skill says how to shape it.

## The design gate

Before a non-trivial change, name in one place: the behaviour, the interface, the data, the owner,
the failure behaviour, and the real run that proves it. Then code, in phases that each end in
working code.

## Tests prove real edge cases and the intended use

A test earns its place by proving one of two things: that the full intended use works, or that a
real edge case holds, such as a boundary, a failure the system must survive, or a rule the business
states. It never proves the language, the runtime, or the platform: a function that adds two numbers
needs no tests of how addition works, because that tests the `+` operator. Test-driven development
is not the rule; write the test that proves the behaviour, whenever it is cheapest to run the real
path. An agent that has read the code must not decide what is tested, because it ends by testing
what it just wrote; the behaviours come from the requirements, the intent, and the spec.

## Clean before and after

A tool leaves the machine as it found it, plus only what it was asked to add. Before it writes, an
installer removes every artifact an older version left (links, PATH blocks, data directories,
backups) completely, and names each removal; a second run removes nothing. Anything that creates a
temporary directory writes its full cleanup, so the count of entries in the temporary directory is
the same after a run as before.
