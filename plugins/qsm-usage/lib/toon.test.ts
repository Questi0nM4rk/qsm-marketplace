import { describe, expect, test } from "bun:test";
import { decode, ToonDecodeError } from "./toon-decode.ts";
import { encode, tableColumns } from "./toon-encode.ts";

/** The only property that matters: what the encoder writes, the decoder reads
 * back unchanged. */
function roundTrip(value: unknown): unknown {
  return decode(encode(value));
}

describe("uniform array of objects", () => {
  const rows = [
    { id: 1, name: "Alice", admin: true },
    { id: 2, name: "Bob", admin: false },
  ];

  test("names the shared columns once", () => {
    expect(encode({ users: rows })).toBe(
      ["users[2]{id,name,admin}:", "  1,Alice,true", "  2,Bob,false"].join("\n"),
    );
  });

  test("round trips", () => {
    expect(roundTrip({ users: rows })).toEqual({ users: rows });
  });

  test("a root array needs no key", () => {
    expect(encode(rows).startsWith("[2]{id,name,admin}:")).toBe(true);
    expect(roundTrip(rows)).toEqual(rows);
  });

  test("differing keys are not a table", () => {
    expect(tableColumns([{ a: 1 }, { b: 2 }])).toBeNull();
    expect(roundTrip([{ a: 1 }, { b: 2 }])).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test("a nested value is not a table", () => {
    const mixed = [{ a: { b: 1 } }, { a: { b: 2 } }];
    expect(tableColumns(mixed)).toBeNull();
    expect(roundTrip(mixed)).toEqual(mixed);
  });
});

describe("round trips of every shape", () => {
  const cases: Record<string, unknown> = {
    scalars: { s: "text", n: -2.5, t: true, f: false, nil: null, empty: "" },
    "strings that look like literals": { a: "true", b: "12", c: "null", d: "-5" },
    "strings with structure": { a: "a,b", b: "k: v", c: 'say "hi"', d: "  padded  ", e: "- dash" },
    "primitive arrays": { tags: ["a", "b"], numbers: [1, 2, 3], empty: [] },
    "nested objects": { outer: { inner: { deep: 1 } }, sibling: 2 },
    "empty object": { it: {} },
    "mixed array": { items: [1, { a: 1, b: 2 }, ["x", "y"], null] },
    "array of arrays": { grid: [[1, 2], [3]] },
    "keys needing quotes": { "a:b": 1, "c,d": 2, "": 3 },
  };

  for (const [name, value] of Object.entries(cases)) {
    test(name, () => {
      expect(roundTrip(value)).toEqual(value);
    });
  }

  test("a bare scalar document", () => {
    expect(roundTrip("hello")).toBe("hello");
  });

  test("an empty document is an empty object", () => {
    expect(encode({})).toBe("");
    expect(decode("")).toEqual({});
  });
});

describe("decode rejects a broken document", () => {
  test("a row count that does not match its rows", () => {
    expect(() => decode("users[3]{id}:\n  1\n  2")).toThrow(ToonDecodeError);
  });

  test("a row with the wrong number of cells", () => {
    expect(() => decode("users[1]{id,name}:\n  1")).toThrow(ToonDecodeError);
  });

  test("an array whose declared length is wrong", () => {
    expect(() => decode("tags[3]: a,b")).toThrow(ToonDecodeError);
  });

  test("a line that is not an entry", () => {
    expect(() => decode("a: 1\nnot an entry here")).toThrow(ToonDecodeError);
  });

  test("the error names the line", () => {
    expect(() => decode("tags[3]: a,b")).toThrow(/line 1/);
  });
});
