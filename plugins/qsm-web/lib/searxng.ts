// The search rung: one instance, one query, one JSON array on stdout. The server owns the search
// policy; the client sends the query, the format and only the overrides it was asked for.
import { z } from "zod";
import { messageOf, UsageError } from "../../../lib/outcome.ts";
import { QsmError } from "../../../lib/qsm-error.ts";

const SEARCH_PROFILE = z.enum(["default", "niche", "academic", "it", "images"]);
export type SearchProfile = z.infer<typeof SEARCH_PROFILE>;

const PROFILE_ENGINES = {
  niche: ["searchmysite", "wiby", "mwmbl", "boardreader"],
  academic: ["arxiv", "crossref", "openalex", "semantic scholar", "pubmed", "europepmc"],
  it: [
    "alpine linux packages",
    "apple app store",
    "askubuntu",
    "cachy os packages",
    "caddy.community",
    "codeberg",
    "crates.io",
    "discuss.python",
    "docker hub",
    "fdroid",
    "free software directory",
    "gentoo",
    "gitea.com",
    "github",
    "gitlab",
    "google play apps",
    "hackernews",
    "hex",
    "hoogle",
    "huggingface",
    "huggingface datasets",
    "huggingface spaces",
    "lib.rs",
    "mankier",
    "mdn",
    "microsoft learn",
    "national vulnerability database",
    "nixos wiki",
    "packagist",
    "pi-hole.community",
    "pkg.go.dev",
    "pub.dev",
    "sourcehut",
    "stackoverflow",
    "superuser",
    "voidlinux",
  ],
  images: [
    "artic",
    "artstation",
    "brave.images",
    "devicons",
    "duckduckgo images",
    "findthatmeme",
    "flaticon",
    "frinkiac",
    "giphy",
    "iconify",
    "lucide",
    "material icons",
    "pinterest",
    "public domain image archive",
    "selfhst icons",
    "uxwing",
  ],
} as const;

/** Validate the caller's profile name before it reaches the search request. */
export function parseSearchProfile(raw: string): SearchProfile {
  const profile = SEARCH_PROFILE.safeParse(raw);
  if (!profile.success) {
    throw new UsageError("--profile must be default, niche, academic, it or images");
  }
  return profile.data;
}

export interface SearchResult {
  readonly url: string;
  readonly title: string;
  readonly content: string;
  readonly engine: string;
  readonly engines: readonly string[];
  readonly score: number;
  readonly category: string;
  readonly publishedDate: string | null;
  /** the media the instance offers beside the page, under the names it sent them in */
  readonly img_src?: string;
  readonly thumbnail_src?: string;
  readonly iframe_src?: string;
}

export interface SearchOptions {
  readonly query: string;
  readonly numResults: number;
  readonly profile?: SearchProfile;
  readonly engines?: readonly string[];
  readonly timeRange?: string;
  readonly language?: string;
  readonly safesearch?: number;
}

/** A profile owns source selection; explicit engines belong to unprofiled calls. */
function profileEngines(opts: SearchOptions): readonly string[] | undefined {
  if (opts.profile === undefined) {
    return undefined;
  }
  if (opts.engines !== undefined) {
    throw new UsageError("--profile cannot be combined with --engines");
  }
  return opts.profile === "default" ? undefined : PROFILE_ENGINES[opts.profile];
}

/** How many results the client keeps when nothing else is asked for. */
export const DEFAULT_NUM_RESULTS = 10;

/** How long one request may take when nothing else is asked for. */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** The instance to query: the flag, then the environment. */
export function resolveInstance(flag?: string, env?: string): string | undefined {
  if (flag !== undefined) {
    return flag;
  }
  if (env !== undefined && env.trim().length > 0) {
    return env;
  }
  return undefined;
}

/**
 * The instance as the base address of its search endpoint: absolute http(s), a reverse-proxy path
 * kept, and no credentials, query or fragment, which would carry secrets into a log or a URL.
 * Throws a UsageError: the address is the caller's own input, and the message never repeats it.
 */
export function parseInstance(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UsageError("the instance must be an absolute http(s) address");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UsageError("the instance must be an absolute http(s) address");
  }
  if (url.username !== "" || url.password !== "") {
    throw new UsageError("the instance address must not carry credentials");
  }
  if (url.search !== "") {
    throw new UsageError("the instance address must not carry a query");
  }
  if (url.hash !== "") {
    throw new UsageError("the instance address must not carry a fragment");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** The request: the query, the format, and only the policy the caller asked for. */
function buildSearchUrl(instance: string, opts: SearchOptions): string {
  const params = new URLSearchParams();
  params.set("q", opts.query);
  params.set("format", "json");
  if (opts.engines !== undefined && opts.engines.length > 0) {
    params.set("engines", opts.engines.join(","));
  }
  if (opts.timeRange !== undefined) {
    params.set("time_range", opts.timeRange);
  }
  if (opts.language !== undefined) {
    params.set("language", opts.language);
  }
  if (opts.safesearch !== undefined) {
    params.set("safesearch", String(opts.safesearch));
  }
  return `${instance}/search?${params.toString()}`;
}

// A field an instance sends as null is as absent as one it leaves out.
const RAW_RESULT = z.object({
  url: z.string().trim().min(1),
  title: z.string().nullish(),
  content: z.string().nullish(),
  engine: z.string().nullish(),
  engines: z.array(z.string()).nullish(),
  score: z.number().nullish(),
  category: z.string().nullish(),
  publishedDate: z.string().nullish(),
  img_src: z.string().nullish(),
  thumbnail_src: z.string().nullish(),
  iframe_src: z.string().nullish(),
});

const RESPONSE = z.object({
  results: z.array(RAW_RESULT),
  unresponsive_engines: z.array(z.tuple([z.string(), z.string()])).optional(),
});

const ENGINE_CATALOG = z.object({
  engines: z.array(z.object({ name: z.string().trim().min(1) })),
});

/** Reject unreadable JSON without echoing any part of the instance's response body. */
function readJson(address: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err: unknown) {
    throw new QsmError("failed", `${address} answered with text that is not JSON`, { cause: err });
  }
}

