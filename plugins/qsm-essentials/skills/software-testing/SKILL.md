---
name: software-testing
description: "Use when deciding whether a change needs a test at all, choosing the cheapest test that runs the real path, deciding what to mock, or arguing about coverage. Triggers: design test cases, what should I test, unit or integration, mock or real, coverage target, edge cases, boundary, how do I test this, is this testable. How a test file is written in a language is that language's dev skill."
---

# Software testing

A test is a question the system can answer wrong, and every test costs reading and upkeep. The
default is no test file: run the real path once, the way the user meets it, and read the output.
Write a test only when that run cannot be repeated cheaply or cannot reach the logic, and then
choose the cheapest one that still runs the real path. This skill serves the person who wants real
proof at the least cost. It does not add tests the ask did not need, and a test that only
restates the code just written agrees with every bug already in it.

## Before the first test

- State what the thing promises, one sentence per promise as its user would say it. Those are the
  test names, and a promise you cannot state is a design problem.
- Name what wrong looks like for each (a wrong value, an exception, a missing side effect, a slow
  answer, a leaked secret), because the wrong you name is the wrong you catch.
- Check the promise against the real path first. If one run of the bin, the hook or the request
  shows it, you are done.
- A test earns its file when the run cannot be repeated by hand (a regression that will come back)
  or cannot reach the logic (a parser's edge cases). Say which in the reply.

## Choosing the cases

- Split the input space into groups that should behave the same and test one value per group, since
  ten values from one group are one test run ten times.
- Bugs live at the edges: the last value in and the first value out (empty and one, zero and one,
  the maximum and one past it).
- For a lifecycle, test each move between states once and each forbidden move once (a paid invoice
  paid again). For combined conditions, write the decision table and test each row that matters.
- Unhappy paths are half the promises: test "X is impossible, they get Z" as carefully as "X, they
  get Y", because Z is where the user is angry.
- Design cases from the promise first and read the code second to add what the branches missed.
  The other order tests the implementation.

## Choosing the level

- The default test is the flow: the whole promise through the real surface (the bin as a user runs
  it, the hook on its event, the request through the real handler) with the real other side where
  one exists. A flow that works is the only proof that the pieces fit.
- A test of one function alone is the exception, for rules the flow cannot reach cheaply (a
  parser's edge cases, a scoring formula).
- Mock only the real external boundary: network, clock, file system, a paid API, something slow or
  non-deterministic. A test that mocks the class next door tests the mock's opinion of it.
- A fake (an in-memory repository, a clock you set) beats a mock, because a fake behaves like the
  thing and a mock replays a script that is wrong the day the thing changes.
- When pure logic sits in a unit and the database layer is thin, test the logic directly and the
  thin layer against the real database, because a mocked database proves nothing about the queries.
- One behaviour per test, not one `assert`. Three fields of one result are fine, two unrelated
  promises are not, because the first failure hides the second.

## What the test says

- The name is the promise and the case ("returns empty when the list has no active users"), so a
  failing name says what broke.
- Arrange, act, assert, visibly, with the expected value written by hand. A loop or `if` in a test
  needs its own test.
- Each test sets up what it needs, cleans what it made, and does not depend on order.

## Coverage and confidence

- Coverage is a map of what is untested, not a score: a hundred percent with no assertion on the
  result is zero tests. When a number is demanded, use mutation score.
- Ten tests on the boundaries and forbidden moves beat two hundred on the happy middle.
- Use property-based tests for rules that hold on all inputs (encode then decode returns the input,
  sorting loses nothing), and let the tool find the case you did not.

## When a test fails

- Read what it says before touching code or test. Either the code is wrong (fix it), the test is
  wrong (fix it and say why), or the promise changed (change the test on purpose and name it).
- Make a test pass by fixing the cause. Loosening an assertion, adding a retry or catching the
  exception hides the bug it caught. A test that fails only sometimes goes to the debugging skill.
- A bug that escaped gets a check that reproduces it through the real path, only when it can come
  back.

## Red flags

- When a suite has unit tests and no check that runs the flow end to end, add the flow check,
  because the pieces are proven and the product is not.
- When a test asserts only that a mock was called, or has no assertion, replace it with one on the
  result, because it tests your opinion of the code.
- When setup is longer than the test, look for a hard-to-use interface or the wrong level, because
  the test is reporting a design problem.
- When tests break on every refactor, move them to the behaviour, because they pin the
  implementation.
- When one giant end-to-end test checks everything, split by promise, because when it fails nothing
  is diagnosed.
- When a test sleeps, inject the clock, because time is a hidden dependency that makes the test slow
  and flaky.
- When a test depends on the machine ("works on mine"), name the dependency and remove it.

## Say it in the reply

List the promises covered and the ones left out, one line each: "Covered: empty list, one item,
duplicate id. Not covered: concurrent insert." The user checks the second list.
