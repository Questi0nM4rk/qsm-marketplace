---
name: code-index
description: "Use when you need to find something in a tree you have not read, understand what depends on what, or get oriented in a dependency's source. Triggers: where is X, what calls this, what does this dependency export, index this repo, build an index, search the codebase, orient me in this code, structure of this repo. An exact string or a known symbol is grep, not this."
---

# Code index

A question you cannot spell costs one index call, not twenty greps. The index answers where
something lives (`search`) and what depends on what (the graph). It does not replace grep: for an
exact token, grep is faster and exact.

## Which tool

| Question | Call |
| --- | --- |
| where a concept lives, asked in prose | `search` (`top_k` at most 20, default 5) |
| what breaks if I change it | `impact` |
| symbols of a file, or around a line | `context` with `file` or `file:line` |
| what a node connects to | `structure` with `op=explain` |
| how A reaches B | `structure` with `op=path` |
| is the index there, how far behind | `status` |
| exact string, error message, known symbol | grep |

## Rules

- Without the MCP tools the same calls are shell verbs: `qsm-index search <repo> "<query>"`,
  `qsm-index impact <repo> <node>`, `qsm-index structure <repo> explain|path <node>`. One `impact`
  call lists every transitive caller with its file and line, which grep needs one hop per call to
  reach, so start a "what calls this, and what calls that" question there.

- Pass an absolute path inside the repository, because a relative one returns an error.
- `structure`, `impact` and `context` need a built graph. None, or `status` says behind: call
  `reindex`. It returns at once and builds in the background, so check `status` later, never in a
  loop. A stale answer opens with `index is stale; <action>`: do what it says.
- `unknown` from `impact` means the graph found no user, not that none exist, because dynamic and
  cross-language uses are invisible to it. Grep the name before saying it is safe.
- An error naming a missing command means a tool is not installed: say so and continue with grep.
  Do not retry the same call.

## Red flags

- When you have sent several reworded `search` calls, read the files, because the index does not
  have it.
- When you are about to treat `search` output as the answer, read the places it lists, because it
  says where to look, not what is there.
- When you are about to claim a dependency exports something because `search` surfaced it, check
  the entry point, because a hit shows presence, not export.

## Say it in the reply

Name the call and the tree: `searched <tree> for <query>, three hits, read two`. On an error, say
which and what you did instead, in one line.
