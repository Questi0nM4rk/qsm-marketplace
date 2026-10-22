// qsm-builder lens export through its real surface: argv in, one HTML file out.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runBin } from "../../../lib/fixtures/cli.ts";
import { sandboxDir, writeIn as write } from "../../../lib/fixtures/sandbox.ts";
import { isRecord, onPath } from "../../../lib/outcome.ts";
import { listOf } from "../lib/guards.ts";

const CLI = resolve(import.meta.dir, "cli.ts");

/** The `--json` envelope of a run: its exit code and its data, checked before anything reads them. */
function envelope(text: string): { exit: number; data: unknown } {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || typeof value.exit !== "number") {
    throw new Error(`not an envelope: ${text}`);
  }
  return { exit: value.exit, data: value.data };
}

function dataOf(told: { data: unknown }): Record<string, unknown> {
  if (!isRecord(told.data)) {
    throw new Error("the envelope holds no object");
  }
  return told.data;
}

function textIn(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== "string") {
    throw new TypeError(`${key} is not a text`);
  }
  return value;
}

function marketplace(): string {
  const root = sandboxDir("qsm-builder-lens-");
  write(
    root,
    ".claude-plugin/marketplace.json",
    JSON.stringify({
      name: "fix",
      plugins: [
        { name: "qsm-a", source: "./plugins/qsm-a" },
        { name: "qsm-b", source: "./plugins/qsm-b" },
      ],
    }),
  );
  write(
    root,
    "plugins/qsm-a/.claude-plugin/plugin.json",
    JSON.stringify({ name: "qsm-a", description: "plugin a", dependencies: ["qsm-b"] }),
  );
  write(
    root,
    "plugins/qsm-a/README.md",
    "# qsm-a\n\n## Why it exists\n\nA exists so that B has a caller. It refuses more.\n",
  );
  write(
    root,
    "plugins/qsm-a/skills/one/SKILL.md",
    '---\nname: one\ndescription: "Use when x < y. Triggers: alpha, beta."\n---\n\n# One\n\nOpening words.\n\n## Rules\n',
  );
  write(
    root,
    "plugins/qsm-a/evals/one-fire/prompt.md",
    "---\nname: one-fire\ntags: [fire]\n---\n\nPlease do one. Then more.\n",
  );
  write(
    root,
    "plugins/qsm-a/evals/one-fire/graders/g.md",
    "---\ntype: llm\n---\nIntent of this eval: a caller asks for one.\n\nPASS when it does.\n",
  );
  write(
    root,
    "plugins/qsm-b/.claude-plugin/plugin.json",
    JSON.stringify({ name: "qsm-b", description: "plugin b" }),
  );
  return root;
}

function run(argv: readonly string[]) {
  const r = runBin(CLI, argv);
  return { exit: r.exit, text: r.stdout + r.stderr };
}

describe("qsm-builder lens export", () => {
  test("writes one tab per plugin plus an overview, escaped, with the eval intent", () => {
    const root = marketplace();
    const out = join(root, "out", "lens.html");
    const r = run(["lens", "export", root, "--out", out]);
    expect(r.exit).toBe(0);
    const html = readFileSync(out, "utf8");
    expect(html).toStartWith("<!doctype html>");
    expect(html.match(/data-top="1"/g)?.length).toBe(3);
    expect(html).toContain('data-route="qsm-a/one"');
    expect(html).toContain('data-route="qsm-a" aria-label="qsm-a"');
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html).toContain("Use when x &lt; y.");
    expect(html).not.toContain("x < y");
    expect(html).toContain("a caller asks for one.");
    // The pens wait for the artifact database; until it answers the page says where edits are made.
    expect(html).toContain("data-pen");
    expect(html).toContain("html:not(.db-ready) .pen");
    expect(html).toContain("Edits are made on <code>qsm-builder lens</code>");
  });

  test("the overview shows plugins only and the plugin graph hangs an outside name off its CLI", () => {
    const root = marketplace();
    write(root, "plugins/qsm-a/qsm.json", JSON.stringify({ qsm: { bin: { "qsm-a": "x" } } }));
    write(root, "plugins/qsm-a/lib/run.ts", "// shells out to opensrc\n");
    write(root, "plugins/qsm-a/skills/one/notes.md", "uses jq and https://example.org/x\n");
    const out = join(root, "out", "lens.html");
    expect(run(["lens", "export", root, "--out", out]).exit).toBe(0);
    const svgs = readFileSync(out, "utf8").match(/<svg.*?<\/svg>/gs) ?? [];
    const overview = svgs[0] ?? "";
    expect(overview).toContain("qsm-a");
    for (const outside of ["opensrc", "jq", "example.org", "CLI tools"]) {
      expect(overview).not.toContain(outside);
    }
    const plugin = svgs.find((v) => v.includes("qsm-a and what it refers to")) ?? "";
    expect(plugin).toContain('data-from="cli" data-to="tool:opensrc"');
    expect(plugin).toContain('data-from="skill:one" data-to="tool:jq"');
  });

  test("without --out the page lands in .qsm/lens.html of the marketplace", () => {
    const root = marketplace();
    expect(run(["lens", "export", root]).exit).toBe(0);
    expect(readFileSync(join(root, ".qsm", "lens.html"), "utf8")).toContain("<title>");
  });

  test("a directory without marketplace.json is missing and names the file", () => {
    const r = run(["lens", "export", sandboxDir("qsm-builder-empty-"), "--out", "/dev/null"]);
    expect(r.exit).toBe(4);
    expect(r.text).toContain("marketplace.json");
  });
});

