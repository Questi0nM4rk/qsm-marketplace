// `lens pull` against a fake artifact database: a temporary marketplace with its own task
// store, nothing published and the real tracker untouched.
import { expect, test } from "bun:test";
import { spawnSync } from "bun";
import { sandboxDir, writeIn as write } from "../../../../lib/fixtures/sandbox.ts";
import { readMarketplace } from "./model.ts";
import { renderDocument } from "./page.ts";
import { type EditRow, type EditRows, pullEdits } from "./pull.ts";
import { type Issue, issuesOf } from "./tasks.ts";
import { onPath } from "../../../../lib/outcome.ts";

const sha = "0".repeat(64);
const edit = (what: string): Record<string, unknown> => ({
  where: "qsm-a:one",
  file: "plugins/qsm-a/skills/one/SKILL.md",
  sha,
  section: "frontmatter description",
  what,
  before: "old",
  after: "new",
  note: "because",
  taken: false,
});

function marketplace(): string {
  const root = sandboxDir("qsm-builder-pull-");
  write(
    root,
    ".claude-plugin/marketplace.json",
    JSON.stringify({ name: "fix", plugins: [{ name: "qsm-a", source: "./plugins/qsm-a" }] }),
  );
  write(root, "plugins/qsm-a/.claude-plugin/plugin.json", '{"name":"qsm-a"}');
  write(root, "plugins/qsm-a/README.md", "# qsm-a\n\n## Why it exists\n\nA exists.\n");
  return root;
}

/** The fake database: rows in memory, taken flags written back. */
function fake(rows: EditRow[]): EditRows {
  return {
    list: () => Promise.resolve(rows.map((r) => ({ id: r.id, data: { ...r.data } }))),
    markTaken: (_url, id) => {
      const row = rows.find((r) => r.id === id);
      if (row !== undefined) {
        row.data.taken = true;
      }
      return Promise.resolve();
    },
  };
}

const tasks = (root: string): Issue[] =>
  issuesOf(spawnSync(["br", "list", "--json"], { cwd: root }).stdout.toString());

test("pull makes one task per untaken row, marks it taken, and a second pull makes none", async () => {
  if (!onPath("br")) {
    process.stderr.write("skipped: br is not on PATH\n");
    return;
  }
  const root = marketplace();
  expect(spawnSync(["br", "init"], { cwd: root }).exitCode).toBe(0);
  const rows: EditRow[] = [
    { id: "r1", data: edit("first") },
    { id: "r2", data: edit("second") },
    { id: "r3", data: { ...edit("old"), taken: true } },
    { id: "r4", data: { ...edit("bad"), where: "qsm-nope" } },
  ];
  const db = fake(rows);
  const first = await pullEdits(root, "https://claude.ai/artifact/x", db);
  expect(first.created.map((c) => c.row)).toEqual(["r1", "r2"]);
  expect(first.taken).toBe(1);
  expect(first.rejected).toHaveLength(1);
  expect(first.rejected[0]?.row).toBe("r4");
  expect(first.rejected[0]?.reason).toContain("qsm-nope");
  expect(rows.map((r) => r.data.taken)).toEqual([true, true, true, false]);
  const made = tasks(root);
  expect(made.map((t) => t.title).toSorted((a, b) => a.localeCompare(b))).toEqual([
    "qsm-a:one: first",
    "qsm-a:one: second",
  ]);
  expect(made[0]?.description).toContain(`sha256: ${sha}`);
  expect(made[0]?.description).toContain("--- before\nold\n--- after\nnew\n--- note\nbecause");
  const second = await pullEdits(root, "https://claude.ai/artifact/x", db);
  expect(second.created).toEqual([]);
  expect(tasks(root)).toHaveLength(2);
});

test("a failed mark is reported with its row, so the repeat is never silent", async () => {
  if (!onPath("br")) {
    return;
  }
  const root = marketplace();
  expect(spawnSync(["br", "init"], { cwd: root }).exitCode).toBe(0);
  const db: EditRows = {
    list: () => Promise.resolve([{ id: "r1", data: edit("first") }]),
    markTaken: () => Promise.reject(new Error("write refused")),
  };
  const pulled = await pullEdits(root, "u", db);
  expect(pulled.created).toHaveLength(1);
  expect(pulled.unmarked).toEqual([{ row: "r1", reason: "write refused" }]);
});

test("the exported page hides its pens until the artifact database answers, and says it is read-only", () => {
  const root = marketplace();
  const html = renderDocument(readMarketplace(root), {
    edit: { sha: () => sha, transport: "artifact" },
  });
  expect(html).toContain('claude.use("db")');
  expect(html).toContain("html:not(.db-ready) .pen");
  expect(html).toContain('class="dim read-only"');
  expect(html).toContain("data-pen=");
});
