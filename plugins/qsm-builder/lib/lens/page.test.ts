// The page escapes every text read from a file, in every slot it lands in.
import { expect, test } from "bun:test";
import type { Item, Marketplace, Plugin } from "./model.ts";
import { renderPage } from "./page.ts";

const X = "<script>alert(1)</script>";

const item = (kind: Item["kind"]): Item => ({
  kind,
  name: `${kind}${X}`,
  description: X,
  path: X,
  opening: X,
  triggers: [X],
  notFor: X,
  headings: [X],
  model: X,
  tools: X,
  cases: [],
  references: [],
  tasks: [
    {
      id: X,
      title: `names ${kind}${X}`,
      source: "names the plugin",
      kind: "task",
      stale: null,
      epic: false,
    },
  ],
});

const plugin: Plugin = {
  name: `qsm-x${X}`,
  dir: X,
  description: X,
  dependencies: [X],
  keywords: [],
  dependencyReasons: { [X]: X },
  why: X,
  items: [item("skill"), item("agent")],
  looseCases: [],
  bin: X,
  verbs: [{ name: X, description: X }],
  hooks: [{ file: X, event: X, command: false, what: X, calls: [] }],
  references: [{ name: X, kind: "tool", dependency: false, items: [] }],
  otherReferences: [{ name: X, kind: "tool", dependency: false, items: [] }],
  tasks: [{ id: "t-1", title: X, source: "title prefix", kind: "task", stale: null, epic: false }],
};

test("script text in a skill name, an agent name and a task title never reaches the page as markup", () => {
  const market: Marketplace = {
    dir: X,
    name: X,
    why: X,
    plugins: [plugin],
    tasksNote: X,
    madeAt: "2026-10-10T00:00:00.000Z",
  };
  const html = renderPage(market);
  // The page's own script is the only one.
  expect(html.match(/<script/g)?.length).toBe(1);
  expect(html).not.toContain("alert(1)</script>");
  expect(html).toContain("skill&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(html).toContain("agent&lt;script&gt;alert(1)&lt;/script&gt;");
  expect(html).toContain("names skill&lt;script&gt;");
});
