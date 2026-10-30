// Teammate mode: Claude Code runs `$CLAUDE_CODE_TEAMMATE_COMMAND --agent-id ... --agent-name ...`.
// The name picks the route; the launch carries exactly that route's environment.
import {
  binPath,
  exitOf,
  fail,
  fromThrown,
  type Outcome,
  ok,
  renderText,
} from "../../../lib/outcome.ts";
import type { Env } from "../../../lib/paths.ts";
import { appendLaunchLog, loadModels, prepareRouted, runClaude } from "./launch.ts";
import { placesOf } from "./places.ts";
import { retag } from "./retag.ts";
import { CLAUDE, launchArgs, launchEnv, providerOf, resolveTeammate } from "./route.ts";

/** A first argument beginning with `--` that is not a help flag: no verb begins with `--`. */
export function isTeammateArgv(argv: readonly string[]): boolean {
  const [first] = argv;
  return first?.startsWith("--") === true && first !== "--help";
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  for (const [i, arg] of argv.entries()) {
    if (arg === flag) {
      return argv[i + 1];
    }
    if (arg.startsWith(`${flag}=`)) {
      return arg.slice(flag.length + 1);
    }
  }
  return undefined;
}

/** What a launch runs on, named in launch.log whether or not it starts. */
interface Prepared {
  readonly provider: string;
  readonly model: string;
  readonly launch: Outcome<{
    readonly args: string[];
    readonly env: Record<string, string>;
  }>;
}

async function prepare(name: string, argv: readonly string[], env: Env): Promise<Prepared> {
  const places = placesOf(env);
  const route = resolveTeammate(name, () => loadModels(places));
  if (route.kind === "claude") {
    return {
      provider: "claude",
      model: flagValue(argv, "--model") ?? "-",
      launch: ok({
        args: launchArgs(argv, CLAUDE),
        env: launchEnv(env, CLAUDE),
      }),
    };
  }
  if (route.kind === "refused") {
    return {
      provider: route.provider,
      model: "-",
      launch: retag(route.outcome),
    };
  }
  const prepared = await prepareRouted(route, places, env);
  const launch = prepared.data;
  return {
    provider: route.provider,
    model: route.slug,
    launch:
      launch === undefined
        ? retag(prepared)
        : ok({ args: launchArgs(argv, launch), env: launchEnv(env, launch) }),
  };
}

function refuse(
  stateDir: string,
  line: { name: string; provider: string; model: string },
  outcome: Outcome,
): number {
  appendLaunchLog(stateDir, {
    ...line,
    outcome: `${outcome.code}: ${outcome.message ?? ""}`,
  });
  process.stderr.write(renderText(outcome).stderr);
  return exitOf(outcome.code);
}

export async function runTeammate(argv: readonly string[], env: Env): Promise<number> {
  const { stateDir } = placesOf(env);
  const name = flagValue(argv, "--agent-name");
  if (name === undefined || name === "" || name.startsWith("--")) {
    const usage = fail(
      "usage",
      "a teammate launch needs --agent-name <name>; Claude Code passes it to CLAUDE_CODE_TEAMMATE_COMMAND",
    );
    return refuse(stateDir, { name: "-", provider: "-", model: "-" }, usage);
  }
  let prepared: Prepared;
  try {
    prepared = await prepare(name, argv, env);
  } catch (e) {
    // a file that does not parse is a refusal in launch.log, never a stack trace
    const line = {
      name,
      provider: providerOf(name)?.provider ?? "claude",
      model: "-",
    };
    return refuse(stateDir, line, fromThrown(e));
  }
  const line = { name, provider: prepared.provider, model: prepared.model };
  const { launch } = prepared;
  if (launch.data === undefined) {
    return refuse(stateDir, line, launch);
  }
  const claude = binPath("claude", env);
  if (claude === null) {
    return refuse(stateDir, line, fail("missing", "claude is not on PATH"));
  }
  appendLaunchLog(stateDir, { ...line, outcome: "started" });
  return runClaude(claude, launch.data.args, launch.data.env);
}
