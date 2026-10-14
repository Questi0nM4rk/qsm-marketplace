// The search rung: one instance, one query, one JSON array on stdout.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

export interface SearchResult {
  readonly url: string;
  readonly title: string;
  readonly content: string;
  readonly engine: string;
  readonly engines: readonly string[];
  readonly score: number;
  readonly category: string;
  readonly publishedDate: string | null;
}

export interface SearxngConfig {
  readonly instance: string;
  readonly defaultEngines: readonly string[];
  readonly defaultNumResults: number;
  readonly timeoutMs: number;
  readonly defaultLanguage?: string;
  readonly defaultSafesearch?: number;
}

export interface SearchOptions {
  readonly query: string;
  readonly numResults: number;
  readonly engines: readonly string[];
  readonly timeRange?: string;
  readonly category?: string;
  readonly language?: string;
  readonly safesearch?: number;
}

/** Exit codes the bin uses; a caller can branch on the cause. */
export const EXIT = {
  parse: 1,
  noInstance: 2,
  network: 3,
  http: 4,
  badJson: 5,
} as const;

export const DEFAULT_CONFIG: SearxngConfig = {
  instance: "",
  // duckduckgo leads: best signal on technical queries. bing is left out on purpose, it reads short
  // dev terms as unrelated words and the language flag does not fix it.
  defaultEngines: ["duckduckgo", "google"],
  defaultNumResults: 10,
  timeoutMs: 10_000,
};

const CONFIG_FILE = z.object({
  instance: z.string().exactOptional(),
  defaultEngines: z.array(z.string()).exactOptional(),
  defaultNumResults: z.number().exactOptional(),
  timeoutMs: z.number().exactOptional(),
  defaultLanguage: z.string().exactOptional(),
  defaultSafesearch: z.number().exactOptional(),
});

export function configPath(overridePath?: string, homeDir: string = homedir()): string {
  if (overridePath !== undefined && overridePath.length > 0) {
    return overridePath;
  }
  return join(homeDir, ".config", "qsm-searxng", "config.json");
}

export interface LoadedConfig {
  readonly config: SearxngConfig;
  /** Diagnostics for stderr; never printed to stdout. */
  readonly warnings: readonly string[];
}

export function loadConfig(path: string): LoadedConfig {
  if (!existsSync(path)) {
    return {
      config: DEFAULT_CONFIG,
      warnings: [`no config at ${path}; falling back to the environment`],
    };
  }
  try {
    const parsed = CONFIG_FILE.parse(JSON.parse(readFileSync(path, "utf8")));
    return { config: { ...DEFAULT_CONFIG, ...parsed }, warnings: [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { config: DEFAULT_CONFIG, warnings: [`config at ${path} is not readable JSON: ${msg}`] };
  }
}

export function writeConfig(cfg: SearxngConfig, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
}

export interface SetupIo {
  /** One prompt, one answer. Injected so a test never opens a terminal. */
  readonly ask: (prompt: string) => Promise<string>;
  /** Diagnostics for stderr; setup prints nothing to stdout. */
  readonly note: (line: string) => void;
}

/** Interactive setup: ask for the instance and the default engines, and write them. */
export async function runSetup(path: string, io: SetupIo): Promise<number> {
  const { config } = loadConfig(path);
  if (existsSync(path)) {
    const answer = (await io.ask(`${path} already exists. Replace it? [y/N] `))
      .trim()
      .toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      io.note("left the existing config untouched\n");
      return 0;
    }
  }
  const instance = (await io.ask("instance URL: ")).trim() || config.instance;
  if (instance.length === 0) {
    io.note("an instance URL is required; nothing written\n");
    return EXIT.noInstance;
  }
  const enginesHint = config.defaultEngines.join(",");
  const enginesInput = (await io.ask(`default engines [${enginesHint}]: `)).trim();
  const defaultEngines =
    enginesInput.length > 0
      ? enginesInput
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean)
      : config.defaultEngines;
  writeConfig({ ...config, instance, defaultEngines }, path);
  io.note(`wrote ${path}\n`);
  return 0;
}

