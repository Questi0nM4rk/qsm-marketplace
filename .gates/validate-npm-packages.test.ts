import { expect, test } from "bun:test";
import { sandboxDir, writeIn } from "../lib/fixtures/sandbox.ts";
import { importFindings, pinFindings } from "./validate-npm-packages.ts";

const pkg = (deps: Record<string, string>): string => JSON.stringify({ dependencies: deps });

test("fails a range, a package at two versions, an undeclared import and a bare import in lib", () => {
  const dir = sandboxDir("deps-gate-");
  writeIn(dir, "package.json", pkg({}));
  writeIn(dir, "plugins/a/package.json", pkg({ zod: "^4.6.7", left: "1.0.0" }));
  writeIn(dir, "plugins/b/package.json", pkg({ left: "2.0.0" }));
  writeIn(
    dir,
    "plugins/b/lib/x.ts",
    'import { z } from "zod";\nimport "node:fs";\nexport const x = z;\n',
  );
  writeIn(dir, "lib/y.ts", 'import { z } from "zod";\nexport const y = z;\n');

  const findings = [...pinFindings(dir), ...importFindings(dir)];
  expect(findings.some((f) => f.includes('zod is "^4.6.7"'))).toBe(true);
  expect(findings.some((f) => f.startsWith("left is at 2 versions"))).toBe(true);
  expect(findings.some((f) => f.includes("plugins/b/lib/x.ts: imports zod"))).toBe(true);
  expect(findings.some((f) => f.includes("lib/y.ts: root lib/ imports zod"))).toBe(true);
  expect(findings).toHaveLength(4);
});

test("passes exact pins, declared imports, node:, bun: and harness imports", () => {
  const dir = sandboxDir("deps-gate-");
  writeIn(dir, "package.json", pkg({}));
  writeIn(dir, "plugins/a/package.json", pkg({ "@scope/pkg": "1.0.0-beta.1" }));
  writeIn(
    dir,
    "plugins/a/lib/x.ts",
    'import { a } from "@scope/pkg/sub";\nimport "bun:test";\nimport "claude-code/testing";\nimport "node:fs";\nexport const x = a;\n',
  );
  expect([...pinFindings(dir), ...importFindings(dir)]).toEqual([]);
});
