// qsm-web searxng: the search rung.
import { createInterface } from "node:readline";
import {
  type Call,
  type Handler,
  optionalNumber,
  optionalString,
  stringList,
} from "../../../lib/cli-base.ts";
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

function searchOptions(
  call: Call,
  defaults: ReturnType<typeof loadConfig>["config"],
): SearchOptions {
  const engines = optionalString(call, "engines");
  const timeRange = optionalString(call, "timeRange");
  const category = optionalString(call, "category");
  const language = optionalString(call, "language") ?? defaults.defaultLanguage;
  const safesearch = optionalNumber(call, "safesearch") ?? defaults.defaultSafesearch;
  return {
    query: stringList(call, "query").join(" ").trim(),
    numResults: optionalNumber(call, "numResults") ?? defaults.defaultNumResults,
    engines:
      engines === undefined
        ? defaults.defaultEngines
        : engines
            .split(",")
            .map((e) => e.trim())
            .filter(Boolean),
    ...(timeRange === undefined ? {} : { timeRange }),
    ...(category === undefined ? {} : { category }),
    ...(language === undefined ? {} : { language }),
    ...(safesearch === undefined ? {} : { safesearch }),
  };
}

async function searchVerb(call: Call): Promise<Outcome> {
  const { config, warnings } = loadConfig(configPath(process.env.QSM_SEARXNG_CONFIG));
  const instance = resolveInstance(
    config,
    optionalString(call, "instance"),
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
      ask: (prompt) =>
        new Promise((done) => {
          rl.question(prompt, done);
        }),
      note: (line) => {
        process.stderr.write(line);
      },
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
