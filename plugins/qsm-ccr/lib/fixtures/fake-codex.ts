// The fake `codex`: `debug models` rewrites models_cache.json from mode/next-catalog.json with a
// fresh fetched_at, unless mode codex-serves-cache (it then leaves the old file) or codex-fails.
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { need, readJsonObject } from "./read.ts";

const [rootArg, ...args] = process.argv.slice(2);
const root = need(rootArg, "its fixture root");
appendFileSync(join(root, "out", "codex.calls"), `${args.join(" ")}\n`);
const mode = (name: string) => existsSync(join(root, "mode", name));
if (args[0] === "debug" && args[1] === "models") {
  if (mode("codex-fails")) {
    process.stderr.write("network unreachable\n");
    process.exit(1);
  }
  if (!mode("codex-serves-cache")) {
    const next = readJsonObject(join(root, "mode", "next-catalog.json"));
    writeFileSync(
      join(need(process.env.CODEX_HOME, "CODEX_HOME"), "models_cache.json"),
      JSON.stringify({ ...next, fetched_at: new Date().toISOString() }),
    );
  }
}
