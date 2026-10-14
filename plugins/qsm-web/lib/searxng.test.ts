import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSearchUrl,
  configPath,
  DEFAULT_CONFIG,
  EXIT,
  formatResults,
  loadConfig,
  readResponse,
  resolveInstance,
  runSetup,
  writeConfig,
} from "./searxng.ts";

const sandboxes: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "qsm-web-searxng-"));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  while (sandboxes.length > 0) {
    rmSync(sandboxes.pop() ?? "", { recursive: true, force: true });
  }
});

describe("configPath", () => {
  test("the override wins, otherwise it sits under the home config directory", () => {
    expect(configPath("/tmp/one.json", "/home/one")).toBe("/tmp/one.json");
    expect(configPath(undefined, "/home/one")).toBe("/home/one/.config/qsm-searxng/config.json");
  });
});

describe("loadConfig", () => {
  test("a missing file warns and falls back to the defaults", () => {
    const path = join(sandbox(), "config.json");
    const { config, warnings } = loadConfig(path);
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(warnings[0]).toContain(path);
  });

  test("a written config round-trips", () => {
    const path = join(sandbox(), "config.json");
    writeConfig({ ...DEFAULT_CONFIG, instance: "https://search.test" }, path);
    expect(loadConfig(path).config.instance).toBe("https://search.test");
  });

  test("a broken file warns instead of throwing", () => {
    const path = join(sandbox(), "config.json");
    writeFileSync(path, "{not json");
    const { config, warnings } = loadConfig(path);
    expect(config.instance).toBe("");
    expect(warnings).toHaveLength(1);
  });
});

describe("resolveInstance", () => {
  test("the flag beats the environment, which beats the file", () => {
    const config = { ...DEFAULT_CONFIG, instance: "https://file.test" };
    expect(resolveInstance(config, "https://flag.test", "https://env.test")).toBe(
      "https://flag.test",
    );
    expect(resolveInstance(config, undefined, "https://env.test")).toBe("https://env.test");
    expect(resolveInstance(config, undefined, undefined)).toBe("https://file.test");
  });

  test("nothing configured anywhere is the empty string", () => {
    expect(resolveInstance(DEFAULT_CONFIG, undefined, undefined)).toBe("");
  });
});

describe("buildSearchUrl", () => {
  test("every narrowing flag reaches the query, and the format is always json", () => {
    const url = new URL(
      buildSearchUrl("https://search.test/", {
        query: "io uring",
        numResults: 5,
        engines: ["duckduckgo", "google"],
        timeRange: "week",
        category: "it",
        language: "en",
        safesearch: 0,
      }),
    );
    expect(url.origin).toBe("https://search.test");
    expect(url.searchParams.get("q")).toBe("io uring");
    expect(url.searchParams.get("format")).toBe("json");
    expect(url.searchParams.get("engines")).toBe("duckduckgo,google");
    expect(url.searchParams.get("time_range")).toBe("week");
    expect(url.searchParams.get("categories")).toBe("it");
    expect(url.searchParams.get("language")).toBe("en");
    expect(url.searchParams.get("safesearch")).toBe("0");
  });

  test("an unset narrowing flag is absent, not empty", () => {
    const url = new URL(
      buildSearchUrl("https://search.test", { query: "q", numResults: 1, engines: [] }),
    );
    expect(url.searchParams.has("engines")).toBe(false);
    expect(url.searchParams.has("safesearch")).toBe(false);
  });
});

describe("readResponse", () => {
  test("An engine is suspended", () => {
    const outcome = readResponse(
      {
        results: [{ url: "https://a.test", title: "A", engine: "duckduckgo" }],
        unresponsive_engines: [["google", "timeout"]],
      },
      10,
    );
    expect(outcome.results).toHaveLength(1);
    expect(outcome.warnings).toEqual(["engine suspended: google (timeout)"]);
  });

  test("A query returns results from multiple engines", () => {
    const outcome = readResponse(
      { results: [{ url: "https://a.test", engines: ["duckduckgo", "google"] }] },
      10,
    );
    expect(outcome.results[0]?.engines).toEqual(["duckduckgo", "google"]);
    expect(outcome.results[0]?.publishedDate).toBeNull();
    expect(outcome.results[0]?.category).toBe("general");
  });

  test("the result count is a ceiling", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ url: `https://a.test/${i}` }));
    expect(readResponse({ results: many }, 3).results).toHaveLength(3);
  });
});

describe("formatResults", () => {
  test("stdout is a JSON array a parser can read", () => {
    const text = formatResults(readResponse({ results: [{ url: "https://a.test" }] }, 5).results);
    expect(Array.isArray(JSON.parse(text))).toBe(true);
  });
});

/** Answers in order, and what was asked, so a test can read the prompt. */
function scripted(answers: string[]): {
  io: { ask: (p: string) => Promise<string>; note: (l: string) => void };
  prompts: string[];
  notes: string[];
} {
  const prompts: string[] = [];
  const notes: string[] = [];
  const queue = [...answers];
  return {
    io: {
      ask: (prompt: string) => {
        prompts.push(prompt);
        return Promise.resolve(queue.shift() ?? "");
      },
      note: (line: string) => {
        notes.push(line);
      },
    },
    prompts,
    notes,
  };
}

describe("runSetup", () => {
  test("no config yet: the answers are written with no confirmation asked", async () => {
    const path = join(sandbox(), "config.json");
    const { io, prompts } = scripted(["https://search.test", "duckduckgo, mojeek"]);
    expect(await runSetup(path, io)).toBe(0);
    expect(prompts.some((p) => p.includes("Replace"))).toBe(false);
    const written: unknown = JSON.parse(readFileSync(path, "utf8"));
    expect(written).toMatchObject({
      instance: "https://search.test",
      defaultEngines: ["duckduckgo", "mojeek"],
    });
  });

  test("a config that is present but names no instance is still guarded", async () => {
    const path = join(sandbox(), "config.json");
    writeFileSync(path, JSON.stringify({ defaultNumResults: 25 }));
    const before = readFileSync(path, "utf8");
    const { io, prompts } = scripted(["n"]);
    expect(await runSetup(path, io)).toBe(0);
    expect(prompts[0]).toContain("already exists");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  test("Setup run with an existing config", async () => {
    const path = join(sandbox(), "config.json");
    writeConfig({ ...DEFAULT_CONFIG, instance: "https://old.test" }, path);
    const before = readFileSync(path, "utf8");
    const { io, notes } = scripted(["", "https://new.test"]);
    expect(await runSetup(path, io)).toBe(0);
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(notes.join("")).toContain("untouched");
  });

  test("accepting replaces the instance and keeps the rest of the config", async () => {
    const path = join(sandbox(), "config.json");
    writeConfig({ ...DEFAULT_CONFIG, instance: "https://old.test", timeoutMs: 42 }, path);
    const { io } = scripted(["y", "https://new.test", ""]);
    expect(await runSetup(path, io)).toBe(0);
    const written: unknown = JSON.parse(readFileSync(path, "utf8"));
    expect(written).toMatchObject({
      instance: "https://new.test",
      timeoutMs: 42,
      defaultEngines: [...DEFAULT_CONFIG.defaultEngines],
    });
  });

  test("no instance given and none on file writes nothing and exits non-zero", async () => {
    const path = join(sandbox(), "config.json");
    const { io } = scripted([""]);
    expect(await runSetup(path, io)).toBe(EXIT.noInstance);
    expect(existsSync(path)).toBe(false);
  });
});
