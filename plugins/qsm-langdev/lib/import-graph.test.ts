// The import graph, proved against real files on disk. Every tree is a
// sandbox under the system temp directory, removed after each test whether
// the test passed or failed; the graph's cache lives inside the sandbox.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildGraph, type ImportGraph, within } from "./import-graph.ts";

const sandboxes: string[] = [];

afterEach(() => {
  while (sandboxes.length > 0) {
    rmSync(sandboxes.pop() ?? "", { recursive: true, force: true });
  }
});

/** A sandbox holding `files`, and its root. */
function treeWith(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "qsm-langdev-graph-"));
  sandboxes.push(root);
  write(root, files);
  return root;
}

function write(root: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
}

/** The graph over every file of the sandbox that the test named. */
function graphOf(files: Record<string, string>): Promise<ImportGraph> {
  const root = treeWith(files);
  return buildGraph(root, Object.keys(files));
}

function importsOf(graph: ImportGraph, file: string): readonly string[] {
  return graph.edges.get(file) ?? [];
}

describe("the spec's scenarios", () => {
  test("A relative import", async () => {
    const graph = await graphOf({
      "a.ts": "export const x = 1;\n",
      "b.ts": 'import { x } from "./a";\nx;\n',
    });
    expect(importsOf(graph, "b.ts")).toEqual(["a.ts"]);
  });

  test("A package import", async () => {
    const graph = await graphOf({ "b.ts": 'import { z } from "zod";\nz;\n' });
    expect(importsOf(graph, "b.ts")).toEqual([]);
  });
});

describe("the TypeScript and JavaScript extractor", () => {
  test("require, dynamic import and export-from are edges", async () => {
    const graph = await graphOf({
      "src/main.ts": [
        'const c = require("./c");',
        'export { y } from "../lib/y";',
        'await import("./d.js");',
        "c;",
      ].join("\n"),
      "src/c.cjs": "module.exports = 1;\n",
      "lib/y.tsx": "export const y = 1;\n",
      "src/d.js": "export {};\n",
    });
    expect([...importsOf(graph, "src/main.ts")].sort()).toEqual([
      "lib/y.tsx",
      "src/c.cjs",
      "src/d.js",
    ]);
  });

  test("a directory import resolves to its index file", async () => {
    const graph = await graphOf({
      "main.ts": 'import { a } from "./pkg";\na;\n',
      "pkg/index.ts": "export const a = 1;\n",
    });
    expect(importsOf(graph, "main.ts")).toEqual(["pkg/index.ts"]);
  });

  test("a builtin, and a relative path to nothing, are no edges", async () => {
    const graph = await graphOf({
      "main.ts": 'import { join } from "node:path";\nimport { m } from "./missing";\njoin(m);\n',
    });
    expect(importsOf(graph, "main.ts")).toEqual([]);
  });

  test("a relative path that leaves the repository is no edge", async () => {
    // The sandbox holds the repository and, beside it, the file it reaches for.
    const sandbox = treeWith({
      "repo/main.ts": 'const o = require("../outside");\no;\n',
      "outside.ts": "",
    });
    const graph = await buildGraph(join(sandbox, "repo"), ["main.ts"]);
    expect(importsOf(graph, "main.ts")).toEqual([]);
  });

  test("a file the transpiler cannot read is named, never read as no imports", async () => {
    const graph = await graphOf({ "broken.ts": "import { from ;;; \n" });
    expect(graph.failed.map((f) => f.file)).toEqual(["broken.ts"]);
    expect(graph.edges.has("broken.ts")).toBe(false);
  });
});

describe("the Python extractor", () => {
  test("a relative from-import resolves against the importing file", async () => {
    const graph = await graphOf({
      "pkg/sub/mod.py": "from .x import y\nfrom ..core import z\n",
      "pkg/sub/x.py": "y = 1\n",
      "pkg/core.py": "z = 1\n",
    });
    expect([...importsOf(graph, "pkg/sub/mod.py")].sort()).toEqual(["pkg/core.py", "pkg/sub/x.py"]);
  });

  test("an absolute import resolves against the repository root", async () => {
    const graph = await graphOf({
      "app/main.py": "import util.text\nfrom util.io import read\n",
      "util/text.py": "",
      "util/io.py": "def read(): pass\n",
    });
    expect([...importsOf(graph, "app/main.py")].sort()).toEqual(["util/io.py", "util/text.py"]);
  });

  test("a package import resolves to its __init__.py", async () => {
    const graph = await graphOf({
      "main.py": "import pkg\nfrom . import helpers\n",
      "pkg/__init__.py": "",
      "helpers/__init__.py": "",
    });
    expect([...importsOf(graph, "main.py")].sort()).toEqual([
      "helpers/__init__.py",
      "pkg/__init__.py",
    ]);
  });

  test("an imported name that is a submodule is an edge to it", async () => {
    const graph = await graphOf({
      "main.py": "from pkg import tools as t, other\n",
      "pkg/__init__.py": "",
      "pkg/tools.py": "",
    });
    expect([...importsOf(graph, "main.py")].sort()).toEqual(["pkg/__init__.py", "pkg/tools.py"]);
  });

  test("a standard library or installed package import is no edge", async () => {
    const graph = await graphOf({
      "main.py": "import os, sys\nfrom collections import OrderedDict\n",
    });
    expect(importsOf(graph, "main.py")).toEqual([]);
  });
});

