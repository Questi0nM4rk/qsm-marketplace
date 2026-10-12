---
name: opensrc
description: "Use when the source code of an open-source library or repository is needed on disk to read: the docs are silent, the behaviour must be checked in code, the version the project pins. Runs qsm-web opensrc get with a package spec or a repository address. Triggers: get the source of this package, clone this library, read the library's code, qsm-web opensrc, stahni zdrojak knihovny. Library docs are the Context7 skill; the research loop is the web-ladder skill."
---

# opensrc

When the docs do not say, the source does. `qsm-web opensrc get` puts one library's source in one
directory per library and prints where, so the agent reads real code for the real version instead
of recalling an API.

## Use

- `qsm-web opensrc get <spec>`: a bare, scoped, registry-prefixed, `owner/repo` or version-pinned
  package spec, or a repository address.
- Pass `--project <dir>` when the version matters, so the spec resolves to what the project pins.
- A second run updates the directory in place instead of cloning again.

## Red flags

- When a bare name is refused with a full scoped name, ask again with that scoped name, because the
  unrelated package that shares the tail is the wrong one.
- When the project pins a version and you ran without `--project`, run again with it, because the
  latest source may not be the code that runs.

## Say it in the reply

The spec as run, the version acquired (exact or latest) and the directory it landed in.
