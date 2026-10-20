// qsm-web searxng: the search rung. The instance comes from the flag or the environment; the
// server owns the search policy, and only the overrides the caller asked for are sent.
import {
  type Call,
  type Handler,
  optionalNumber,
  optionalString,
  stringList,
} from "../../../lib/cli-base.ts";
import { fail, messageOf, type Outcome, ok, UsageError } from "../../../lib/outcome.ts";
import {
  DEFAULT_NUM_RESULTS,
  DEFAULT_TIMEOUT_MS,
  formatResults,
  parseInstance,
  resolveInstance,
  type SearchOptions,
  type SearchOutcome,
  type SearchResult,
  search,
} from "../lib/searxng.ts";

const NO_INSTANCE = "no instance to query; set QSM_SEARXNG_INSTANCE or pass --instance <url>";

/** A count or a timeout: a positive whole number, or the default. */
function positive(value: number | undefined, fallback: number, flag: string): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new UsageError(`${flag} must be a positive whole number`);
  }
  return value;
}

/** A text filter that reaches the server: given, and not blank. */
function filter(call: Call, name: string, flag: string): string | undefined {
  const value = optionalString(call, name);
  if (value === undefined) {
    return undefined;
  }
  if (value.trim().length === 0) {
    throw new UsageError(`${flag} must not be blank`);
  }
  return value.trim();
}

/** The request the caller asked for, with every value checked before the first byte moves. */
function searchOptions(call: Call): SearchOptions {
  const query = stringList(call, "query").join(" ").trim();
  if (query.length === 0) {
    throw new UsageError("the query must not be blank");
  }
  const engines = optionalString(call, "engines");
  const list =
    engines === undefined
      ? undefined
      : engines
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean);
  const timeRange = optionalString(call, "timeRange");
  const category = filter(call, "category", "--category");
  const language = filter(call, "language", "--language");
  const safesearch = optionalNumber(call, "safesearch");
  return {
    query,
    numResults: positive(optionalNumber(call, "numResults"), DEFAULT_NUM_RESULTS, "--num-results"),
    ...(list === undefined || list.length === 0 ? {} : { engines: list }),
    ...(timeRange === undefined ? {} : { timeRange }),
    ...(category === undefined ? {} : { category }),
    ...(language === undefined ? {} : { language }),
    ...(safesearch === undefined ? {} : { safesearch }),
  };
}

/** Text mode prints the array itself; the JSON envelope carries it in data and a count here. */
function message(call: Call, results: readonly SearchResult[]): string {
  if (!call.json) {
    return formatResults(results).trimEnd();
  }
  const count = results.length;
  return `${count} ${count === 1 ? "result" : "results"}`;
}

async function searchVerb(call: Call): Promise<Outcome> {
  const raw = resolveInstance(optionalString(call, "instance"), process.env.QSM_SEARXNG_INSTANCE);
  if (raw === undefined) {
    return fail("missing", NO_INSTANCE);
  }
  // Both throw a UsageError, which the CLI turns into a usage outcome: no request is made.
  const instance = parseInstance(raw);
  const opts = searchOptions(call);
  const timeout = positive(optionalNumber(call, "timeout"), DEFAULT_TIMEOUT_MS, "--timeout");

  let outcome: SearchOutcome;
  try {
    outcome = await search(instance, opts, timeout);
  } catch (err: unknown) {
    if (err instanceof UsageError) {
      throw err;
    }
    return fail("failed", messageOf(err));
  }

  // Useful results and a failed engine are a success with a warning: the answer is there.
  if (outcome.results.length === 0 && outcome.warnings.length > 0) {
    return {
      ...fail("failed", "no results; the instance reported engine failures"),
      warnings: outcome.warnings,
    };
  }
  if (outcome.results.length === 0) {
    return { ...ok([], message(call, [])), warnings: ["no results"] };
  }
  return {
    ...ok(outcome.results, message(call, outcome.results)),
    warnings: outcome.warnings,
  };
}

export const handlers: Readonly<Record<string, Handler>> = {
  "searxng search": searchVerb,
};
