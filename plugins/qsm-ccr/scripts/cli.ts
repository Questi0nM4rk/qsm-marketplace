#!/usr/bin/env bun
// qsm-ccr: another provider's model as a Claude Code teammate or lead, through a local CCR. One
// binary, two doors: Claude Code's teammate argv, or a verb from qsm.json.
import {
  type Call,
  flagArg,
  type Handler,
  optionalString,
  renderHelp,
  runCli,
} from "../../../lib/cli-base.ts";
import type { Outcome } from "../../../lib/outcome.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import { doctor } from "../lib/doctor.ts";
import { runLead } from "../lib/lead.ts";
import { placesOf } from "../lib/places.ts";
import { freshOutcome, lockedSync, startDetachedSync, syncIsFresh } from "../lib/sync.ts";
import { isTeammateArgv, runTeammate } from "../lib/teammate.ts";
// A static import: bun's compiler inlines it, so --help works with no checkout (AGENTS.md law 9).
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = parseManifest(manifestJson, "qsm-ccr/qsm.json");
const BIN = "qsm-ccr";

const TEAMMATE_HELP =
  "\nteammate mode: qsm-ccr --agent-id <id> --agent-name <name> [claude teammate arguments...]\n" +
  "  Claude Code runs this when CLAUDE_CODE_TEAMMATE_COMMAND names the binary; a name with a\n" +
  "  registered prefix (gpt-) runs on its provider through CCR, any other name runs plain claude\n";

async function runSync(call: Call): Promise<Outcome> {
  const { env } = process;
  const places = placesOf(env);
  const ifStale = flagArg(call, "ifStale");
  if (ifStale && syncIsFresh(places.stateDir, Date.now())) {
    return freshOutcome();
  }
  if (flagArg(call, "detach")) {
    return startDetachedSync(places, env);
  }
  return lockedSync(places, env, ifStale);
}

const handlers: Record<string, Handler> = {
  lead: (call) => runLead(optionalString(call, "slug"), call.rest, process.env),
  sync: runSync,
  doctor: () => doctor(process.env),
};

function wantsHelp(argv: readonly string[]): boolean {
  const [first] = argv;
  return first === undefined || first === "--help" || first === "-h";
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (isTeammateArgv(argv)) {
    process.exit(await runTeammate(argv, process.env));
  }
  if (wantsHelp(argv)) {
    process.stdout.write(`${renderHelp(manifest, BIN)}${TEAMMATE_HELP}`);
    process.exit(0);
  }
  process.exit(await runCli(manifest, BIN, handlers, { argv }));
}
