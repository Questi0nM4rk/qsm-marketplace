import { expect, test } from "bun:test";
import { sandboxDir, writeIn } from "../lib/fixtures/sandbox.ts";
import { helperFindings } from "./validate-no-private-helpers.ts";

// built from parts so this file's own text holds none of the patterns the gate looks for
const SPREAD = ["...process", ".env"].join("");
const XDG = ["XDG_", "DATA_HOME"].join("");
const HOME = ["home", "dir()"].join("");
const INLINE = ["e instanceof Error ? e.message", " : String(e)"].join("");

test("finds a copied helper, a variable read by name and an env spread, outside the hooks sandbox", () => {
  const dir = sandboxDir("helpers-gate-");
  writeIn(dir, "lib/paths.ts", `export const p = process.env.${XDG};\n`);
  writeIn(
    dir,
    "plugins/a/lib/x.ts",
    `function onPath() {}\nexport const d = process.env.${XDG};\n`,
  );
  writeIn(dir, "plugins/a/lib/h.ts", `export const h = ${HOME};\n`);
  writeIn(dir, "plugins/a/lib/m.ts", `export const m = (e: unknown) => ${INLINE};\n`);
  writeIn(dir, "plugins/a/lib/x.test.ts", `export const e = { ${SPREAD} };\n`);
  writeIn(dir, "plugins/a/hooks/own.ts", "export function messageOf() {}\n");
  writeIn(dir, "plugins/a/hooks/tsconfig.json", '{ "include": ["own.ts"] }');

  const findings = helperFindings(dir);
  expect(findings).toHaveLength(5);
  expect(findings.some((f) => f.includes("x.ts: defines onPath"))).toBe(true);
  expect(
    findings.some((f) => f.includes("x.ts: reads HOME, CLAUDE_CONFIG_DIR or XDG_* by name")),
  ).toBe(true);
  expect(findings.some((f) => f.includes("h.ts: reads HOME"))).toBe(true);
  expect(findings.some((f) => f.includes("m.ts: writes messageOf's body inline"))).toBe(true);
  expect(findings.some((f) => f.includes("x.test.ts: spreads the whole environment"))).toBe(true);
});
