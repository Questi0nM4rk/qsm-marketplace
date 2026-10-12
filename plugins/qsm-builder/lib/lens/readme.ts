// The root README's generated block and the two banners, written from the model the lens page
// reads. Pure: text in, text out. `lens readme` in cli.ts reads and writes the files.

import { esc } from "./graph.ts";
import { firstSentence, type Marketplace, ModelError, type Plugin } from "./model.ts";

const START = "<!-- lens:start -->";
const END = "<!-- lens:end -->";
const BANNER_LIGHT = "assets/lens-banner-light.svg";
const BANNER_DARK = "assets/lens-banner-dark.svg";

const WHAT = "A minimal marketplace of specialist plugins for Claude Code.";

interface Kind {
  readonly title: string;
  /** a `keywords` entry of plugin.json that puts a plugin in this kind */
  readonly words: readonly string[];
}

/** The first kind whose words meet a plugin's keywords; a plugin that meets none is tooling. */
const KINDS: readonly Kind[] = [
  { title: "Core", words: ["essentials"] },
  { title: "Planning", words: ["tasks", "openspec", "planning"] },
  { title: "Code quality and languages", words: ["langdev", "code-review", "secrets"] },
  { title: "Knowledge and web", words: ["knowledge", "research", "web"] },
];
const TOOLING = "Tooling";

const kindOf = (p: Plugin): string =>
  KINDS.find((k) => k.words.some((w) => p.keywords.includes(w)))?.title ?? TOOLING;

const plural = (n: number, one: string): string => `${n} ${n === 1 ? one : `${one}s`}`;

/** What a plugin ships as short counts: skills, agents, its CLI, hooks. */
function shipsOf(p: Plugin): string {
  const count = (kind: "skill" | "agent") => p.items.filter((i) => i.kind === kind).length;
  return [
    count("skill") > 0 ? plural(count("skill"), "skill") : "",
    count("agent") > 0 ? plural(count("agent"), "agent") : "",
    p.bin === null ? "" : "CLI",
    p.hooks.length > 0 ? plural(p.hooks.length, "hook") : "",
  ]
    .filter((s) => s !== "")
    .join(", ");
}

const cell = (s: string): string => s.replaceAll("|", "\\|");

function table(plugins: readonly Plugin[]): string {
  const rows = plugins.map(
    (p) =>
      `| [${p.name}](${p.dir}/README.md) | ${cell(p.why === null ? "-" : firstSentence(p.why))} | ${shipsOf(p)} |`,
  );
  return ["| Plugin | Why it exists | Ships |", "| --- | --- | --- |", ...rows].join("\n");
}

/** Words joined into lines of at most 100 characters, the README's markdownlint width. */
function wrap(text: string): string {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= 100) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines.join("\n");
}

const id = (name: string): string => name.replaceAll("-", "_");

/** Three or more plugins that use the same plugins and that no plugin uses are drawn as one node,
 * so a family like the language plug-ins is one box, not a fan. */
const GROUP_MIN = 3;

/** The graph node of each plugin drawn in a group: users of the same plugins that nothing uses. */
function groups(
  plugins: readonly Plugin[],
  uses: ReadonlyMap<string, readonly string[]>,
  used: ReadonlySet<string>,
): Map<string, string> {
  const leaves = new Map<string, string[]>();
  for (const p of plugins) {
    const deps = uses.get(p.name) ?? [];
    if (deps.length > 0 && !used.has(p.name)) {
      leaves.set(deps.join(" "), [...(leaves.get(deps.join(" ")) ?? []), p.name]);
    }
  }
  const nodeOf = new Map<string, string>();
  for (const names of [...leaves.values()].filter((n) => n.length >= GROUP_MIN)) {
    for (const n of names) {
      nodeOf.set(n, `${id(names[0] ?? "")}_group`);
    }
  }
  return nodeOf;
}

/** The top C4 level: the plugins that depend or are depended on, an arrow from the plugin used to
 * its user. A plugin with no edge is named below the graph instead, so the graph stays one screen. */
function overviewGraph(m: Marketplace): string {
  const known = new Set(m.plugins.map((p) => p.name));
  const uses = new Map(m.plugins.map((p) => [p.name, p.dependencies.filter((d) => known.has(d))]));
  const used = new Set([...uses.values()].flat());
  const nodeOf = groups(m.plugins, uses, used);
  const node = (name: string): string => nodeOf.get(name) ?? id(name);
  const linked = m.plugins.filter((p) => used.has(p.name) || (uses.get(p.name) ?? []).length > 0);
  const labels = new Map<string, string[]>();
  for (const p of linked) {
    labels.set(node(p.name), [...(labels.get(node(p.name)) ?? []), p.name]);
  }
  const nodes = [...labels].map(([key, names]) => `  ${key}["${names.join("<br>")}"]`);
  const edges = [
    ...new Set(
      linked.flatMap((p) =>
        (uses.get(p.name) ?? []).map((d) => `  ${node(d)} --> ${node(p.name)}`),
      ),
    ),
  ];
  const alone = m.plugins.filter((p) => !linked.includes(p)).map((p) => `\`${p.name}\``);
  const graph = ["```mermaid", "flowchart LR", ...nodes, ...edges, "```"].join("\n");
  return alone.length === 0
    ? graph
    : `${graph}\n\n${wrap(`These plugins need no other plugin and no plugin needs them: ${alone.join(", ")}.`)}`;
}

