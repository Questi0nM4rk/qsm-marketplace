---
name: run-and-verify
description: "Use at the start of work in a project, before saying a change works, or when nobody has written down how the project runs. Triggers: how do I run this, start the app, does it work, verify the change, where are the logs, where is the config, set up this project locally, rozjed to, over to, how is this project started, smoke test."
---

# Run and verify

An agent that says "done" on a green build hands the person a broken app, and an agent that
re-asks how to start the project every session wastes his time. Three rules prevent both.

1. A change is done when you saw the running system do what was asked, not when the build passes.
   Decide before the change what you will look at (a response, a row, a log line), run the real
   path where the user runs it, and quote what you saw. Say what you could not run, first.
2. When the README, the scripts and the project's instruction files do not say how it runs, ask
   once: "How do you start this locally, and how do you know it is up?" The person is next to you,
   and guessing from the code is slower and worse.
3. After his go, write the answer into the project (a README section: start, how to know it is up,
   logs, tests), with no home paths, ports or secrets, so the next session reads it and does not
   ask.

A tree you have not read and that has no index gets a code index built
first (a tool that searches the code and lists callers; the installed plug-in's own skill has the
calls), so the run starts from a map.
