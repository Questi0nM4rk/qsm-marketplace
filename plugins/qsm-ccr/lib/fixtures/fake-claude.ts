// The fake `claude`: records its argv and the variables qsm-ccr decides, optionally writes a model
// into user settings (mode claude-writes-model) or leaves them unparseable (mode
// claude-breaks-settings), and exits with mode claude-exit (default 0).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { need, readJsonObject } from "./read.ts";

const [rootArg, ...argv] = process.argv.slice(2);
const root = need(rootArg, "its fixture root");
const KEEP = /^(ANTHROPIC_|CLAUDE_CODE_|CUSTOM_ROUTER_PATH$|XDG_STATE_HOME$)/;
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => KEEP.test(k)));
writeFileSync(
  join(root, "out", `claude-${Date.now()}-${process.pid}.json`),
  JSON.stringify({ argv, env }),
);
if (existsSync(join(root, "mode", "claude-writes-model"))) {
  const path = join(need(process.env.CLAUDE_CONFIG_DIR, "CLAUDE_CONFIG_DIR"), "settings.json");
  const settings = existsSync(path) ? readJsonObject(path) : {};
  writeFileSync(path, JSON.stringify({ ...settings, model: "anthropic/claude-ccr-abc123" }));
}
if (existsSync(join(root, "mode", "claude-breaks-settings"))) {
  writeFileSync(
    join(need(process.env.CLAUDE_CONFIG_DIR, "CLAUDE_CONFIG_DIR"), "settings.json"),
    "{ broken",
  );
}
const exitFile = join(root, "mode", "claude-exit");
process.exit(existsSync(exitFile) ? Number(readFileSync(exitFile, "utf8")) : 0);
