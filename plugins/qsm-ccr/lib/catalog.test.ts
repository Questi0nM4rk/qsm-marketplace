import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { sandboxDir, writeIn } from "../../../lib/fixtures/sandbox.ts";
import { DAY_MS, defaultModel, isOlderThanOneDay, listedModels, readCatalog } from "./catalog.ts";

const MODELS = [
  { slug: "b", visibility: "list", priority: 2, contextWindow: 200 },
  { slug: "hidden", visibility: "hide", priority: 0 },
  { slug: "a", visibility: "list", priority: 1, contextWindow: 100 },
];

describe("the catalog", () => {
  test("listed models are the visibility: list ones in priority order", () => {
    expect(listedModels(MODELS).map((m) => m.slug)).toEqual(["a", "b"]);
  });

  test("the default is the first listed model, never a hidden one of lower priority", () => {
    expect(defaultModel(MODELS)?.slug).toBe("a");
  });

  test("readCatalog maps context_window and parses fetched_at", () => {
    const home = sandboxDir("qsm-ccr-cat-");
    writeIn(
      home,
      "models_cache.json",
      JSON.stringify({
        fetched_at: "2026-10-01T00:00:00Z",
        models: [{ slug: "a", visibility: "list", priority: 1, context_window: 100 }],
      }),
    );
    const c = readCatalog(home);
    expect(c?.models).toEqual([{ slug: "a", visibility: "list", priority: 1, contextWindow: 100 }]);
    expect(c?.fetchedAt).toBe(Date.parse("2026-10-01T00:00:00Z"));
    expect(c?.path).toBe(join(home, "models_cache.json"));
  });

  test("a cache that does not parse is read as unreadable, naming its path, never thrown", () => {
    const home = sandboxDir("qsm-ccr-cat-");
    writeIn(home, "models_cache.json", "{ not json");
    const c = readCatalog(home);
    expect(c?.readable).toBe(false);
    expect(c?.models).toEqual([]);
    expect(c?.path).toBe(join(home, "models_cache.json"));
  });

  test("no cache file is null", () => {
    expect(readCatalog(sandboxDir("qsm-ccr-cat-"))).toBeNull();
  });

  test("a day is the freshness line, and an unreadable time is old", () => {
    expect(isOlderThanOneDay(1000, 1000 + DAY_MS)).toBe(false);
    expect(isOlderThanOneDay(1000, 1001 + DAY_MS)).toBe(true);
    expect(isOlderThanOneDay(Number.NaN, 0)).toBe(true);
    expect(isOlderThanOneDay(undefined, 0)).toBe(true);
  });
});
