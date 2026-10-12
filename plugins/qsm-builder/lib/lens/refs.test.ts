// The searched names through the real model: this repository, and a marketplace with its own list.
import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { sandboxDir } from "../../../../lib/fixtures/sandbox.ts";
import { readMarketplace } from "./model.ts";
import { tasksOf } from "./tasks.ts";

const REPO = resolve(import.meta.dir, "../../../..");

const names = (refs: readonly { name: string }[]): string[] => refs.map((r) => r.name);

test("each level has its own names: web-ladder's graph holds what its own files name only", () => {
  const web = readMarketplace(REPO).plugins.find((p) => p.name === "qsm-web");
  const ladder = web?.items.find((i) => i.name === "web-ladder");
  expect(names(ladder?.references ?? [])).toContain("browserbox");
  expect(names(web?.references ?? [])).toContain("opensrc");
});

test("a marketplace's own references.txt wins, a name matches as a whole word in prose, a hyphen continues it", () => {
  const root = sandboxDir("qsm-builder-refs-");
  const put = (rel: string, text: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  put(
    ".claude-plugin/marketplace.json",
    JSON.stringify({ name: "m", plugins: [{ name: "qsm-a" }] }),
  );
  put("plugins/qsm-a/.claude-plugin/plugin.json", "{}");
  put(
    "plugins/qsm-a/skills/s/SKILL.md",
    "---\nname: s\n---\nWe keep zork notes, not zork-ish ones, nor unzork.\n",
  );
  put("plugins/qsm-builder/references.txt", "# mine\nzork\n");
  const refs = readMarketplace(root).plugins[0]?.items[0]?.references ?? [];
  expect(names(refs)).toEqual(["zork"]);
  put("plugins/qsm-builder/references.txt", "zork-ish\n");
  expect(names(readMarketplace(root).plugins[0]?.items[0]?.references ?? [])).toEqual(["zork-ish"]);
});

test("a title prefix of the plugin name without qsm- is the plugin's own task", () => {
  const task = (id: string, title: string) => ({
    id,
    title,
    kind: "task" as const,
    stale: null,
    epic: false,
  });
  const open = [task("a", "web: fix the ladder"), task("b", "plan: other")];
  expect(tasksOf("qsm-web", open)?.map((t) => [t.id, t.source])).toEqual([["a", "title prefix"]]);
});
