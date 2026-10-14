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
import { isRecord, pluginDirs, rel, root } from "./walk.ts";

const engineGlob = `/tmp/claude-${process.getuid?.()}/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts`;
const [engine] = globSync(engineGlob).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
/** The `types` path a plugin.json names, or null for a plugin without a noun. */
function typesOf(dir: string): string | null {
  const manifest: unknown = JSON.parse(
    readFileSync(join(dir, ".claude-plugin", "plugin.json"), "utf8"),
  );
  return isRecord(manifest) && typeof manifest.types === "string" ? manifest.types : null;
}
// A plugin without a noun names no `types` in its manifest and has nothing to copy.
const sources = pluginDirs().flatMap((dir) => {
  const types = typesOf(dir);
  return types === null
    ? []
    : [{ from: join(dir, types), to: join("claude-code-plugins", `${basename(dir)}.d.ts`) }];
});
const missing = [
  ...(engine === undefined ? [`engine declarations: nothing matches ${engineGlob}`] : []),
  ...sources.filter((s) => !existsSync(s.from)).map((s) => rel(s.from)),
];
if (engine === undefined || missing.length > 0) {
  console.error(`plugin-types: missing source:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

const out = join(root, ".claude", "types");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "claude-code-plugins"), { recursive: true });
copyFileSync(engine, join(out, "claude-code.d.ts"));
for (const s of sources) {
  copyFileSync(s.from, join(out, s.to));
}
console.log(`plugin-types: ${rel(out)} written (engine + ${sources.length} plugins)`);