describe("qsm-builder lens readme", () => {
  test("writes the block and the banners, then --check agrees until a file drifts", () => {
    const root = marketplace();
    write(
      root,
      "README.md",
      "# fix\n\n## Why it exists\n\nWhy.\n\n<!-- lens:start -->\n<!-- lens:end -->\n\n## Install\n",
    );
    expect(run(["lens", "readme", root, "--check"]).exit).toBe(3);
    expect(run(["lens", "readme", root]).exit).toBe(0);
    const readme = readFileSync(join(root, "README.md"), "utf8");
    expect(readme).toContain(
      "[qsm-a](plugins/qsm-a/README.md) | A exists so that B has a caller. |",
    );
    expect(readme).toContain("qsm_b --> qsm_a");
    expect(readme).toContain("## Install");
    expect(readFileSync(join(root, "assets/lens-banner-dark.svg"), "utf8")).toContain("2 plugins");
    expect(run(["lens", "readme", root, "--check"]).exit).toBe(0);
    write(root, "assets/lens-banner-light.svg", "stale");
    expect(run(["lens", "readme", root, "--check"]).text).toContain("lens-banner-light.svg");
  });

  test("a README without the markers is missing", () => {
    const root = marketplace();
    write(root, "README.md", "# fix\n");
    expect(run(["lens", "readme", root]).exit).toBe(4);
  });
});

describe("qsm-builder lens brief", () => {
  const brief = (file: string) => envelope(run(["lens", "brief", file, "--json"]).text);

  test("tells a plugin's open feedback, and nothing for other files", () => {
    if (!onPath("br")) {
      process.stderr.write("skipped: br is not on PATH\n");
      return;
    }
    const root = marketplace();
    const br = (...args: string[]) => spawnSync("br", args, { cwd: root, encoding: "utf8" });
    expect(br("init").status).toBe(0);
    expect(
      br("create", "qsm-a: the skill never fires", "-t", "task", "-l", "source:user").status,
    ).toBe(0);
    expect(br("create", "qsm-a: plain task", "-t", "task").status).toBe(0);

    const told = brief(join(root, "plugins/qsm-a/README.md"));
    expect(told.exit).toBe(0);
    const data = dataOf(told);
    const text = textIn(data, "text");
    expect(data.plugin).toBe("qsm-a");
    expect(text).toContain("qsm-a has 1 open tasks");
    expect(text).toContain("(feedback) qsm-a: the skill never fires");
    expect(text).not.toContain("plain task");
    expect(dataOf(brief(join(root, "plugins/qsm-b/README.md"))).text).toBeNull();
    expect(brief(join(root, "README.md")).data).toBeNull();
    expect(run(["lens", "brief", "plugins/qsm-a/README.md"]).exit).toBe(2);
  });
});

describe("qsm-builder lens plugin", () => {
  test("prints one plugin's view and refuses a name the marketplace lacks", () => {
    const root = marketplace();
    const view = envelope(run(["lens", "plugin", "qsm-a", "--dir", root, "--json"]).text);
    expect(view.exit).toBe(0);
    const data = dataOf(view);
    expect(data.plugin).toBe("qsm-a");
    expect(Array.isArray(data.items)).toBe(true);
    expect(run(["lens", "plugin", "qsm-zz", "--dir", root]).exit).toBe(2);
  });
});

describe("qsm-builder lens marketplace", () => {
  test("prints every plugin with its dependencies and open tasks count", () => {
    const root = marketplace();
    const view = envelope(run(["lens", "marketplace", "--dir", root, "--json"]).text);
    expect(view.exit).toBe(0);
    const plugins = listOf(dataOf(view).plugins);
    expect(plugins.map((p) => (isRecord(p) ? p.name : undefined))).toContain("qsm-a");
    expect(plugins[0]).toHaveProperty("openTasks");
  });
});
