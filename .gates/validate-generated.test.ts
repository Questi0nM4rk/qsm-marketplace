import { describe, expect, test } from "bun:test";
import { generateNoun } from "../lib/generate-noun.ts";
import type { QsmManifest } from "../lib/qsm-manifest.ts";
import { generatedFindings } from "./validate-generated.ts";

const DIR = "/repo/plugins/qsm-fix";
const manifest: QsmManifest = {
  qsm: {
    bin: { "qsm-fix": "scripts/cli.ts" },
    noun: "fix",
    commands: {
      "qsm-fix ping": { description: "pong", args: [] },
      "qsm-fix doctor": { description: "health", args: [] },
    },
  },
};
const fresh = generateNoun(manifest, DIR);
const committed = new Map([
  [fresh.typesPath, fresh.typesContent],
  [fresh.hooksPath, fresh.hooksContent],
]);
const files = (over: Partial<Parameters<typeof generatedFindings>[1]> = {}) => ({
  manifest,
  pluginJson: { types: "./types/index.d.ts" },
  readFile: (p: string) => committed.get(p) ?? null,
  ...over,
});

describe("generated gate", () => {
  test("a plugin whose files match is clean", () => {
    expect(generatedFindings(DIR, files())).toEqual([]);
  });

  test("a plugin without a bin is out of scope", () => {
    const noBin: QsmManifest = { qsm: { commands: {} } };
    expect(generatedFindings(DIR, files({ manifest: noBin }))).toEqual([]);
  });

  test("A verb is added to qsm.json without regenerating", () => {
    const edited = new Map([...committed, [fresh.hooksPath, "// hand-edited\n"]]);
    edited.delete(fresh.typesPath);
    const out = generatedFindings(DIR, files({ readFile: (p) => edited.get(p) ?? null }));
    expect(out).toEqual([
      "qsm-fix: /repo/plugins/qsm-fix/types/index.d.ts is missing; run bun lib/generate-noun.ts /repo/plugins/qsm-fix",
      "qsm-fix: /repo/plugins/qsm-fix/hooks/noun.generated.ts is stale; run bun lib/generate-noun.ts /repo/plugins/qsm-fix",
    ]);
  });

  test("A binary declares no commands", () => {
    const odd: QsmManifest = {
      qsm: {
        bin: { "qsm-fix": "a.ts", "qsm-gl": "b.ts" },
        noun: "fix",
        commands: {
          "qsm-fix ping": { description: "pong" },
          "qsm-other x": { description: "?" },
        },
      },
    };
    const out = generatedFindings(DIR, files({ manifest: odd, pluginJson: {} }));
    expect(out).toContain("qsm-fix: bin qsm-gl declares no commands");
    expect(out).toContain('qsm-fix: command "qsm-other x" names a bin qsm.bin does not declare');
    expect(out).toContain('qsm-fix: plugin.json must name "types": "./types/index.d.ts"');
  });

  test("A binary with no doctor", () => {
    const noDoctor: QsmManifest = {
      qsm: { ...manifest.qsm, commands: { "qsm-fix ping": { description: "pong" } } },
    };
    expect(generatedFindings(DIR, files({ manifest: noDoctor }))).toContain(
      "qsm-fix: its binary qsm-fix has no doctor verb",
    );
  });

  test("a bin without a noun cannot be generated", () => {
    const noNoun: QsmManifest = {
      qsm: {
        bin: { "qsm-fix": "a.ts" },
        commands: { "qsm-fix p": { description: "d" }, "qsm-fix doctor": { description: "h" } },
      },
    };
    expect(generatedFindings(DIR, files({ manifest: noNoun }))).toEqual([
      "qsm-fix: qsm.noun is required for a plugin with a bin",
    ]);
  });
});

describe("one binary per plugin", () => {
  test("A second binary", () => {
    const two: QsmManifest = {
      qsm: {
        bin: { "qsm-fix": "a.ts", "qsm-fix-mcp": "b.ts" },
        noun: "fix",
        commands: {
          "qsm-fix ping": { description: "p" },
          "qsm-fix-mcp serve": { description: "s" },
        },
      },
    };
    expect(generatedFindings(DIR, files({ manifest: two }))).toContain(
      "qsm-fix: ships one binary, not qsm-fix, qsm-fix-mcp",
    );
    const misnamed: QsmManifest = {
      qsm: {
        bin: { "qsm-other": "a.ts" },
        noun: "fix",
        commands: { "qsm-other p": { description: "d" } },
      },
    };
    expect(generatedFindings(DIR, files({ manifest: misnamed }))).toContain(
      "qsm-fix: its binary qsm-other is not named after the plugin (qsm-fix)",
    );
    expect(generatedFindings(DIR, files({ manifest }))).toEqual([]);
  });

  test("A noun not named after the plugin", () => {
    const misnamed: QsmManifest = { qsm: { ...manifest.qsm, noun: "fixer" } };
    expect(generatedFindings(DIR, files({ manifest: misnamed }))).toContain(
      "qsm-fix: its noun fixer is not named after the plugin (fix)",
    );
  });

  test("A plugin name of several words is one camelCase noun", () => {
    const dir = "/repo/plugins/qsm-book-to-skill";
    const book: QsmManifest = {
      qsm: {
        bin: { "qsm-book-to-skill": "a.ts" },
        noun: "book",
        commands: { "qsm-book-to-skill p": { description: "d" } },
      },
    };
    expect(generatedFindings(dir, files({ manifest: book }))).toContain(
      "qsm-book-to-skill: its noun book is not named after the plugin (bookToSkill)",
    );
  });
});
