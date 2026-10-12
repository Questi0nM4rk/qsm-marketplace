---
name: content-denylist
description: "Use when the person wants to stop work or employer names leaking into a public repository: build or refresh the machine-local list of names and shapes the commit gate must refuse. Triggers: \"keep our employer name out of the public repo\", \"make a denylist of internal names\", \"the commit gate should block client names\", \"scan my sessions for work-specific strings\", \"nastav blokovani firemnich nazvu\". Not for credentials, which is the qsm-secrets skill."
---

# A content denylist, generated on this machine, never committed

A public repository must not carry the names of an employer, a client, an internal service or a
tenant, and a gate that checks for them needs the very strings it forbids. Committing that list
publishes what it protects, so the list is built per device from what the person has already said
and written here, and it lives outside every repository. The pre-commit secrets gate runs gitleaks
a second time with this file when it exists, and prints one line saying it is not set up when it
does not. This skill builds the list. It does not scan any repository, edit the gate, or handle
credentials (the qsm-secrets skill does).

## Where the file goes

`${XDG_CONFIG_HOME:-$HOME/.config}/qsm/content-denylist.toml`, one `[[rules]]` per name or shape.
Never put it, a copy or a sample of it inside a repository, because a committed list leaks. Check
whether it exists first: when it does, extend it, do not start over.

## Look in the places the person already wrote down

| Source | How | Why this one |
| --- | --- | --- |
| Claude Code transcripts | `~/.claude/projects/*/*.jsonl`: grep for a candidate and count with `grep -c`, never open one | the largest record of what work the person does |
| session archive | `qsm-memory search <word> --limit 5` | already indexed, answers "does this name recur" |
| instruction files | `~/.claude/CLAUDE.md`, `~/.claude/rules/` | the person writes the employer's context here on purpose |
| project memory | `~/.claude/projects/*/memory/` | durable notes, names and ticket keys |
| git remotes | `git -C <repo> remote -v` for repos under the project directories | host and organisation names |

Sample, do not dump: a transcript holds secrets and client text, and anything printed stays in the
model's context. Print counts and the matched token only, `grep -ohE '[A-Z]{2,6}-[0-9]+' ... |
sort |
uniq -c | sort -rn | head`, and read the few matches that decide a doubt.

## What counts

| Kind | Shape to look for |
| --- | --- |
| employer or client name | a proper noun that recurs across many projects |
| internal product or service name | one the person calls by name and a public reader would not know |
| tracker key prefix | `ACME-123`: upper-case prefix, dash, digits, recurring |
| internal hostname or domain | a domain that is not a public product's |
| tenant or subscription id | a GUID next to words such as tenant, subscription, org |
| employer repository path | a path or remote URL under the employer's organisation |
| the home directory path | `/home/<user>/`, and the user name where it is not common |

A word that is also ordinary English or a public technology (`Prometheus`) fires on every commit
and trains the person to bypass the gate, so leave it out or write a regex that needs context.

## Propose, then write

Show the person a table before writing anything:

| Pattern | Why | Example count |
| --- | --- | --- |
| `(?i)\bacme\b` | employer name | 214 in 31 sessions |
| `\bACME-[0-9]+\b` | tracker key | 96 |

The counts are the only evidence you show; never print a credential, a token or a matched
sentence. Wait for the person to approve, edit or drop rows, then write exactly the approved rows
and nothing else. A name the person adds by hand is accepted without a count.

## The file's form

Gitleaks TOML, one rule each, with keywords so a rule costs nothing on files that cannot match:

```toml
[[rules]]
id = "acme-name"
description = "employer name"
regex = '''(?i)\bacme\b'''
keywords = ["acme"]

[[rules]]
id = "acme-tracker-key"
description = "employer tracker key"
regex = '''\bACME-[0-9]+\b'''
keywords = ["acme-"]
```

The `id` and `description` are what the gate prints when a rule hits, so write them to say what
was found without containing it (`employer-name`, not `acme`). Use single-quoted literal strings so
a backslash needs no doubling, and keep each keyword lower-case.

## Check it once

Run a real check before saying done: in a scratch directory stage a file holding one of the
approved names and run `gitleaks git --staged --config <file> --no-banner --redact`; it must report
the rule. A rule that never fires is worse than none, because the person trusts it.

## Red flags

- When a candidate comes from a transcript you have not counted, count it before proposing it,
  because an uncounted name may be one mention and not worth a rule.
- When the file would land inside a repository, stop and use the config path above, because a
  committed list is the leak itself.
- When a proposed regex matches a common word, add context or drop it, because a noisy rule gets
  the whole gate bypassed.
- When you are about to print a matched line to justify a row, print the count instead, because
  the line may carry what the list is there to keep out.

## Say it in the reply

The path written, the number of rules and their ids, the sources searched, and the result of the
one real check. Say plainly what you did not look at.
