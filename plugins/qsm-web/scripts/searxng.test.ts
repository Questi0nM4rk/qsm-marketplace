// The search verb through its real surface: qsm-web's argv, its stdout, its stderr and its exit
// code, against a local instance that answers what the test says it answers. Nothing here reads
// a config file or reaches the internet.
import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { envelopeOf, isolatedEnv } from "../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import type { Envelope } from "../../../lib/outcome.ts";
import it from "./fixtures/searxng-it-engines.json";
import reviewed from "./fixtures/searxng-reviewed-profile-engines.json";

const PLUGIN = resolve(import.meta.dir, "..");
const CLI = join(PLUGIN, "scripts", "cli.ts");

const Result = z.object({
  url: z.string(),
  title: z.string(),
  content: z.string(),
  engine: z.string(),
  engines: z.array(z.string()),
  score: z.number(),
  category: z.string(),
  publishedDate: z.string().nullable(),
  img_src: z.string().optional(),
  thumbnail_src: z.string().optional(),
  iframe_src: z.string().optional(),
});
const Results = z.array(Result);

const PAGE = {
  url: "https://a.test/page",
  title: "A page",
  content: "the snippet",
  engine: "duckduckgo",
  engines: ["duckduckgo", "google"],
  score: 1.5,
  category: "it",
  publishedDate: "2026-01-02",
};

const running: { stop: (closeActive?: boolean) => void }[] = [];

afterEach(() => {
  for (const server of running.splice(0)) {
    server.stop(true);
  }
});

interface Instance {
  /** the base address of the local instance */
  readonly base: string;
  /** every request it got, in order */
  readonly seen: URL[];
}

/** A local instance that answers with what the handler says and remembers every request. */
function instance(handler: (url: URL) => Response | Promise<Response>): Instance {
  const seen: URL[] = [];
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      seen.push(url);
      return handler(url);
    },
  });
  running.push(server);
  return { base: `http://127.0.0.1:${server.port}`, seen };
}

/** The instance's answer: JSON, as SearXNG sends it. */
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

/** An instance that answers with exactly the results it is given. */
function withResults(results: readonly unknown[]): Instance {
  return instance(() => json({ results }));
}

/** An instance that answers with results and one engine that failed. */
function withFailedEngine(reason: string, results: readonly unknown[] = [PAGE]): Instance {
  return instance(() => json({ results, unresponsive_engines: [["google cse", reason]] }));
}

/** An instance whose answer is text, not JSON. */
function notJson(): Instance {
  return instance(() => new Response("<html>not json</html>"));
}

/** An instance whose answer is JSON this client cannot read. */
function noResults(): Instance {
  return instance(() => json({ answers: [1, 2] }));
}

/** An instance whose result carries no URL. */
function noUrl(): Instance {
  return instance(() => json({ results: [{ title: "no url here" }] }));
}

/** An instance that answers with an error status. */
function httpError(): Instance {
  return instance(() => new Response("boom", { status: 500 }));
}

/** An instance whose engine report this client cannot read. */
function badReport(): Instance {
  return instance(() =>
    json({ results: [PAGE], unresponsive_engines: [{ engine: "google cse", error: "busy" }] }),
  );
}

/** An answer that never comes, so the request runs out of time before the headers. */
function never(): Promise<Response> {
  return new Promise((done) => {
    const timer = setTimeout(() => {
      done(json({ results: [] }));
    }, 5_000);
    timer.unref();
  });
}

/** An answer that starts and never ends: the headers arrive, the body does not finish. */
function stalled(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"results": ['));
    },
  });
  return new Response(body, { headers: { "content-type": "application/json" } });
}

