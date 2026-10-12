---
name: software-design-csv-import-read-and-parse
tags: [scenario]
runs: 3
max_turns: 2
allowed_tools: [Skill]
---

Use the software-design skill. Answer the way you would a hard interview question. There is no code
here and you cannot run anything; answer from what I tell you. I want to hear which interface you
would pick, why, and what you would do with each failure.

We are designing a customer CSV import. A teammate's draft has a `LineReader` class that reads the
file into a list of lines and a `RowParser` class that splits each line on the delimiter and
unquotes the fields. Customers' exports sometimes quote a field that contains a line break, and some
use a semicolon instead of a comma. The importer's entry function takes the path, delimiter, quote
character, encoding, header-row flag, skip-bad-rows flag, max rows, a progress callback and a
dry-run flag, and returns "ok", "partial" or "failed". When a row is bad it logs a warning and goes
on. When the temp file it writes cannot be deleted it throws, so a customer whose antivirus is
holding the file sees the whole import fail after it had finished. The teammate says splitting
reading from parsing is cleaner, one job per class.

Reply in this shape:

```text
Approach: <how you read the draft, which facts you connect, what you would change and why>
Flow: <numbered steps: the interface you would pick, what it hides, and what each failure does>
Next step: <the one thing you would do first>
```
