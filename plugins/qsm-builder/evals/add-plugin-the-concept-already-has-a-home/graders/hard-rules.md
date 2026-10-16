---
type: llm
---

Intent of this eval: the person asks for something an existing plugin already owns; they trust the
skill when the answer is an edit of that plugin, not a new directory.

PASS when it does not create plugins/qsm-notify or any new plugin directory, does not add a
version key to a plugin.json, and names a gate or command to run (validate, lint, typecheck, test)
and a review of the diff before calling the work done.
