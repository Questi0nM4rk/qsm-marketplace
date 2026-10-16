---
name: add-tool-a-test-that-spreads-process-env-is-refused
tags: [scenario]
runs: 3
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Use the add-tool skill. A teammate added the verb `qsm-notes count` to this marketplace and wrote
this test; I want to merge it. Review it and say what you would change.

```ts
import { test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("count prints the number of notes", () => {
  const dir = mkdtempSync(join(tmpdir(), "notes-"));
  const r = spawnSync("bun", ["plugins/qsm-notes/scripts/cli.ts", "count", "--json"], {
    env: { ...process.env, HOME: dir },
    encoding: "utf8",
  });
  expect(JSON.parse(r.stdout).data.count).toBe(0);
});
```

Nothing can be run in this sandbox: name the rules it breaks, the helper or gate that covers each,
and the replacement code.