interface Run {
  readonly exit: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * The CLI as a shell runs it: one clean home, one environment on top of it. The child is spawned
 * without blocking the loop, because the instance that answers it lives in this process.
 */
async function run(argv: readonly string[], extra: Record<string, string> = {}): Promise<Run> {
  const home = sandboxDir("qsm-web-search-");
  const child = Bun.spawn([process.execPath, CLI, ...argv], {
    env: isolatedEnv(home, extra),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exit, stdout, stderr };
}

/** The search verb against one instance: what it printed and the code it left. */
async function searchVerb(inst: Instance, ...flags: string[]): Promise<Run> {
  return run(["searxng", "search", "q", "--instance", inst.base, ...flags]);
}

/** The same search in JSON mode: the envelope the caller reads. */
async function searchJson(
  inst: Instance,
  ...flags: string[]
): Promise<{ readonly exit: number; readonly envelope: Envelope }> {
  const r = await searchVerb(inst, ...flags, "--json");
  return { exit: r.exit, envelope: envelopeOf(r.stdout) };
}

/** The results the envelope carries. */
function resultsOf(envelope: Envelope): z.infer<typeof Result>[] {
  return Results.parse(envelope.data);
}

/** The request the instance got. */
function asked(inst: Instance): URL {
  const url = inst.seen.at(0);
  if (url === undefined) {
    throw new Error("the instance got no request");
  }
  return url;
}

/** One unusable answer: the case, the instance, the phrase it names, the text it must not show. */
type Unusable = readonly [string, () => Instance, string, string];

/** Every answer the client cannot use, and what each of them must say instead. */
const UNUSABLE: readonly Unusable[] = [
  ["a body that is not JSON", notJson, "not JSON", "<html>"],
  ["a JSON shape without results", noResults, "shape", "answers"],
  ["a result without a URL", noUrl, "shape", "no url here"],
  ["an HTTP error", httpError, "HTTP 500", "boom"],
  ["an engine report this client cannot read", badReport, "shape", "google cse"],
];

describe("qsm-web searxng search", () => {
  test("the request carries the query and the format, and nothing else", async () => {
    const inst = withResults([PAGE]);
    const r = await run(["searxng", "search", "io", "uring", "--instance", inst.base]);
    expect(r.exit).toBe(0);
    const params = asked(inst).searchParams;
    expect([...params.keys()].toSorted()).toEqual(["format", "q"]);
    expect(params.get("q")).toBe("io uring");
    expect(params.get("format")).toBe("json");
  });

  test("an instance behind a reverse proxy keeps its path", async () => {
    const plain = withResults([PAGE]);
    const direct = await searchVerb(plain);
    expect(direct.exit).toBe(0);
    expect(asked(plain).pathname).toBe("/search");

    const behind = withResults([PAGE]);
    const proxied = await run(["searxng", "search", "q", "--instance", `${behind.base}/searx/`]);
    expect(proxied.exit).toBe(0);
    expect(asked(behind).pathname).toBe("/searx/search");
  });

  test("explicit flags reach the server, and the local ceiling holds", async () => {
    const inst = withResults([PAGE, PAGE, PAGE]);
    const r = await searchVerb(
      inst,
      "--num-results",
      "2",
      "--engines",
      " duckduckgo , google ",
      "--time-range",
      "week",
      "--language",
      "en",
      "--safesearch",
      "1",
    );
    expect(r.exit).toBe(0);
    const params = asked(inst).searchParams;
    expect(params.get("engines")).toBe("duckduckgo,google");
    expect(params.has("categories")).toBe(false);
    expect(params.get("time_range")).toBe("week");
    expect(params.get("language")).toBe("en");
    expect(params.get("safesearch")).toBe("1");
    expect(params.has("pageno")).toBe(false);
    const printed: unknown = JSON.parse(r.stdout);
    expect(Results.parse(printed)).toHaveLength(2);
  });

  test("an empty engine list sends no engines parameter", async () => {
    const inst = withResults([PAGE]);
    const r = await searchVerb(inst, "--engines", "");
    expect(r.exit).toBe(0);
    expect(asked(inst).searchParams.has("engines")).toBe(false);
  });

  test("bad input is refused before the instance is asked", async () => {
    const inst = withResults([PAGE]);
    const calls = [
      ["searxng", "search", "   ", "--instance", inst.base],
      ["searxng", "search", "q", "--instance", inst.base, "--num-results", "0"],
      ["searxng", "search", "q", "--instance", inst.base, "--num-results", "1.5"],
      ["searxng", "search", "q", "--instance", inst.base, "--timeout", "0"],
      ["searxng", "search", "q", "--instance", inst.base, "--language", ""],
      ["searxng", "search", "q", "--instance", inst.base, "--safesearch", "3"],
      ["searxng", "search", "q", "--instance", inst.base, "--time-range", "fortnight"],
    ];
    for (const argv of calls) {
      const r = await run(argv);
      expect(r.exit).toBe(2);
    }
    expect(inst.seen).toHaveLength(0);
  });

  test("an address that is not a plain http(s) URL is refused, and its value is not echoed", async () => {
    const credentialed = new URL("http://search.test");
    credentialed.username = credentialed.hostname;
    credentialed.password = credentialed.username;
    const refused: readonly (readonly [string, string])[] = [
      ["search.test", "http(s)"],
      ["ftp://search.test", "http(s)"],
      [credentialed.href, "credentials"],
      ["http://search.test/?q=1", "query"],
      ["http://search.test/#frag", "fragment"],
    ];
    for (const [address, why] of refused) {
      const r = await run(["searxng", "search", "q", "--instance", address]);
      expect(r.exit).toBe(2);
      expect(r.stderr).toContain(why);
      expect(r.stderr).not.toContain(address);
      expect(r.stderr).not.toContain(credentialed.password);
    }
  });

  const noInstance: readonly (readonly [string, Record<string, string>])[] = [
    ["no address input at all", {}],
    ["an empty environment variable", { QSM_SEARXNG_INSTANCE: "" }],
  ];
  for (const [what, env] of noInstance) {
    test(`${what} is missing, and it names both inputs`, async () => {
      const r = await run(["searxng", "search", "q"], env);
      expect(r.exit).toBe(4);
      expect(r.stderr).toContain("QSM_SEARXNG_INSTANCE");
      expect(r.stderr).toContain("--instance");
      const withJson = await run(["searxng", "search", "q", "--json"], env);
      expect(envelopeOf(withJson.stdout).code).toBe("missing");
    });
  }

  test("the old config file is ignored", async () => {
    const home = sandboxDir("qsm-web-search-");
    const config = join(home, "config.json");
    writeFileSync(config, JSON.stringify({ instance: "https://from-file.test" }));
    const r = await run(["searxng", "search", "q"], { QSM_SEARXNG_CONFIG: config });
    expect(r.exit).toBe(4);
    expect(r.stderr).toContain("QSM_SEARXNG_INSTANCE");
  });

  test("the flag beats the environment, and the environment is used without the flag", async () => {
    const flagged = withResults([PAGE]);
    const fromEnv = withResults([PAGE]);
    const withFlag = await run(["searxng", "search", "q", "--instance", flagged.base], {
      QSM_SEARXNG_INSTANCE: fromEnv.base,
    });
    expect(withFlag.exit).toBe(0);
    expect(flagged.seen).toHaveLength(1);
    expect(fromEnv.seen).toHaveLength(0);

    const onlyEnv = withResults([PAGE]);
    const r = await run(["searxng", "search", "q"], { QSM_SEARXNG_INSTANCE: onlyEnv.base });
    expect(r.exit).toBe(0);
    expect(onlyEnv.seen).toHaveLength(1);
  });

  test("useful results with a failed engine are a success that keeps the warning", async () => {
    const inst = withFailedEngine("Suspended: too many requests");
    const { exit, envelope } = await searchJson(inst);
    expect(exit).toBe(0);
    expect(envelope.code).toBe("ok");
    expect(envelope.warnings.join(" ")).toContain("too many requests");
    expect(resultsOf(envelope)).toHaveLength(1);
  });

  test("no results and no engine failure is an empty success with a warning", async () => {
    const inst = withResults([]);
    const { exit, envelope } = await searchJson(inst);
    expect(envelope.data).toEqual([]);
    expect(envelope.warnings).toContain("no results");
    expect(exit).toBe(0);
    expect(envelope.code).toBe("ok");
  });

  test("no results and a failed engine is a failure that keeps the warning", async () => {
    const inst = withFailedEngine("too many requests", []);
    const { exit, envelope } = await searchJson(inst);
    expect(exit).toBe(1);
    expect(envelope.code).toBe("failed");
    expect(envelope.warnings.join(" ")).toContain("too many requests");
    expect(envelope.message).not.toContain("down");
  });

  test("the media URLs stay in the result", async () => {
    const inst = withResults([
      {
        ...PAGE,
        img_src: "https://img.test/a.png",
        thumbnail_src: "https://img.test/t.png",
        iframe_src: "https://img.test/frame.html",
      },
    ]);
    const { exit, envelope } = await searchJson(inst);
    expect(exit).toBe(0);
    expect(resultsOf(envelope)[0]).toMatchObject({
      url: "https://a.test/page",
      img_src: "https://img.test/a.png",
      thumbnail_src: "https://img.test/t.png",
      iframe_src: "https://img.test/frame.html",
    });
    expect(envelope.message).toBe("1 result");
  });

  test("a result with one engine keeps it in the engines array", async () => {
    const inst = withResults([
      {
        url: "https://a.test/page",
        title: "A page",
        content: "the snippet",
        engine: "duckduckgo",
        score: 1.5,
        category: "it",
        publishedDate: null,
      },
    ]);
    const { exit, envelope } = await searchJson(inst);
    const [first] = resultsOf(envelope);
    expect(first?.engines).toEqual(["duckduckgo"]);
    expect(first?.category).toBe("it");
    expect(first?.publishedDate).toBeNull();
    expect(exit).toBe(0);
  });

  test("the JSON envelope carries the array in data and a count in the message", async () => {
    const inst = withResults([PAGE, PAGE]);
    const { exit, envelope } = await searchJson(inst);
    expect(exit).toBe(0);
    expect(envelope.message).toBe("2 results");
    expect(resultsOf(envelope)).toHaveLength(2);
  });

  test("a request that times out is a failure", async () => {
    const inst = instance(() => never());
    const { exit, envelope } = await searchJson(inst, "--timeout", "150");
    expect(exit).toBe(1);
    expect(envelope.code).toBe("failed");
    expect(envelope.message).toContain("no answer within 150 ms");
  });

  test("a body that never ends is a failure, not a hang", async () => {
    const inst = instance(() => stalled());
    const started = Date.now();
    const { exit, envelope } = await searchJson(inst, "--timeout", "300");
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(4_000);
    expect(exit).toBe(1);
    expect(envelope.code).toBe("failed");
    expect(envelope.message).toContain("no answer within 300 ms");
  });

  test("text mode prints one JSON array on stdout and the warnings on stderr", async () => {
    const inst = withFailedEngine("too many requests");
    const r = await searchVerb(inst);
    expect(r.exit).toBe(0);
    const printed: unknown = JSON.parse(r.stdout);
    expect(Results.parse(printed)).toHaveLength(1);
    expect(r.stdout).not.toContain("too many requests");
    expect(r.stderr).toContain("too many requests");
  });

  test("the setup verb is gone", async () => {
    const r = await run(["searxng", "setup"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("unknown verb");
    const help = await run(["searxng", "--help"]);
    expect(help.stdout).toContain("search");
    expect(help.stdout).not.toContain("setup");
  });
});

describe("qsm-web searxng search answers it cannot use", () => {
  for (const [what, build, said, hidden] of UNUSABLE) {
    test(`${what} is a failure that names the kind and keeps the body out`, async () => {
      const { exit, envelope } = await searchJson(build());
      expect(exit).toBe(1);
      expect(envelope.code).toBe("failed");
      expect(envelope.message).toContain(said);
      expect(envelope.message).not.toContain(hidden);
    });
  }
});

describe("qsm-web searxng search profiles", () => {
  const profiles = [
    ["niche", ["searchmysite", "wiby", "mwmbl", "boardreader"]],
    ["academic", ["arxiv", "crossref", "openalex", "semantic scholar", "pubmed", "europepmc"]],
    ["it", it],
    ["images", reviewed.images],
    ["videos", reviewed.videos],
    ["news", reviewed.news],
    ["music", reviewed.music],
    ["map", reviewed.map],
    ["files", reviewed.files],
    ["social-media", reviewed["social-media"]],
  ] as const;
  const niche = ["searchmysite", "wiby", "mwmbl", "boardreader"];
  const page = { ...PAGE, engine: "mwmbl", engines: ["mwmbl"], category: "general" };
  const profileNames = ["default", ...profiles.map(([profile]) => profile)];

  // Catalog shape follows SearXNG's /config response. Default-disabled engines are still loaded.
  function catalog(names: readonly string[]): Response {
    return json({ engines: names.map((name) => ({ name, enabled: false })) });
  }

  /** A preflight failure must not send a search request or retry the catalog. */
  function expectOnlyCatalog(inst: Instance): void {
    expect(inst.seen.map((url) => url.pathname)).toEqual(["/config"]);
  }

  test("default leaves server selection alone and skips the catalog", async () => {
    const inst = withResults([PAGE]);
    const r = await searchVerb(inst, "--profile", "default", "--language", "cs");
    expect(r.exit).toBe(0);
    expect(inst.seen).toHaveLength(1);
    expect(asked(inst).pathname).toBe("/search");
    expect([...asked(inst).searchParams.keys()].toSorted()).toEqual(["format", "language", "q"]);
    expect(asked(inst).searchParams.get("language")).toBe("cs");
  });

  for (const [profile, names] of profiles) {
    test(`${profile} selects exactly its registered engines without a category`, async () => {
      const inst = instance((url) =>
        url.pathname.endsWith("/config")
          ? catalog(names)
          : json({
              results: [
                {
                  ...page,
                  engine: names[0],
                  engines: [names[0]],
                  ...(profile === "images"
                    ? {
                        img_src: "https://img.test/image.png",
                        thumbnail_src: "https://img.test/thumb.png",
                      }
                    : {}),
                  ...(profile === "videos" ? { iframe_src: "https://video.test/embed/clip" } : {}),
                },
              ],
            }),
      );
      const r = await run([
        "searxng",
        "search",
        "personal websites",
        "--instance",
        `${inst.base}/searx/`,
        "--profile",
        profile,
        "--language",
        "en",
        "--time-range",
        "year",
        "--num-results",
        "1",
      ]);
      expect(r.exit).toBe(0);
      expect(inst.seen.map((url) => url.pathname)).toEqual(["/searx/config", "/searx/search"]);
      const params = inst.seen.at(1)?.searchParams;
      expect(params?.get("engines")).toBe(names.join(","));
      expect(params?.has("categories")).toBe(false);
      expect(params?.has("profile")).toBe(false);
      expect(params?.get("language")).toBe("en");
      expect(params?.get("time_range")).toBe("year");
      const results = Results.parse(JSON.parse(r.stdout));
      expect(results).toHaveLength(1);
      const [result] = results;
      expect(result?.engine).toBe(names[0]);
      expect(result?.engines).toEqual([names[0]]);
      if (profile === "images") {
        expect(result).toMatchObject({
          img_src: "https://img.test/image.png",
          thumbnail_src: "https://img.test/thumb.png",
        });
      }
      if (profile === "videos") {
        expect(result).toMatchObject({ iframe_src: "https://video.test/embed/clip" });
      }
    });
  }

  test("unknown profiles and conflicting selections fail before any request", async () => {
    const inst = withResults([PAGE]);
    for (const profile of profileNames) {
      for (const selection of [
        ["--engines", "wiby"],
        ["--engines", ""],
      ]) {
        const r = await searchVerb(inst, "--profile", profile, ...selection);
        expect(r.exit).toBe(2);
        expect(r.stderr).toContain("--profile");
      }
    }
    const unknown = await searchVerb(inst, "--profile", "unknown");
    expect(unknown.exit).toBe(2);
    expect(unknown.stderr).toContain("news");
    expect(inst.seen).toHaveLength(0);
  });

  test("category input is rejected with and without profiles before any request", async () => {
    const inst = withResults([PAGE]);
    for (const profile of [undefined, ...profileNames]) {
      for (const value of ["it", ""]) {
        const flags = profile === undefined ? [] : ["--profile", profile];
        const { exit, envelope } = await searchJson(inst, ...flags, "--category", value);
        expect(exit).toBe(2);
        expect(envelope.code).toBe("usage");
        expect(envelope.message).toContain("--category");
      }
    }
    expect(inst.seen).toHaveLength(0);
    const help = await run(["searxng", "search", "--help"]);
    expect(help.exit).toBe(0);
    expect(help.stdout).not.toContain("--category");
    expect(help.stdout).toContain("academic|it|images|videos|news|music|map|files");
  });

  for (const [profile, names] of profiles) {
    test(`one missing engine refuses the whole ${profile} profile without a search`, async () => {
      const inst = instance(() => catalog(names.slice(1)));
      const { exit, envelope } = await searchJson(inst, "--profile", profile);
      expect(exit).toBe(4);
      expect(envelope.code).toBe("missing");
      expect(envelope.message).toContain(names[0]);
      expect(envelope.message).toContain("--engines");
      expectOnlyCatalog(inst);
    });
  }

  const unusableCatalogs = [
    ["HTTP error", () => new Response("private catalog body", { status: 503 })],
    ["non-JSON", () => new Response("private catalog body")],
    ["wrong shape", () => json({ engines: [{ name: 17 }], body: "private catalog body" })],
  ] as const;
  for (const [what, response] of unusableCatalogs) {
    test(`a catalog with ${what} fails without searching or printing its body`, async () => {
      const inst = instance(() => response());
      const { exit, envelope } = await searchJson(inst, "--profile", "niche");
      expect(exit).toBe(1);
      expect(envelope.code).toBe("failed");
      expect(envelope.message).not.toContain("private catalog body");
      expectOnlyCatalog(inst);
    });
  }

  test("a stalled catalog body times out without sending a search", async () => {
    const inst = instance(() => stalled());
    const { exit, envelope } = await searchJson(inst, "--profile", "niche", "--timeout", "150");
    expect(exit).toBe(1);
    expect(envelope.message).toContain("no answer within 150 ms");
    expectOnlyCatalog(inst);
  });

  test("inventory and search share one deadline rather than receiving a budget each", async () => {
    const inst = instance(async (url) => {
      await Bun.sleep(350);
      return url.pathname === "/config" ? catalog(niche) : json({ results: [page] });
    });
    const { exit, envelope } = await searchJson(inst, "--profile", "niche", "--timeout", "600");
    expect(exit).toBe(1);
    expect(envelope.message).toContain("no answer within 600 ms");
  });

  test("provider warnings survive a successful profile preflight", async () => {
    const inst = instance((url) =>
      url.pathname === "/config"
        ? catalog(niche)
        : json({ results: [page], unresponsive_engines: [["boardreader", "timeout"]] }),
    );
    const { exit, envelope } = await searchJson(inst, "--profile", "niche");
    expect(exit).toBe(0);
    expect(resultsOf(envelope)[0]?.engines).toEqual(["mwmbl"]);
    expect(envelope.warnings.join(" ")).toContain("boardreader (timeout)");
    expect(inst.seen).toHaveLength(2);
  });

  test("news links survive a Naver timeout warning without retry or source removal", async () => {
    const names = reviewed.news;
    const inst = instance((url) =>
      url.pathname === "/config"
        ? catalog(names)
        : json({
            results: [
              {
                ...page,
                url: "https://news.test/story",
                title: "Regional news story",
                engine: "brave.news",
                engines: ["brave.news"],
                category: "news",
              },
            ],
            unresponsive_engines: [["naver news", "timeout"]],
          }),
    );
    const { exit, envelope } = await searchJson(inst, "--profile", "news");
    expect(exit).toBe(0);
    expect(envelope.code).toBe("ok");
    expect(resultsOf(envelope)).toMatchObject([
      { url: "https://news.test/story", engine: "brave.news", category: "news" },
    ]);
    expect(envelope.warnings).toContain("engine suspended: naver news (timeout)");
    expect(inst.seen.map((url) => url.pathname)).toEqual(["/config", "/search"]);
    expect(inst.seen[0]?.searchParams.has("engines")).toBe(false);
    expect(inst.seen[1]?.searchParams.get("engines")).toBe(names.join(","));
    expect(inst.seen[1]?.searchParams.has("categories")).toBe(false);
  });
});