/** The instance to query. */
export function resolveInstance(
  config: SearxngConfig,
  flag: string | undefined,
  env: string | undefined,
): string {
  if (flag !== undefined && flag.length > 0) {
    return flag;
  }
  if (env !== undefined && env.length > 0) {
    return env;
  }
  return config.instance;
}

export function buildSearchUrl(instance: string, opts: SearchOptions): string {
  const params = new URLSearchParams();
  params.set("q", opts.query);
  params.set("format", "json");
  if (opts.engines.length > 0) {
    params.set("engines", opts.engines.join(","));
  }
  if (opts.timeRange !== undefined) {
    params.set("time_range", opts.timeRange);
  }
  if (opts.category !== undefined) {
    params.set("categories", opts.category);
  }
  if (opts.language !== undefined) {
    params.set("language", opts.language);
  }
  if (opts.safesearch !== undefined) {
    params.set("safesearch", String(opts.safesearch));
  }
  params.set("pageno", "1");
  return `${instance.replace(/\/$/, "")}/search?${params.toString()}`;
}

// A field an instance sends as null is as absent as one it leaves out.
const RAW_RESULT = z.object({
  url: z.string().nullish(),
  title: z.string().nullish(),
  content: z.string().nullish(),
  engine: z.string().nullish(),
  engines: z.array(z.string()).nullish(),
  score: z.number().nullish(),
  category: z.string().nullish(),
  publishedDate: z.string().nullish(),
});

const RESPONSE = z.object({
  results: z.array(RAW_RESULT).optional(),
  unresponsive_engines: z.array(z.tuple([z.string(), z.string()])).optional(),
});

type RawResult = z.infer<typeof RAW_RESULT>;
export type SearxngResponse = z.infer<typeof RESPONSE>;

class SearchFailure extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "SearchFailure";
    this.exitCode = exitCode;
  }

  /** A failure that keeps the error it came from. */
  static because(cause: unknown, message: string, exitCode: number): SearchFailure {
    return new SearchFailure(message, exitCode, { cause });
  }
}

export interface SearchOutcome {
  readonly results: readonly SearchResult[];
  readonly warnings: readonly string[];
}

function toResult(r: RawResult): SearchResult {
  return {
    url: r.url ?? "",
    title: r.title ?? "",
    content: r.content ?? "",
    engine: r.engine ?? "",
    engines: engineList(r),
    score: r.score ?? 0,
    category: r.category ?? "general",
    publishedDate: r.publishedDate ?? null,
  };
}

function engineList(r: RawResult): string[] {
  if (r.engines) {
    return r.engines;
  }
  return r.engine === undefined || r.engine === null || r.engine === "" ? [] : [r.engine];
}

/** Turn one instance response into results and warnings. */
export function readResponse(body: SearxngResponse, numResults: number): SearchOutcome {
  const warnings = (body.unresponsive_engines ?? []).map(
    ([engine, reason]) => `engine suspended: ${engine} (${reason})`,
  );
  const results = (body.results ?? []).slice(0, numResults).map(toResult);
  return { results, warnings };
}

export async function search(
  instance: string,
  opts: SearchOptions,
  timeoutMs: number,
): Promise<SearchOutcome> {
  const url = buildSearchUrl(instance, opts);
  let resp: Response;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw SearchFailure.because(err, `could not reach ${instance}: ${msg}`, EXIT.network);
  }
  if (!resp.ok) {
    throw new SearchFailure(`${instance} answered HTTP ${resp.status}`, EXIT.http);
  }
  let body: SearxngResponse;
  try {
    body = RESPONSE.parse(await resp.json());
  } catch (err: unknown) {
    throw SearchFailure.because(
      err,
      `${instance} answered with text that is not JSON`,
      EXIT.badJson,
    );
  }
  return readResponse(body, opts.numResults);
}

export function formatResults(results: readonly SearchResult[]): string {
  return `${JSON.stringify(results, null, 2)}\n`;
}
