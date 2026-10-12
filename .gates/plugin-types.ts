// Fills .claude/types/ for the hooks modules' tsconfigs: the engine's API declarations plus each
// plugin's committed types/index.d.ts. The engine writes its declarations when a session starts, so
// run `claude` once if the source is missing.
import {
  copyFileSync,
  existsSync,
  globSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, join } from "node:path";
import { pluginDirs, rel, root } from "./walk.ts";

const engineGlob = `/tmp/claude-${process.getuid?.()}/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts`;
const [engine] = globSync(engineGlob).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
// A plugin without a noun names no `types` in its manifest and has nothing to copy.
const sources = pluginDirs()
  .map((dir) => ({
    dir,
    manifest: JSON.parse(readFileSync(join(dir, ".claude-plugin", "plugin.json"), "utf8")),
  }))
  .filter(({ manifest }) => typeof manifest.types === "string")
  .map(({ dir, manifest }) => ({
    from: join(dir, manifest.types),
    to: join("claude-code-plugins", `${basename(dir)}.d.ts`),
  }));
const missing = [
  ...(engine ? [] : [`engine declarations: nothing matches ${engineGlob}`]),
  ...sources.filter((s) => !existsSync(s.from)).map((s) => rel(s.from)),
];
if (missing.length > 0) {
  console.error(`plugin-types: missing source:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

const out = join(root, ".claude", "types");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "claude-code-plugins"), { recursive: true });
copyFileSync(engine as string, join(out, "claude-code.d.ts"));
for (const s of sources) {
  copyFileSync(s.from, join(out, s.to));
}
console.log(`plugin-types: ${rel(out)} written (engine + ${sources.length} plugins)`);