function blockOf(m: Marketplace): string {
  const catalog = [...KINDS.map((k) => k.title), TOOLING]
    .map((title) => ({ title, plugins: m.plugins.filter((p) => kindOf(p) === title) }))
    .filter((g) => g.plugins.length > 0)
    .map((g) => `### ${g.title}\n\n${table(g.plugins)}`)
    .join("\n\n");
  return `${START}
## What it is

<!-- markdownlint-disable MD013 MD033 -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="${BANNER_DARK}">
  <source media="(prefers-color-scheme: light)" srcset="${BANNER_LIGHT}">
  <img alt="${esc(m.name)}: ${esc(WHAT)} ${plural(m.plugins.length, "plugin")}." src="${BANNER_LIGHT}">
</picture>
<!-- markdownlint-enable MD013 MD033 -->

Every capability is one plugin that carries its own code, CLI, skills, hooks and docs. The core
works alone. Every other plugin adds a capability or replaces a default, and names the plugins it
needs.

## How the plugins depend on each other

An arrow runs from a plugin to the plugin that uses it.

${overviewGraph(m)}

## Catalog

${catalog}

A plugin's kind is the first of core, planning, code quality and languages, and knowledge and web
that names one of its \`keywords\` in plugin.json. Every other plugin is tooling.

## Open the lens

The lens is one page of every plugin: why it exists, its skills and agents, its evals and what it
refers to.

\`\`\`sh
qsm-builder lens
qsm-builder lens export
\`\`\`

The first serves the page on 127.0.0.1:4747. The second writes it as one HTML file to
\`.qsm/lens.html\`.
${END}`;
}

/** The README with the text between the markers replaced; a README without both markers is `missing`. */
function spliceReadme(current: string, block: string): string {
  const start = current.indexOf(START);
  const end = current.indexOf(END);
  if (start < 0 || end < start) {
    throw new ModelError("missing", `README.md needs ${START} and ${END}, in that order`);
  }
  return current.slice(0, start) + block + current.slice(end + END.length);
}

interface Palette {
  readonly bg: string;
  readonly dot: string;
  readonly sheet: string;
  readonly edge: string;
  readonly shade: string;
  readonly heading: string;
  readonly muted: string;
  readonly lavender: string;
  readonly chip: string;
}

// The lens tokens, dark by default and the pastel light mode.
const DARK: Palette = {
  bg: "#22212b",
  dot: "#2f2d3b",
  sheet: "#1d1c25",
  edge: "#45425a",
  shade: "#14131a",
  heading: "#ebe8f5",
  muted: "#a29fb5",
  lavender: "#b9aee6",
  chip: "#363149",
};
const LIGHT: Palette = {
  bg: "#e9e4f3",
  dot: "#d8cfea",
  sheet: "#f7f4fb",
  edge: "#c9bfdf",
  shade: "#d2c7e8",
  heading: "#2b2937",
  muted: "#635e77",
  lavender: "#6554ad",
  chip: "#e6defa",
};

const SERIF = "'Archivo Black','Arial Black',Impact,sans-serif";
const SANS = "Rubik,'Segoe UI',system-ui,sans-serif";
const MONO = "'JetBrains Mono',Consolas,monospace";

/** The lens header drawn once: eyebrow, name, one line, and the count as a chip, on the dotted sheet. */
function bannerOf(m: Marketplace, c: Palette): string {
  const count = plural(m.plugins.length, "plugin");
  const chipW = Math.round(count.length * 8.4 + 24);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="260" viewBox="0 0 1000 260" role="img" aria-label="${esc(m.name)}: ${esc(WHAT)} ${esc(count)}.">
<defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.3" fill="${c.dot}"/></pattern></defs>
<rect width="1000" height="260" fill="${c.bg}"/>
<rect width="1000" height="260" fill="url(#dots)"/>
<rect x="38" y="30" width="940" height="200" fill="${c.shade}"/>
<rect x="29" y="21" width="940" height="200" fill="${c.sheet}" stroke="${c.edge}" stroke-width="2"/>
<text x="61" y="66" font-family="${MONO}" font-size="14" font-weight="500" fill="${c.muted}">${esc(m.name)} · marketplace lens</text>
<text x="61" y="124" font-family="${SERIF}" font-size="44" fill="${c.heading}">${esc(m.name)}</text>
<text x="61" y="160" font-family="${SANS}" font-size="18" fill="${c.muted}">${esc(WHAT)}</text>
<rect x="64" y="183" width="${chipW}" height="28" fill="${c.shade}"/>
<rect x="61" y="180" width="${chipW}" height="28" fill="${c.chip}" stroke="${c.lavender}" stroke-width="2"/>
<text x="${61 + chipW / 2}" y="199" text-anchor="middle" font-family="${MONO}" font-size="14" fill="${c.heading}">${esc(count)}</text>
</svg>
`;
}

/** Every file `lens readme` owns, by path relative to the marketplace, given the README as it is. */
export function generatedFiles(m: Marketplace, readme: string): Readonly<Record<string, string>> {
  return {
    "README.md": spliceReadme(readme, blockOf(m)),
    [BANNER_LIGHT]: bannerOf(m, LIGHT),
    [BANNER_DARK]: bannerOf(m, DARK),
  };
}