describe("files within N edges", () => {
  // c imports b, b imports a: the spec's changed+N scenario.
  const chain = {
    "a.ts": "export const a = 1;\n",
    "b.ts": 'import { a } from "./a";\nexport const b = a;\n',
    "c.ts": 'import { b } from "./b";\nb;\n',
  };

  test("N = 0 is the given set itself", async () => {
    expect(within(await graphOf(chain), ["a.ts"], 0)).toEqual(["a.ts"]);
  });

  test("N = 1 reaches the importer of a changed file, not its importer's importer", async () => {
    expect(within(await graphOf(chain), ["a.ts"], 1)).toEqual(["a.ts", "b.ts"]);
  });

  test("N = 1 reaches what a file imports, too", async () => {
    expect(within(await graphOf(chain), ["c.ts"], 1)).toEqual(["b.ts", "c.ts"]);
  });

  test("N = 2 reaches two edges out", async () => {
    expect(within(await graphOf(chain), ["a.ts"], 2)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  test("a cycle ends the walk", async () => {
    const graph = await graphOf({
      "a.ts": 'import { b } from "./b";\nexport const a = b;\n',
      "b.ts": 'import { a } from "./a";\nexport const b = a;\n',
    });
    expect(within(graph, ["a.ts"], 10)).toEqual(["a.ts", "b.ts"]);
  });
});

describe("the cache per file content", () => {
  test("an unchanged file is not parsed again, a changed one is", async () => {
    const files = { "a.ts": "export const a = 1;\n", "b.ts": 'import { a } from "./a";\na;\n' };
    const root = treeWith(files);

    const first = await buildGraph(root, Object.keys(files));
    expect([...first.parsed].sort()).toEqual(["a.ts", "b.ts"]);

    const second = await buildGraph(root, Object.keys(files));
    expect(second.parsed).toEqual([]);
    expect(importsOf(second, "b.ts")).toEqual(["a.ts"]);

    write(root, { "b.ts": 'import { a } from "./a";\na + 1;\n' });
    const third = await buildGraph(root, Object.keys(files));
    expect(third.parsed).toEqual(["b.ts"]);
  });

  test("a cached file still resolves against the files that exist now", async () => {
    const files = { "b.ts": 'import { a } from "./a";\na;\n' };
    const root = treeWith(files);
    expect(importsOf(await buildGraph(root, ["b.ts"]), "b.ts")).toEqual([]);

    write(root, { "a.ts": "export const a = 1;\n" });
    const later = await buildGraph(root, ["b.ts"]);
    expect(later.parsed).toEqual([]);
    expect(importsOf(later, "b.ts")).toEqual(["a.ts"]);
  });

  test("the cache ignores itself, so git never sees it", async () => {
    const root = treeWith({ "a.ts": "export const a = 1;\n" });

    await buildGraph(root, ["a.ts"]);

    expect(readFileSync(join(root, ".qsm-langdev", "graph", ".gitignore"), "utf8")).toBe("*\n");
  });
});

describe("a language with no extractor", () => {
  test("is named in the report and contributes no edges", async () => {
    const graph = await graphOf({
      "main.rs": "mod util;\n",
      "config.fish": "source ./other.fish\n",
      "run.sh": "source ./lib.sh\n",
      "lib.sh": "",
      "main.ts": "export {};\n",
    });
    expect([...graph.noExtractor].sort()).toEqual(["fish", "rust", "shell"]);
    expect(graph.edges.has("main.rs")).toBe(false);
  });

  test("a tree with only extracted languages names none", async () => {
    const graph = await graphOf({ "main.ts": "export {};\n", "main.py": "" });
    expect(graph.noExtractor).toEqual([]);
  });
});
