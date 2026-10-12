---
type: llm
---

Intent of this eval: a person has a CSV importer where failures are logged, swallowed or thrown to
everyone; the design is trusted when each failure has one owner and outcome, with bad rows returned
with line numbers and only the unrepairable ones ending the import loudly.

PASS when each failure gets one of three decisions with a reason, and the status string with
logged-and-continued rows is dropped as the contract. The undeletable temp file is defined out of
existence or masked inside the module (it does not fail a finished import: leave it for later
cleanup, or write to a place that is swept), bad rows are collected and returned to the caller as
one aggregate with their line numbers (or the import stops with the cause when the caller asked
for strict), and what no caller could repair (an unreadable file, an unknown encoding) ends the
import loudly with the cause named. FAIL when a bad row is only logged, the status string stays,
or every failure is thrown to the caller.