/** Missing names must not turn a targeted profile into the server's default search. */
async function requireProfileEngines(
  instance: string,
  engines: readonly string[],
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(`${instance}/config`, { signal });
  if (!response.ok) {
    throw new QsmError("failed", `${instance}/config answered HTTP ${response.status}`);
  }
  const parsed = readJson(`${instance}/config`, await response.text());
  const catalog = ENGINE_CATALOG.safeParse(parsed);
  if (!catalog.success) {
    throw new QsmError("failed", `${instance}/config answered with an invalid engine catalog`);
  }
  const registered = new Set(catalog.data.engines.map((engine) => engine.name));
  const missing = engines.filter((name) => !registered.has(name));
  if (missing.length > 0) {
    throw new QsmError(
      "missing",
      `profile engines are not registered: ${missing.join(", ")}; use --engines to choose available sources`,
    );
  }
}

type RawResult = z.infer<typeof RAW_RESULT>;
type SearxngResponse = z.infer<typeof RESPONSE>;

export interface SearchOutcome {
  readonly results: readonly SearchResult[];
  readonly warnings: readonly string[];
}

/** A text field of a raw result: sent as null or left out, it reads as empty. */
const text = (value: string | null | undefined): string => value ?? "";

function engineList(r: RawResult): string[] {
  if (r.engines) {
    return r.engines;
  }
  return r.engine === undefined || r.engine === null || r.engine === "" ? [] : [r.engine];
}

/** An optional text field: absent, null or empty reads as no value at all. */
const optional = (value: string | null | undefined): string | undefined =>
  value === undefined || value === null || value === "" ? undefined : value;

/** The media a result carries, kept under the names the instance sent them in. */
function media(r: RawResult): Pick<SearchResult, "img_src" | "thumbnail_src" | "iframe_src"> {
  const img = optional(r.img_src);
  const thumbnail = optional(r.thumbnail_src);
  const iframe = optional(r.iframe_src);
  return {
    ...(img === undefined ? {} : { img_src: img }),
    ...(thumbnail === undefined ? {} : { thumbnail_src: thumbnail }),
    ...(iframe === undefined ? {} : { iframe_src: iframe }),
  };
}

function toResult(r: RawResult): SearchResult {
  return {
    url: r.url,
    title: text(r.title),
    content: text(r.content),
    engine: text(r.engine),
    engines: engineList(r),
    score: r.score ?? 0,
    category: r.category ?? "general",
    publishedDate: r.publishedDate ?? null,
    ...media(r),
  };
}

/** Turn one instance response into results and warnings. */
function readResponse(body: SearxngResponse, numResults: number): SearchOutcome {
  const warnings = (body.unresponsive_engines ?? []).map(
    ([engine, reason]) => `engine suspended: ${engine} (${reason})`,
  );
  const results = body.results.slice(0, numResults).map(toResult);
  return { results, warnings };
}

/**
 * The instance's answer, read: the results and the warnings it carries. A body that is not JSON and
 * a body this client cannot read are two different faults, and neither is echoed.
 */
function readOutcome(instance: string, raw: string, numResults: number): SearchOutcome {
  const parsed = readJson(instance, raw);
  const body = RESPONSE.safeParse(parsed);
  if (!body.success) {
    throw new QsmError("failed", `${instance} answered with a JSON shape this client cannot read`);
  }
  return readResponse(body.data, numResults);
}

/**
 * One request against one instance. Every way it can end badly keeps its own name: the transport
 * that gave up, the status the server answered, a body that is not JSON, and a JSON shape this
 * client cannot read. No response body is echoed.
 *
 * The deadline covers the whole exchange, the body included: an instance that answers with headers
 * and then stalls its body is given up on like any other silence.
 */
export async function search(
  instance: string,
  opts: SearchOptions,
  timeoutMs: number,
): Promise<SearchOutcome> {
  const selectedEngines = profileEngines(opts);
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`no answer within ${timeoutMs} ms`));
  }, timeoutMs);
  try {
    if (selectedEngines !== undefined) {
      await requireProfileEngines(instance, selectedEngines, controller.signal);
    }
    const url = buildSearchUrl(
      instance,
      selectedEngines === undefined ? opts : { ...opts, engines: selectedEngines },
    );
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      throw new QsmError("failed", `${instance} answered HTTP ${resp.status}`);
    }
    return readOutcome(instance, await resp.text(), opts.numResults);
  } catch (err: unknown) {
    if (err instanceof QsmError) {
      throw err;
    }
    throw new QsmError("failed", `could not reach ${instance}: ${messageOf(err)}`, { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

export function formatResults(results: readonly SearchResult[]): string {
  return `${JSON.stringify(results, null, 2)}\n`;
}
