import { describe, expect, test } from "bun:test";
import { formatMetadata, namespaceMetadata, parseEntries, storedKeys } from "./entries.ts";

const ROWS = [
  "github-token\tqsm\tqsm-secrets",
  "npm-token\tqsm\tqsm-secrets",
  "legacy-key\tqsm\talice",
  "elsewhere\twork\tqsm-secrets",
].join("\n");

describe("parseEntries", () => {
  test("reads the three requested fields", () => {
    expect(parseEntries(ROWS)).toHaveLength(4);
    expect(parseEntries(ROWS)[0]).toEqual({
      name: "github-token",
      folder: "qsm",
      user: "qsm-secrets",
    });
  });

  test("an entry with no folder still parses", () => {
    expect(parseEntries("rootkey\t\talice")).toEqual([
      { name: "rootkey", folder: "", user: "alice" },
    ]);
  });

  test("a row that is not exactly three fields is dropped, not repaired", () => {
    expect(parseEntries("a\tb")).toEqual([]);
    expect(parseEntries("a\tb\tc\td")).toEqual([]);
    expect(parseEntries("")).toEqual([]);
  });

  test("a field carrying a control byte is dropped", () => {
    expect(parseEntries("nor\u001b[2Kmal\tqsm\tqsm-secrets")).toEqual([]);
  });
});

describe("storedKeys", () => {
  test("covers only the entries this wrapper stored", () => {
    expect(storedKeys(parseEntries(ROWS), "qsm")).toEqual(["github-token", "npm-token"]);
  });

  test("the empty namespace is the whole vault", () => {
    expect(storedKeys(parseEntries(ROWS), "")).toEqual(["elsewhere", "github-token", "npm-token"]);
  });
});

describe("namespaceMetadata", () => {
  test("covers every entry in the namespace, whoever stored it", () => {
    const rows = namespaceMetadata(parseEntries(ROWS), "qsm");
    expect(rows.map((row) => row.name)).toEqual(["github-token", "legacy-key", "npm-token"]);
    expect(rows.find((row) => row.name === "legacy-key")?.storedBy).toBe("other");
  });

  test("the printed block names the three vault fields and nothing else", () => {
    const text = formatMetadata("qsm", namespaceMetadata(parseEntries(ROWS), "qsm"));
    expect(text).toContain("name: legacy-key");
    expect(text).toContain("stored-by: other");
    // Only the four labels; a value has no line to arrive on.
    const labels = text
      .split("\n")
      .filter((line) => line.includes(":"))
      .map((line) => line.slice(0, line.indexOf(":")));
    expect([...new Set(labels)].sort()).toEqual([
      "folder",
      "name",
      "namespace",
      "stored-by",
      "user",
    ]);
  });
});
