// Pure string work: nothing here touches the filesystem, so no sandbox is needed.

import { describe, expect, test } from "bun:test";
import { cacheRoot, pathHash } from "./paths.ts";

describe("cacheRoot", () => {
  test("the environment overrides the cache root", () => {
    expect(cacheRoot({ HOME: "/home/u", QSM_INDEX_CACHE_DIR: "/c" })).toBe("/c");
  });

  test("without an override the cache sits under HOME", () => {
    expect(cacheRoot({ HOME: "/home/u" })).toBe("/home/u/.cache/qsm-index");
  });
});

describe("pathHash", () => {
  test("is a stable short hex digest of the path", () => {
    expect(pathHash("/a/b")).toMatch(/^[a-f0-9]{12}$/);
    expect(pathHash("/a/b")).toBe(pathHash("/a/b"));
    expect(pathHash("/a/b")).not.toBe(pathHash("/a/c"));
  });
});
