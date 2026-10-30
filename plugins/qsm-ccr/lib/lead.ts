// qsm-ccr lead: an interactive Claude Code on a routed model, whose teammates route by name
// because CLAUDE_CODE_TEAMMATE_COMMAND names this binary: the running one when compiled, else the
// qsm-ccr on PATH. It never writes user settings; a lead
// that did (startup discovery or a /model pick) is named after it exits, never undone.
import { binPath, fail, type Outcome, ok } from "../../../lib/outcome.ts";
import type { Env } from "../../../lib/paths.ts";
import { loadModels, prepareRouted, runClaude } from "./launch.ts";
import { type Places, placesOf } from "./places.ts";
import { launchArgs, launchEnv, type RoutedLaunch, resolveLead } from "./route.ts";
import { snapshotOf, TEAMMATE_COMMAND } from "./settings.ts";

const DISCOVERY = "CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY";

/** This process's own path when it is a compiled binary (its modules live under /$bunfs), else
 * null: run from source, the running file is bun's and no teammate command. */
function compiledBinary(): string | null {
  return import.meta.dir.startsWith("/$bunfs") ? process.execPath : null;
}

/** The guarded keys of user settings, as settings.ts snapshots them for a daemon start. */
function guardedKeys(places: Places): Readonly<Record<string, string>> {
  return snapshotOf([places.userSettings]).get(places.userSettings) ?? {};
}

/** What follows claude's exit: user settings `model` as the lead found it, then claude's code. */
function afterLead(places: Places, wasModel: string | undefined, exit: number, model: string) {
  const after = guardedKeys(places);
  if ("(text)" in after) {
    return fail(
      "failed",
      `${places.userSettings} no longer parses after the lead exited, so its model cannot be checked; it was left as it was: repair it by hand`,
    );
  }
  if (after.model !== wasModel) {
    return fail(
      "failed",
      `model changed while the lead ran, in ${places.userSettings}, from ${wasModel} to ${after.model} (the lead, or another session's /model); a subscription session would start on it; set it back by hand`,
    );
  }
  return exit === 0
    ? ok({ exit, model }, `lead on ${model} exited 0`)
    : fail("failed", `lead on ${model}: claude exited ${exit}`);
}

export async function runLead(
  slug: string | undefined,
  rest: readonly string[],
  env: Env,
  compiled: string | null = compiledBinary(),
): Promise<Outcome> {
  const places = placesOf(env);
  const models = loadModels(places);
  if (models.data === undefined) {
    return models;
  }
  const route = resolveLead(slug, models.data);
  if (route.kind === "refused") {
    return route.outcome;
  }
  const self = compiled ?? binPath("qsm-ccr", env);
  const claude = binPath("claude", env);
  if (self === null || claude === null) {
    return fail("missing", `${self === null ? "qsm-ccr" : "claude"} is not on PATH`);
  }
  // ensure refuses user settings that do not parse, so the lead starts only on a readable file
  const prepared = await prepareRouted(route, places, env);
  if (prepared.data === undefined) {
    return prepared;
  }
  const launch: RoutedLaunch = prepared.data;
  // discovery makes Claude Code write the gateway's model list into user settings
  const childEnv: Record<string, string> = {
    ...launchEnv(env, launch),
    [TEAMMATE_COMMAND]: self,
  };
  delete childEnv[DISCOVERY];
  const wasModel = guardedKeys(places).model;
  const exit = await runClaude(claude, launchArgs(rest, launch), childEnv);
  // the lib passes a signal's exit through and gives every other failure its own code's
  return {
    ...afterLead(places, wasModel, exit, `${route.provider},${route.slug}`),
    exit,
  };
}
