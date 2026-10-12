#!/usr/bin/env bash
# A short invented excerpt standing in for a book; nothing here is copied from a real one.
cat > book.md <<'BOOK'
# Seams: Designing Software That Bends

## Chapter 1: Why systems stiffen

A system stiffens when a change in one place forces a change in five others. Marta Voss calls the
places where a change can be absorbed seams, and argues that most of the cost of a codebase is the
cost of the seams that are missing. On page 14 she gives the first rule: a seam is only worth
cutting where two things change at different speeds.

## Chapter 2: The Three Doors rule

Every module exposes exactly three doors: the front door (the calls a caller is meant to make), the
service door (the hooks an operator uses to observe it) and the emergency door (the way to switch
it off without a deploy). A module with a fourth door, such as a caller reaching into its tables,
has no seam at all, because nobody can change what is behind it. The caveat Voss raises: a module
that is only ever called from one place does not need a service door yet. Add it when the second
caller or the first incident arrives, not before. See chapter 1 for why the doors follow change
speed.

## Chapter 3: The Cold Start test

To judge a seam, start the system with that one module replaced by a fake that answers "not
available". If the system degrades and keeps serving what it can, the seam holds. If it refuses to
start, the seam is decoration. Run the Cold Start test before a release, never in production, and
write down which modules failed it: the list is the refactoring plan. Voss warns against applying
it to the database, which has no useful degraded mode; for the database she prescribes the Slow
Lane, a read-only mode kept alive on purpose (page 88).
BOOK
mkdir -p skills
