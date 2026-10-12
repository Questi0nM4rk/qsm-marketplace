import { describe, expect, test } from "bun:test";
import { applyEdit, checkManifest, denial, isManifestPath } from "./manifest-check.ts";

/** A manifest that passes every check; each test spoils one field of it. */
const VALID = {
  name: "qsm-example",
  version: "0.1.0",
  description: "One capability, described in one sentence.",
  author: { name: "qsm" },
  keywords: ["example"],
};

function manifest(patch: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...VALID, ...patch });
}

describe("isManifestPath", () => {
  test("a plugin manifest, whatever directory holds it", () => {
    expect(isManifestPath("plugins/qsm-example/.claude-plugin/plugin.json")).toBe(true);
    expect(isManifestPath("/tmp/plugin.json")).toBe(true);
  });

  test("a file that is not named plugin.json", () => {
    expect(isManifestPath("plugins/qsm-example/qsm.json")).toBe(false);
    expect(isManifestPath("plugins/qsm-example/README.md")).toBe(false);
    expect(isManifestPath("plugins/my-plugin.json")).toBe(false);
  });
});

describe("checkManifest", () => {
  test("a manifest with a valid name, version, description, author, and keywords passes", () => {
    expect(checkManifest(manifest())).toEqual([]);
  });

  test("an author given as a plain name passes", () => {
    expect(checkManifest(manifest({ author: "qsm" }))).toEqual([]);
  });

  test("hooks set to null is reported as a key to omit", () => {
    const found = checkManifest(manifest({ hooks: null }));
    expect(found).toHaveLength(1);
    expect(found[0]).toBe("hooks must be omitted rather than set to null");
  });

  test("hooks pointing at a json file passes, and any other value does not", () => {
    expect(checkManifest(manifest({ hooks: "./hooks/hooks.json" }))).toEqual([]);
    expect(checkManifest(manifest({ hooks: "./hooks" }))).toHaveLength(1);
  });

  test("a name that is not kebab-case", () => {
    expect(checkManifest(manifest({ name: "QSM_Example" }))[0]).toContain("kebab-case");
  });

  test("a version that is not a dotted triple", () => {
    expect(checkManifest(manifest({ version: "v1" }))[0]).toContain("dotted triple");
  });

  test("an empty description", () => {
    expect(checkManifest(manifest({ description: "   " }))[0]).toContain("description");
  });

  test("an author that names nobody", () => {
    expect(checkManifest(manifest({ author: {} }))[0]).toContain("author");
  });

  test("keywords that are not an array of strings", () => {
    expect(checkManifest(manifest({ keywords: "example" }))[0]).toContain("array of strings");
    expect(checkManifest(manifest({ keywords: ["ok", 7] }))[0]).toContain("must be a string");
  });

  test("every violation is reported, not the first one alone", () => {
    const found = checkManifest(JSON.stringify({ name: "Bad Name", hooks: null }));
    expect(found).toHaveLength(6);
    expect(found.join("\n")).toContain("kebab-case");
    expect(found.join("\n")).toContain("version");
    expect(found.join("\n")).toContain("description");
    expect(found.join("\n")).toContain("author");
    expect(found.join("\n")).toContain("keywords");
    expect(found.join("\n")).toContain("null");
  });

  test("text that is not JSON", () => {
    expect(checkManifest("{ name: qsm }")[0]).toContain("not valid JSON");
  });

  test("JSON that is not an object", () => {
    expect(checkManifest("[]")[0]).toContain("must be a JSON object");
  });
});

describe("applyEdit", () => {
  test("replaces the first occurrence by default", () => {
    expect(applyEdit("a b a", "a", "c")).toBe("c b a");
  });

  test("replaces every occurrence when asked", () => {
    expect(applyEdit("a b a", "a", "c", true)).toBe("c b c");
  });

  test("returns null when the old text is not there", () => {
    expect(applyEdit("a b", "z", "c")).toBeNull();
  });

  test("returns null for an empty old text, which is in every string", () => {
    expect(applyEdit("a b", "", "c")).toBeNull();
    expect(applyEdit("a b", "", "c", true)).toBeNull();
  });

  test("a replacement pattern is copied verbatim, as the Edit tool copies it", () => {
    expect(applyEdit("a d a", "d", "$&x")).toBe("a $&x a");
    expect(applyEdit("a d a", "d", "$`$'$$")).toBe("a $`$'$$ a");
    expect(applyEdit("a d a d", "d", "$&", true)).toBe("a $& a $&");
  });

  test("an edit that spoils a valid manifest is caught through the applied text", () => {
    const before = manifest();
    const after = applyEdit(before, '"version":"0.1.0"', '"version":"v1"');
    expect(after).not.toBeNull();
    expect(checkManifest(after ?? "")[0]).toContain("dotted triple");
  });
});

describe("denial", () => {
  test("names the file, counts the violations, and lists each one", () => {
    const text = denial("a/plugin.json", ["first", "second"]);
    expect(text).toContain("a/plugin.json: 2 violations");
    expect(text).toContain("  - first");
    expect(text).toContain("  - second");
  });

  test("one violation is counted in the singular", () => {
    expect(denial("a/plugin.json", ["only"])).toContain("1 violation");
  });
});
