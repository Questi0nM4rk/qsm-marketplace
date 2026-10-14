// Every function-hooks module typechecks against the generated Claude Code declarations through its
// own hooks/tsconfig.json; the root tsconfig excludes them (the ambient `claude-code` module exists
// only there).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pluginDirs, rel, report, root } from "./walk.ts";

const findings: string[] = [];
const checked: string[] = [];
if (!existsSync(join(root, ".claude", "types", "claude-code.d.ts"))) {
  findings.push(
    ".claude/types/claude-code.d.ts is missing; run `bun run plugin-types` (needs the installed Claude Code)",
  );
}
for (const dir of pluginDirs()) {
  const tsconfig = join(dir, "hooks", "tsconfig.json");
  if (!existsSync(tsconfig)) {
    continue;
  }
  const r = spawnSync("bun", ["check", "--no-pretty", "-p", tsconfig], {
    cwd: root,
    encoding: "utf8",
  });
  const name = basename(dirname(dirname(tsconfig)));
  checked.push(name);
  if (r.status !== 0) {
    const lines = `${r.stdout}${r.stderr}`.trim().split("\n").slice(0, 5);
    findings.push(`${name}: ${rel(tsconfig)} does not typecheck:\n    ${lines.join("\n    ")}`);
  }
}
console.log(`typecheck-hooks: ${checked.length} hooks modules`);
report("typecheck-hooks", findings);
