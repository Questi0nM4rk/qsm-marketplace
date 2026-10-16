import { describe, expect, test } from "bun:test";
import { QsmError } from "../../../lib/qsm-error.ts";
import { detectFormat, readData } from "./formats.ts";

describe("format detection", () => {
  test("the four supported extensions", () => {
    expect(detectFormat("a.json")).toBe("json");
    expect(detectFormat("a.yaml")).toBe("yaml");
    expect(detectFormat("a.yml")).toBe("yaml");
    expect(detectFormat("a.TOML")).toBe("toml");
  });

  test("anything else is unknown", () => {
    expect(detectFormat("a.md")).toBeNull();
    expect(detectFormat("a")).toBeNull();
  });
});

describe("reading a data file", () => {
  test("JSON, YAML, and TOML reach the same value", () => {
    const expected = { people: [{ id: 1, name: "Alice" }] };
    expect(readData("a.json", '{"people":[{"id":1,"name":"Alice"}]}')).toEqual(expected);
    expect(readData("a.yaml", "people:\n  - id: 1\n    name: Alice\n")).toEqual(expected);
    expect(readData("a.toml", '[[people]]\nid = 1\nname = "Alice"\n')).toEqual(expected);
  });

  test("an unsupported extension is an error naming what is supported", () => {
    expect(() => readData("a.md", "text")).toThrow(QsmError);
    expect(() => readData("a.md", "text")).toThrow(/\.json/);
  });

  test("unparseable content names the file and the format", () => {
    expect(() => readData("a.json", "{not json")).toThrow(/a\.json as json/);
  });
});
