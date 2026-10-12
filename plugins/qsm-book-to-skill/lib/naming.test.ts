import { describe, expect, test } from "bun:test";
import { resolveName, slugify, titleHint } from "./naming.ts";

describe("slugify", () => {
  test("lowercases, folds accents and collapses separators", () => {
    expect(slugify("A Philosophy of Software Désign!")).toBe("a-philosophy-of-software-design");
  });

  test("leaves nothing when the input carries no letters or digits", () => {
    expect(slugify("!!! ???")).toBe("");
  });
});

describe("resolveName", () => {
  test("a given name wins over the hint", () => {
    const result = resolveName("my-skill", "Some Book Title");
    expect(result.slug).toBe("my-skill");
    expect(result.origin).toBe("given");
    expect(result.problems).toEqual([]);
  });

  test("no given name derives one from the hint", () => {
    const result = resolveName(undefined, "The Pragmatic Programmer");
    expect(result.slug).toBe("the-pragmatic-programmer");
    expect(result.origin).toBe("derived");
  });

  test("an unusable name is a problem, not a silent fallback", () => {
    expect(resolveName(undefined, "***").problems).toHaveLength(1);
    expect(resolveName("a", "x").problems[0]).toContain("shorter than");
  });

  test("a long name is cut at a hyphen and stays usable", () => {
    const result = resolveName(undefined, "word ".repeat(40));
    expect(result.slug.length).toBeLessThanOrEqual(64);
    expect(result.slug.endsWith("-")).toBe(false);
    expect(result.problems).toEqual([]);
  });
});

describe("titleHint", () => {
  test("takes the first heading", () => {
    expect(titleHint("front matter\n\n## Real Title\nbody")).toBe("Real Title");
  });

  test("a text with no heading gives nothing", () => {
    expect(titleHint("just prose")).toBe("");
  });
});
