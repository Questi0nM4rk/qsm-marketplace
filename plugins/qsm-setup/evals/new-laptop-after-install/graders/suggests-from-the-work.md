---
type: llm
focus: trace
---

PASS if, after reading the project and the doctor output, the reply suggests plugins this work
calls for that doctor did not list (for example the TypeScript and shell language plugins, the
forge plugin for the pull request workflow) as separate choices with what each adds, and
suggests cleanups from what doctor showed (the two orphan binaries, the PATH failure). FAIL if it
only reports doctor or installs without offering choices.
