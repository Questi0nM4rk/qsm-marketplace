import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkNoun, generateNoun, type QsmManifest, stagedPluginDirs } from "./generate-noun.ts";

const wrappers: string[] = [];
afterAll(() => {
  for (const dir of wrappers) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface Wrapper {
  readonly verbs: Record<string, unknown>;
  readonly argvOf: (row: unknown, options?: Record<string, unknown>) => string[];
}

function isWrapper(value: unknown): value is Wrapper {
  return (
    typeof value === "object" &&
    value !== null &&
    "verbs" in value &&
    "argvOf" in value &&
    typeof value.argvOf === "function"
  );
}

/** Writes a generated wrapper into a sandbox and imports it: its type-only
 * imports erase, so argvOf runs exactly as the engine would run it. */
async function loadWrapper(manifest: QsmManifest): Promise<Wrapper> {
  const dir = mkdtempSync(join(tmpdir(), "qsm-noun-wrapper-"));
  wrappers.push(dir);
  const generated = generateNoun(manifest, dir);
  mkdirSync(join(dir, "hooks"), { recursive: true });
  writeFileSync(generated.hooksPath, generated.hooksContent);
  const mod: unknown = await import(generated.hooksPath);
  if (!isWrapper(mod)) {
    throw new Error("the generated hooks module does not export the wrapper");
  }
  return mod;
}

const fixture: QsmManifest = {
  qsm: {
    bin: { "qsm-fix": "scripts/cli.ts" },
    noun: "fixture",
    commands: {
      "qsm-fix recall": {
        description: "search",
        args: [
          { name: "query", type: "string", positional: true, required: true, description: "q" },
          { name: "limit", type: "number", description: "max rows" },
          { name: "json", type: "boolean", description: "print machine JSON" },
        ],
      },
      "qsm-fix doctor": { description: "health check" },
      "qsm-fix mcp": { description: "serves over stdio", noNoun: true, args: [] },
      "qsm-fix pipe": {
        description: "runs a consumer with the value on its stdin",
        noNoun: true,
        passthrough: true,
        args: [{ name: "key", type: "string", positional: true, required: true, description: "k" }],
      },
      "qsm-fix init": {
        description: "shapes",
        passthrough: true,
        args: [
          { name: "target", type: "string", repeatable: true, description: "lang=target" },
          {
            name: "mode",
            type: "string",
            choices: ["add", "remove"],
            required: true,
            description: "m",
          },
          {
            name: "input",
            type: "string",
            positional: true,
            repeatable: true,
            description: "paths",
          },
        ],
      },
    },
  },
};

const fixtureOut = generateNoun(fixture, "plugins/qsm-fixture");

describe("generateNoun files", () => {
  test("types file names the noun on EngineInterface", () => {
    expect(fixtureOut.typesPath).toBe("plugins/qsm-fixture/types/index.d.ts");
    expect(fixtureOut.typesContent).toContain("export type Fixture = {");
    expect(fixtureOut.typesContent).toContain("interface EngineInterface");
    expect(fixtureOut.typesContent).toContain("fixture: Fixture;");
  });

  test("A verb the binary reaches only from a shell", () => {
    expect(fixtureOut.typesContent).toContain("recall(options: {");
    expect(fixtureOut.typesContent).toContain("query: string;");
    expect(fixtureOut.typesContent).toContain("limit?: number;");
    expect(fixtureOut.typesContent).not.toContain("json?:");
    expect(fixtureOut.typesContent).not.toContain("json:");
    expect(fixtureOut.typesContent).toContain("doctor(): Promise<unknown>;");
    expect(fixtureOut.typesContent).not.toContain("mcp(");
  });

  test("a noNoun verb is no method: it refuses the --json the wrapper always sends", () => {
    expect(fixtureOut.typesContent).not.toContain("pipe(");
    expect(fixtureOut.hooksContent).not.toContain('"pipe"');
  });

  test("hooks file registers its own engine.create, never taking $ as a parameter", () => {
    expect(fixtureOut.hooksPath).toBe("plugins/qsm-fixture/hooks/noun.generated.ts");
    expect(fixtureOut.hooksContent).toContain("export function registerNoun(on: On)");
    expect(fixtureOut.hooksContent).not.toContain("buildNoun");
    expect(fixtureOut.hooksContent).toContain('on("engine.create"');
    // beneath is read through its own property chain, never passed as an
    // argument (claude plugin validate refuses that).
    expect(fixtureOut.hooksContent).toContain("await beneath.process.run(argv)");
    expect(fixtureOut.hooksContent).not.toContain("(beneath");
    expect(fixtureOut.hooksContent).not.toContain('"mcp"');
  });

  test("one table row per verb, typed from the plugin's own contract", () => {
    const contract = "../types/index.d.ts";
    expect(fixtureOut.hooksContent).toContain(`import type { Fixture } from "${contract}";`);
    expect(fixtureOut.hooksContent).toContain('recall: { words: ["qsm-fix","recall"], args: [');
    expect(fixtureOut.hooksContent).toContain('{ name: "limit", flag: "--limit" }');
    expect(fixtureOut.hooksContent).toContain("Object.fromEntries(methods) as Fixture");
  });
});

describe("generateNoun argv and types", () => {
  test("argvOf builds positionals, flags, booleans, lists, and the rest in declaration order", async () => {
    const { verbs, argvOf } = await loadWrapper(fixture);
    expect(argvOf(verbs.recall, { query: "q", limit: 5 })).toEqual([
      "qsm-fix",
      "recall",
      "q",
      "--limit",
      "5",
      "--json",
    ]);
    expect(argvOf(verbs.doctor)).toEqual(["qsm-fix", "doctor", "--json"]);
    expect(
      argvOf(verbs.init, {
        target: ["a", "b"],
        mode: "add",
        input: ["x", "y"],
        rest: ["--k", "v"],
      }),
    ).toEqual([
      "qsm-fix",
      "init",
      "--target",
      "a",
      "--target",
      "b",
      "--mode",
      "add",
      "x",
      "y",
      "--",
      "--k",
      "v",
      "--json",
    ]);
  });

  test("repeatable and choices shape the types", () => {
    expect(fixtureOut.typesContent).toContain("target?: (string)[];");
    expect(fixtureOut.typesContent).toContain('mode: "add" | "remove";');
    expect(fixtureOut.typesContent).toContain("input?: (string)[];");
    expect(fixtureOut.typesContent).toContain("rest?: string[];");
  });
});

describe("generateNoun unwrap", () => {
  test("the wrapper unwraps the outcome envelope and throws on a non-ok code", () => {
    expect(fixtureOut.hooksContent).toContain('return unwrap(argv, result, row.words.join(" "));');
    expect(fixtureOut.hooksContent).toContain("if (envelope.exit !== 0)");
    expect(fixtureOut.hooksContent).toContain("return envelope.data;");
  });

  test("unwrap is exported so the noun-contract test can import it directly", () => {
    expect(fixtureOut.hooksContent).toContain("export function unwrap(");
  });

  test("empty stdout throws 'printed no envelope'", () => {
    expect(fixtureOut.hooksContent).toMatch(
      /throw new Error\(`\$\{argv\.join\(" "\)\}: printed no envelope \$\{cause\}`\);/,
    );
  });

  test("non-JSON or exit-less stdout throws 'is not an outcome envelope', never a raw JSON.parse error", () => {
    expect(fixtureOut.hooksContent).toMatch(
      /stdout is not an outcome envelope \$\{cause\}: \$\{text\.slice\(0, 200\)\}/,
    );
    expect(fixtureOut.hooksContent).toContain("try {\n    parsed = JSON.parse(text);\n  } catch {");
    expect(fixtureOut.hooksContent).toContain(
      'typeof (parsed as { exit?: unknown }).exit !== "number"',
    );
  });

  test("a non-zero exit throws '<bin verb>: <code>: <message>'", () => {
    expect(fixtureOut.hooksContent).toMatch(
      /throw new Error\(`\$\{label\}: \$\{envelope\.code\}: \$\{envelope\.message\}`\);/,
    );
  });
});

describe("generateNoun guards", () => {
  test("checkNoun names the stale files and nothing when both match", () => {
    const fresh = new Map([
      [fixtureOut.typesPath, fixtureOut.typesContent],
      [fixtureOut.hooksPath, fixtureOut.hooksContent],
    ]);
    expect(checkNoun(fixture, "plugins/qsm-fixture", (p) => fresh.get(p) ?? null).stale).toEqual(
      [],
    );
    fresh.set(fixtureOut.hooksPath, "// edited by hand\n");
    expect(checkNoun(fixture, "plugins/qsm-fixture", (p) => fresh.get(p) ?? null).stale).toEqual([
      "plugins/qsm-fixture/hooks/noun.generated.ts",
    ]);
    expect(checkNoun(fixture, "plugins/qsm-fixture", () => null).stale).toHaveLength(2);
  });

  test("throws without qsm.noun", () => {
    const nounless: QsmManifest = { qsm: { bin: { "qsm-fix": "scripts/cli.ts" }, commands: {} } };
    expect(() => generateNoun(nounless, "plugins/x")).toThrow("qsm.noun is required");
  });

  test("throws without qsm.bin", () => {
    const noBin: QsmManifest = { qsm: { noun: "x", commands: {} } };
    expect(() => generateNoun(noBin, "plugins/x")).toThrow("qsm.bin is required");
  });
});

describe("staged plugin dirs", () => {
  test("a staged qsm.json names its plugin once; other paths name none", () => {
    const staged = [
      "plugins/qsm-usage/qsm.json",
      "plugins/qsm-usage/scripts/cli.ts",
      "plugins/qsm-setup/README.md",
      "lib/qsm.json",
      "plugins/qsm-usage/lib/fixtures/qsm.json",
    ];
    expect(stagedPluginDirs(staged)).toEqual(["plugins/qsm-usage"]);
  });
});

const grouped: QsmManifest = {
  qsm: {
    bin: { "qsm-g": "scripts/cli.ts" },
    noun: "g",
    commands: {
      "qsm-g count": {
        description: "count files",
        args: [
          {
            name: "files",
            type: "string",
            positional: true,
            repeatable: true,
            description: "paths",
          },
        ],
      },
      "qsm-g toon encode": {
        description: "encode to TOON",
        args: [
          { name: "file", type: "string", positional: true, required: true, description: "input" },
        ],
      },
      "qsm-g toon decode": { description: "decode TOON" },
      "qsm-g gh pr submit-review": {
        description: "submit a review",
        args: [
          { name: "pr", type: "number", positional: true, required: true, description: "number" },
        ],
      },
    },
  },
};

describe("generateNoun with multi-word verbs", () => {
  const result = generateNoun(grouped, "plugins/qsm-g");

  test("The noun joins the words", () => {
    expect(result.typesContent).toContain("  count(options: {");
    expect(result.typesContent).toContain("  toonEncode(options: {");
    expect(result.typesContent).toContain("  toonDecode(): Promise<unknown>;");
    expect(result.typesContent).toContain("  ghPrSubmitReview(options: {");
    expect(result.typesContent).not.toContain("toon: {");
  });

  test("the wrapper runs the binary with every word of the verb", async () => {
    const { verbs, argvOf } = await loadWrapper(grouped);
    expect(argvOf(verbs.toonEncode, { file: "a.json" })).toEqual([
      "qsm-g",
      "toon",
      "encode",
      "a.json",
      "--json",
    ]);
    expect(argvOf(verbs.ghPrSubmitReview, { pr: 12 })).toEqual([
      "qsm-g",
      "gh",
      "pr",
      "submit-review",
      "12",
      "--json",
    ]);
  });

  test("Two verbs joining to one name", () => {
    const fine: QsmManifest = {
      qsm: {
        bin: { "qsm-x": "scripts/cli.ts" },
        noun: "x",
        commands: {
          "qsm-x status": { description: "s" },
          "qsm-x status show": { description: "ss" },
        },
      },
    };
    expect(generateNoun(fine, "plugins/qsm-x").typesContent).toContain("statusShow(");
    const clash: QsmManifest = {
      qsm: {
        bin: { "qsm-x": "scripts/cli.ts" },
        noun: "x",
        commands: {
          "qsm-x status show": { description: "a" },
          "qsm-x status-show": { description: "b" },
        },
      },
    };
    expect(() => generateNoun(clash, "plugins/qsm-x")).toThrow("both become the method statusShow");
  });
});

describe("the wrapper's shape", () => {
  test("the file does not grow a function per verb", () => {
    const small = generateNoun(fixture, "plugins/qsm-fixture").hooksContent;
    const large = generateNoun(grouped, "plugins/qsm-g").hooksContent;
    const functions = (text: string) => (text.match(/function |=> /g) ?? []).length;
    expect(functions(large)).toBe(functions(small));
  });
});
