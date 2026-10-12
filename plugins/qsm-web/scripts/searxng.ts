// qsm-web searxng: the search rung.
import { createInterface } from "node:readline";
import type { Call, Handler } from "../../../lib/cli-base.ts";
import { fail, type Outcome, ok } from "../../../lib/outcome.ts";
import {
  configPath,
  EXIT,
  formatResults,
  loadConfig,
  resolveInstance,
  runSetup,
  type SearchOptions,
  search,
} from "../lib/searxng.ts";

const NO_INSTANCE =
  "no instance configured; set QSM_SEARXNG_INSTANCE, pass --instance, or run qsm-web searxng setup";

function optional<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : ({ [key]: value } as Record<string, T>);
}

function searchOptions(
  call: Call,
  defaults: ReturnType<typeof loadConfig>["config"],
): SearchOptions {
  const engines = call.args.engines as string | undefined;
  const language = (call.args.language as string | undefined) ?? defaults.defaultLanguage;
  const safesearch = (call.args.safesearch as number | undefined) ?? defaults.defaultSafesearch;
  return {
    query: (call.args.query as string[]).join(" ").trim(),
    numResults: (call.args.numResults as number | undefined) ?? defaults.defaultNumResults,
    engines:
      engines === undefined
        ? defaults.defaultEngines
        : engines
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean),
    ...optional("timeRange", call.args.timeRange as string | undefined),
    ...optional("category", call.args.category as string | undefined),
    ...optional("language", language),
    ...optional("safesearch", safesearch),
  };
}

async function searchVerb(call: Call): Promise<Outcome> {
  const { config, warnings } = loadConfig(configPath(process.env.QSM_SEARXNG_CONFIG));
  const instance = resolveInstance(
    config,
    call.args.instance as string | undefined,
    process.env.QSM_SEARXNG_INSTANCE,
  );
  if (instance.length === 0) {
    return { ...fail("missing", NO_INSTANCE), warnings };
  }
  const opts = searchOptions(call, config);
  try {
    const outcome = await search(instance, opts, config.timeoutMs);
    const all = [...warnings, ...outcome.warnings];
    if (outcome.results.length === 0) {
      all.push("no results");
    }
    return {
      ...ok(outcome.results, formatResults(outcome.results).trimEnd()),
      warnings: all,
    };
  } catch (err: unknown) {
    // Every way a search can end badly, unreachable instance, an HTTP status, a body that is not
    // JSON, is the same answer to the caller: the search did not succeed, and the message says
    // which it was.
    const message = err instanceof Error ? err.message : String(err);
    return { ...fail("failed", message), warnings };
  }
}

/**
 * Interactive setup over the terminal: the decisions live in the library, this is the question
 * asked out loud.
 */
async function setupVerb(): Promise<Outcome> {
  const path = configPath(process.env.QSM_SEARXNG_CONFIG);
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  let code: number;
  try {
    code = await runSetup(path, {
      ask: (prompt) => new Promise((done) => rl.question(prompt, done)),
      note: (line) => process.stderr.write(line),
    });
  } finally {
    rl.close();
  }
  return code === EXIT.noInstance
    ? fail("missing", "an instance URL is required; nothing was written")
    : ok({ config: path }, `configuration at ${path}`);
}

export const handlers: Readonly<Record<string, Handler>> = {
  "searxng search": searchVerb,
  "searxng setup": setupVerb,
};
