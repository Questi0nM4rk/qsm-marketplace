// The page: one HTML fragment (no doctype, html, head or body: it is published as an artifact that
// wraps it). One h1 for the page; every panel titles itself at h2. The links at the top lead to the
// marketplace overview and to the plugins; inside a plugin, a second row of links leads to the
// plugin overview and to each skill and agent. Panels are shown by the URL hash: `#overview`,
// `#qsm-essentials`, `#qsm-essentials/debugging`. The export and the artifact hold every panel in
// one document; the server (`only` set) sends the overview at `/` and one plugin at `/p/<plugin>`,
// so a page stays small. Every text read from a file goes through esc() on its way in.

import { relative } from "node:path";
import { ARTIFACT_SCRIPT, LIVE_SCRIPT, PEN_ICON, PEN_SCRIPT } from "./client.ts";
import { esc, graph, type Link, type Vertex } from "./graph.ts";
import type { Hook } from "./hooks.ts";
import {
  type Case,
  type CaseResult,
  firstSentence,
  type Grader,
  type Item,
  type Marketplace,
  meetsBar,
  type Plugin,
} from "./model.ts";
import { newItemSpecs, searchIndex } from "./newitem.ts";
import { type Reference, type RefKind, REF_KINDS } from "./refs.ts";
import type { Field, Spec } from "./spec.ts";
import { CSS, PEN_CSS, SCRIPT, WAIT_CSS } from "./style.ts";
import type { Task } from "./tasks.ts";

const slug = (name: string): string => name.replaceAll(/[^a-zA-Z0-9-]/g, "-");
export const pluginRoute = (p: Plugin): string => slug(p.name);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

// ---- the pen: the served page only; an exported page reads the same without it

interface Ctx {
  readonly root: string;
  /** set on the served page: reads the sha256 of a file as it is now */
  readonly edit: PageOptions["edit"];
  /** set when the page holds the overview or one plugin: another plugin is another request */
  readonly paged: boolean;
}

/** Where a plugin's panel is: its own request on a paged page, a hash route otherwise. */
const pluginHref = (ctx: Ctx, p: Plugin): string =>
  ctx.paged ? `/p/${pluginRoute(p)}` : `#${pluginRoute(p)}`;

/** A panel: a titled region the hash shows, the title the page's second level of heading. */
const panel = (route: string, label: string, eyebrow: string, title: string, body: string) =>
  `<section class="tab" data-route="${esc(route)}" aria-label="${esc(label)}">
<header class="part"><span class="eyebrow">${esc(eyebrow)}</span><h2 class="title">${title}</h2></header>
${body}
</section>`;

/** What one edit changes: a file's section and the one control that does it. */
interface Target {
  readonly file: string;
  readonly section: string;
  readonly label: string;
  readonly value: string;
  readonly control?: Field["control"];
  readonly options?: readonly string[];
  readonly hint?: string;
}

/** An edit of one value. */
function field(where: string, t: Target): Spec {
  const { file, section, label, value, control = "textarea", options, hint } = t;
  return {
    where,
    file,
    section,
    what: `edit ${section}`,
    fields: [
      {
        name: "value",
        label,
        control,
        value,
        ...(options === undefined ? {} : { options }),
        ...(hint === undefined ? {} : { hint }),
      },
    ],
  };
}

const payload = (ctx: Ctx, spec: Spec): string =>
  esc(JSON.stringify({ ...spec, sha: ctx.edit?.sha(spec.file) ?? "" }));

/** `read` with a pen at its top right; on an exported page, `read` as it is. */
function pen(ctx: Ctx, spec: Spec, read: string, small = false): string {
  if (ctx.edit === undefined) {
    return read;
  }
  return `<div class="pen-wrap${small ? " inline" : ""}" data-key="${esc(`${spec.file}|${spec.section}`)}" data-pen="${payload(ctx, spec)}"><button class="pen" type="button" data-open aria-label="${esc(`Edit ${spec.section}`)}" title="Edit">${PEN_ICON}</button><div class="pen-read">${read}</div></div>`;
}

/** A button that opens an edit with no text of its own to turn into a control (add, remove). */
function action(ctx: Ctx, spec: Spec, label: string): string {
  if (ctx.edit === undefined) {
    return "";
  }
  return `<div class="pen-wrap" style="padding-right:0;margin-top:14px" data-key="${esc(`${spec.file}|${spec.section}`)}" data-pen="${payload(ctx, spec)}"><div class="pen-read"><button class="add-case" type="button" data-open>${esc(label)}</button></div></div>`;
}

const rel = (ctx: Ctx, abs: string): string => relative(ctx.root, abs);

/** A skill and an agent of one plugin may share a name; the agent's route then ends in `-agent`. */
function itemRoute(p: Plugin, i: Item): string {
  const clash = i.kind === "agent" && p.items.some((o) => o.kind === "skill" && o.name === i.name);
  return `${pluginRoute(p)}/${slug(i.name)}${clash ? "-agent" : ""}`;
}

/** Escaped text with `code` spans. */
const inline = (s: string): string => esc(s).replaceAll(/`([^`]+)`/g, "<code>$1</code>");

/** Paragraphs of a markdown text, headings dropped. */
function prose(text: string): string {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "" && !p.startsWith("#"))
    .map((p) => `<p>${inline(p.replaceAll(/\s*\r?\n\s*/g, " "))}</p>`)
    .join("");
}

const whyLine = (text: string | null): string =>
  text === null
    ? ""
    : firstSentence(
        text
          .split(/\r?\n/)
          .filter((l) => !l.startsWith("#"))
          .join(" "),
      );

const tag = (cls: string, text: string): string => `<span class="tag ${cls}">${esc(text)}</span>`;
const row = (label: string, html: string): string =>
  `<div class="row"><b>${esc(label)}</b><span>${html}</span></div>`;
const rows = (...r: string[]): string => `<div class="rows brick">${r.join("")}</div>`;
/** `title` is text and is escaped; `titleHtml` is markup the caller already built with esc(). */
const card = (
  eyebrow: string,
  title: string,
  body: string,
  opts: { tone?: string; titleHtml?: string } = {},
): string => {
  const heading = opts.titleHtml ?? esc(title);
  return `<section class="card ${opts.tone ?? ""}"><span class="eyebrow">${esc(eyebrow)}</span>${heading === "" ? "" : `<h3>${heading}</h3>`}${body}</section>`;
};
const casesOf = (p: Plugin): number =>
  p.items.reduce((n, i) => n + i.cases.length, p.looseCases.length);
const kindCount = (p: Plugin, kind: Item["kind"]): number =>
  p.items.filter((i) => i.kind === kind).length;

// ---- new item

/** The page that starts a skill, an agent or a plugin: only where an edit can be saved. */
function newItemPanel(m: Marketplace, ctx: Ctx): string {
  const buttons = newItemSpecs(m)
    .map(({ label, spec }) => action(ctx, spec, label))
    .join("");
  const body = `<p>Describe what you want and save it as one task of kind new. Nothing is created: the agent searches for an existing owner first, shows you what it would add and creates it after your yes. A new item without an eval case is refused.</p>${buttons}<script type="application/json" id="lens-index">${JSON.stringify(searchIndex(m, (p) => pluginHref(ctx, p))).replaceAll("<", "\\u003c")}</script>`;
  return panel(
    "new",
    "New item",
    "new",
    "<em>Start a skill, an agent or a plugin</em>",
    `<a class="back" href="${ctx.paged ? "/" : "#overview"}">&larr; overview</a>
${card("Describe it", "What should exist that does not.", body, { tone: "soft" })}`,
  );
}

// ---- overview

function tile(p: Plugin, ctx: Ctx): string {
  const tasks = p.tasks === null ? "tasks not read" : plural(p.tasks.length, "open task");
  const why = whyLine(p.why);
  const has = [
    plural(kindCount(p, "skill"), "skill"),
    plural(kindCount(p, "agent"), "agent"),
    plural(casesOf(p), "eval case"),
    tasks,
  ].join(" · ");
  return `<div class="tile"><h4><a href="${pluginHref(ctx, p)}">${esc(p.name)}</a></h4><div><b>Why</b>${why === "" ? "No Why it exists section." : inline(why)}</div><div><b>Has</b>${esc(has)}</div></div>`;
}

const KIND_LABEL: Record<RefKind, string> = {
  plugin: "plugin of this marketplace",
  tool: "outside tool or project",
  web: "web source",
  mcp: "MCP server",
};
const KIND_CLASS: Record<RefKind, "node" | "tool" | "web" | "mcp"> = {
  plugin: "node",
  tool: "tool",
  web: "web",
  mcp: "mcp",
};

const legendOf = (refs: readonly Reference[]): string =>
  REF_KINDS.filter((k) => refs.some((r) => r.kind === k))
    .map((k) => `<span class="tag k-${KIND_CLASS[k]}">${esc(KIND_LABEL[k])}</span>`)
    .join("");

/** The marketplace graph, the top C4 level: every plugin and the dependencies between them, nothing
 * outside the marketplace; a plugin's own graph is where its outside names first appear. */
function dependencyGraph(m: Marketplace, ctx: Ctx): string {
  const inMarket = new Set(m.plugins.map((p) => p.name));
  const deps = new Map(
    m.plugins.map((p) => [p.name, p.dependencies.filter((d) => inMarket.has(d))]),
  );
  const layer = (name: string, seen: readonly string[] = []): number =>
    seen.includes(name)
      ? 0
      : Math.max(-1, ...(deps.get(name) ?? []).map((d) => layer(d, [...seen, name]))) + 1;
  const nodes: Vertex[] = m.plugins.map((p) => ({
    id: p.name,
    label: p.name,
    cls: "node",
    layer: layer(p.name),
    href: pluginHref(ctx, p),
  }));
  const edges: Link[] = m.plugins.flatMap((p) =>
    (deps.get(p.name) ?? []).map((d) => ({ from: p.name, to: d, dep: true })),
  );
  const caption =
    "Arrows point from a plugin to the plugin that depends on it (<code>dependencies</code> in plugin.json). What a plugin uses outside the marketplace shows one level down, on its own tab. Every plugin starts picked; unpick one to drop its edges and dim it.";
  const chips = m.plugins
    .map(
      (p) =>
        `<label class="pick-chip" title="${esc(p.name)}"><input type="checkbox" value="${esc(p.name)}" checked><span>${esc(p.name.replace(/^qsm-/, ""))}</span></label>`,
    )
    .join("");
  const picker = `<div class="pick" role="group" aria-label="Plugins whose edges are drawn"><div class="pick-bar"><span class="pick-title">Plugins in the graph</span><span class="pick-count" data-count>${m.plugins.length} of ${m.plugins.length}</span><span class="pick-acts"><button type="button" data-pick="all">Select all</button><button type="button" data-pick="none">Deselect all</button></span></div><div class="pick-chips">${chips}</div></div>`;
  return `<figure data-picker>${picker}${graph("Dependencies between the plugins of this marketplace", "dep", nodes, edges)}<figcaption>${caption}</figcaption></figure>`;
}

function overview(m: Marketplace, ctx: Ctx): string {
  const why =
    m.why === null
      ? ""
      : card(
          "Why this marketplace exists",
          "",
          pen(
            ctx,
            field("marketplace", {
              file: "README.md",
              section: "Why it exists",
              label: "Why it exists",
              control: "long",
              value: m.why,
            }),
            prose(m.why),
          ),
          { tone: "soft" },
        );
  const tiles = `<div class="tiles">${m.plugins.map((p) => tile(p, ctx)).join("")}</div><p class="dim" style="margin-top:16px">${esc(m.tasksNote)}</p>`;
  return panel(
    "overview",
    "Overview",
    "overview",
    `${plural(m.plugins.length, "plugin")}, <em>one reason each</em>`,
    `${why}
${card("Plugins", "What each plugin is for.", tiles)}
${ctx.edit === undefined ? "" : card("Something missing?", "", `<p><a href="#new">Start a new skill, agent or plugin</a>. It is saved as one task, and an eval case is required.</p>`)}
${card("Dependencies", "Which plugin needs which.", dependencyGraph(m, ctx))}`,
  );
}

// ---- evals

interface Kind {
  readonly tag: string;
  readonly title: string;
  readonly measures: string;
}

const KINDS: readonly Kind[] = [
  {
    tag: "fire",
    title: "Fire",
    measures: "Does the skill load when a request should call for it?",
  },
  {
    tag: "negative",
    title: "Negative",
    measures: "Does it stay quiet when a request is not its job?",
  },
  {
    tag: "scenario",
    title: "Scenario",
    measures: "Does the work come out better with the plugin than without it?",
  },
];
const OTHER: Kind = {
  tag: "",
  title: "Other",
  measures:
    "These cases carry no fire, negative or scenario tag, so they do not say what they measure.",
};

/** The cases under their kind, each case once, under the first kind in KINDS its tags name. */
function grouped(cases: readonly Case[]): { kind: Kind; cases: Case[] }[] {
  const kindOf = (c: Case): Kind => KINDS.find((k) => c.tags.includes(k.tag)) ?? OTHER;
  return [...KINDS, OTHER]
    .map((kind) => ({ kind, cases: cases.filter((c) => kindOf(c) === kind) }))
    .filter((g) => g.cases.length > 0);
}

/** A label and its value, one line of a case. */
const kv = (label: string, body: string): string =>
  `<div class="kv"><span class="k">${esc(label)}</span><div>${body}</div></div>`;

/** A grader: its name and type, what it accepts in words, and the text it owns, each with a pen. */
function graderBlock(g: Grader, c: Case, ctx: Ctx, where: string): string {
  const file = rel(ctx, g.file);
  const one = (t: Omit<Target, "file">) => field(where, { file, ...t });
  const type = pen(
    ctx,
    one({
      section: "grader type",
      label: "Grader type",
      control: "select",
      value: g.type,
      options: ["llm", "regex", "tool_used"],
      hint: "tool_used counts a tool's calls, regex matches the output, llm lets a judge model read it. Changing the type changes which fields the grader needs.",
    }),
    tag("", g.type),
    true,
  );
  const own: Record<string, string> = {
    regex: pen(
      ctx,
      one({
        section: "pattern",
        label: "Pattern",
        value: g.core,
        control: "input",
        hint: "The regular expression the output must match; it is what this grader checks.",
      }),
      `<code>${esc(g.summary)}</code>`,
    ),
    tool_used: pen(
      ctx,
      one({
        section: "tool",
        label: "Tool",
        value: g.core,
        control: "input",
        hint: "The tool whose calls are counted, for example Skill or Agent.",
      }),
      `tool <code>${esc(g.core)}</code>`,
    ),
    llm:
      g.rule === ""
        ? ""
        : pen(
            ctx,
            one({
              section: g.file === c.intentFile ? "rule (below the intent line)" : "rule",
              label: "Rule the judge applies",
              value: g.rule,
              hint: "The judge model decides pass or fail from this text alone, so the wording is the grader.",
            }),
            `<blockquote>${inline(g.rule)}</blockquote>`,
          ),
  };
  return `<div class="grader"><div class="g-head"><b>${esc(g.name)}</b>${type}</div><p class="how">${esc(g.how)}.</p>${own[g.type] ?? ""}</div>`;
}

const percent = (pass: number, total: number): number => Math.round((pass / total) * 100);

const stat = (name: string, value: string): string =>
  `<span class="stat"><small>${name}</small><b>${esc(value)}</b></span>`;

/** The last result: its own read-only block, never a field. */
function resultBlock(c: Case): string {
  const r: CaseResult | null = c.result;
  const label = `<span class="k">Last result <small>read only, written by the eval runner</small></span>`;
  if (r === null) {
    return `<div class="result none">${label}<p>${esc(c.noResult.charAt(0).toUpperCase() + c.noResult.slice(1))}.</p></div>`;
  }
  const met = meetsBar(r);
  const without = r.withoutPass === null ? "not run" : `${r.withoutPass}/${r.withoutTotal}`;
  const delta =
    r.withoutPass === null || r.withoutTotal === 0
      ? "n/a"
      : `${percent(r.withPass, r.withTotal) - percent(r.withoutPass, r.withoutTotal) >= 0 ? "+" : ""}${percent(r.withPass, r.withTotal) - percent(r.withoutPass, r.withoutTotal)} points`;
  return `<div class="result ${met ? "met" : "unmet"}">${label}<div class="stats">${stat("With the plugin", `${r.withPass}/${r.withTotal}`)}${stat("Without", without)}${stat("Difference", delta)}${stat("Bar met", met ? "yes" : "no")}${stat("Date", r.date)}</div></div>`;
}

/** The small menu of a case: intent, tags and removal, each opening its edit in place. */
function caseMenu(c: Case, ctx: Ctx, where: string): string {
  if (ctx.edit === undefined) {
    return "";
  }
  const meta = rel(ctx, c.metaFile);
  const item = (spec: Spec, label: string): string =>
    `<div class="pen-wrap menu-item" data-key="${esc(`${spec.file}|${spec.section}`)}" data-pen="${payload(ctx, spec)}"><div class="pen-read"><button type="button" data-open>${esc(label)}</button></div></div>`;
  const heading =
    c.intent === null || c.intentFile === null
      ? field(where, {
          file: rel(ctx, c.promptFile),
          section: "prompt, first sentence",
          label: "Prompt, first sentence",
          value: c.prompt,
          hint: "This case has no intent line, so its heading is the prompt's first sentence.",
        })
      : field(where, {
          file: rel(ctx, c.intentFile),
          section: "intent line",
          label: "Intent of this eval",
          value: c.intent,
          hint: "The judge reads this line first and this page shows it as the case's heading: it is the one place the case's purpose is written.",
        });
  const tags = field(where, {
    file: meta,
    section: "tags",
    label: "Tags, comma separated",
    value: c.tags.join(", "),
    control: "input",
    hint: "fire, negative or scenario puts the case under that kind; the eval runner reads the same tags.",
  });
  const remove: Spec = {
    where,
    file: rel(ctx, c.promptFile),
    section: `remove case ${c.name}`,
    what: `remove eval case ${c.name}`,
    fields: [],
    before: c.intent ?? c.prompt,
    after: "(remove this eval case)",
  };
  return `<details class="case-menu"><summary aria-label="Edit case ${esc(c.name)}" title="Edit this case">${PEN_ICON}</summary><div class="case-menu-body">${item(heading, "Edit the intent")}${item(tags, "Edit the tags")}${item(remove, "Remove this case")}</div></details>`;
}

/** One case, read top to bottom: its intent, what the agent is given, what is accepted, the settings, the result. */
function caseBlock(c: Case, ctx: Ctx, where: string): string {
  const meta = rel(ctx, c.metaFile);
  const one = (file: string, t: Omit<Target, "file">) => field(where, { file, ...t });
  const head =
    c.intent === null
      ? `${inline(c.prompt)} <small class="dim">no intent line is written</small>`
      : inline(c.intent);
  const prompt = pen(
    ctx,
    one(rel(ctx, c.promptFile), {
      section: "prompt",
      label: "Prompt the agent is given",
      value: c.promptText,
      control: "long",
      hint: "The situation the case puts the agent in; changing it changes what the case measures.",
    }),
    `<pre class="prompt">${esc(c.promptText)}</pre>`,
  );
  const setting = (target: Omit<Target, "file" | "control">, means: string) =>
    kv(
      target.label,
      `${pen(ctx, one(meta, { ...target, control: "input" }), `<b>${esc(target.value || "default")}</b>`, true)} <span class="dim">${esc(means)}</span>`,
    );
  const settings = [
    setting(
      {
        section: "runs",
        label: "Runs",
        value: c.runs,
        hint: "More runs make the pass count steadier and cost more.",
      },
      "how many times the case runs in each arm (with and without the plugin)",
    ),
    setting(
      {
        section: "max_turns",
        label: "Max turns",
        value: c.maxTurns,
        hint: "Too low and a good run is cut off before it answers; too high and a lost run keeps spending.",
      },
      "the agent's turn budget for one run",
    ),
  ].join("");
  const tags = c.tags.length === 0 ? "" : ` ${c.tags.map((t) => tag(TONE[t] ?? "", t)).join("")}`;
  return `<article class="case"><header><h5>${head}</h5>${caseMenu(c, ctx, where)}</header><p class="case-name"><code>${esc(c.name)}</code>${tags}</p>
${kv("Given to the agent", prompt)}
${kv("Graders accept", c.graders.length === 0 ? `<span class="dim">no grader is written</span>` : c.graders.map((g) => graderBlock(g, c, ctx, where)).join(""))}
${settings}
${resultBlock(c)}</article>`;
}

const TONE: Record<string, string> = { fire: "fire", scenario: "scn" };

/** Cases under their kind, each kind with one line on what it measures. */
function evalGroups(cases: readonly Case[], ctx: Ctx, where: string): string {
  return grouped(cases)
    .map(
      (g) =>
        `<section class="kind"><h4>${esc(g.kind.title)} <small>${plural(g.cases.length, "case")}</small></h4><p class="dim">${esc(g.kind.measures)}</p>${g.cases.map((c) => caseBlock(c, ctx, where)).join("")}</section>`,
    )
    .join("");
}

/** A task row; the tasks of an epic hang under it. */
function taskRow(t: Task, child: boolean): string {
  const tags = `${t.source === "title prefix" ? "" : tag("", t.source)}${t.epic ? tag("", "epic") : ""}${t.kind === "task" ? "" : tag("", t.kind)}${t.stale === true ? tag("stale", t.kind === "new" ? "stale: its file now exists" : "stale: its file changed") : ""}`;
  return `<div class="row${child ? " child" : ""}"><b>${esc(t.id)}</b><span>${inline(t.title)} ${tags}</span></div>`;
}

/** Epics first, each followed by its listed tasks, then the tasks with no listed epic. */
function ordered(tasks: readonly Task[]): string[] {
  const epics = tasks.filter((t) => t.epic);
  const under = (e: Task) => tasks.filter((t) => !t.epic && t.id.startsWith(`${e.id}.`));
  const placed = new Set(epics.flatMap(under));
  return [
    ...epics.flatMap((e) => [taskRow(e, false), ...under(e).map((t) => taskRow(t, true))]),
    ...tasks.filter((t) => !(t.epic || placed.has(t))).map((t) => taskRow(t, false)),
  ];
}

function taskCard(title: string, tasks: readonly Task[] | null, empty: string): string {
  if (tasks === null) {
    return card("Open tasks", "Not read.", `<p class="dim">Open tasks were not read.</p>`);
  }
  if (tasks.length === 0) {
    return card("Open tasks", "None.", `<p class="dim">${empty}</p>`);
  }
  return card("Open tasks", `${title}: ${plural(tasks.length, "task")}.`, rows(...ordered(tasks)));
}

// ---- tabs

function bar(p: Plugin, current: string): string {
  const tab = (route: string, label: string, sub: string) =>
    `<a href="#${route}" data-route="${route}"${route === current ? ' aria-current="page"' : ""}>${esc(label)}${sub}</a>`;
  const items = p.items.map((i) => tab(itemRoute(p, i), i.name, ` <small>${i.kind}</small>`));
  return `<nav class="tabs sub" aria-label="${esc(p.name)} sections">${[tab(pluginRoute(p), "Plugin overview", ""), ...items].join("")}</nav>`;
}

const li = (cls: string, text: string, n: number): string =>
  `<li class="s${cls}" style="animation-delay:${(n * 0.4).toFixed(1)}s">${esc(text)}</li>`;

function flow(i: Item): string {
  const steps = i.headings.slice(0, 8);
  if (steps.length === 0) {
    return "";
  }
  const parts = [
    li(" end", "Trigger", 0),
    ...steps.map((s, n) => li("", s, n + 1)),
    li(" end", "Report", steps.length + 1),
  ];
  return `<ol class="flow" aria-label="Flow of ${esc(i.name)}">${parts.join('<li class="a" aria-hidden="true">&rarr;</li>')}</ol>`;
}

const MODELS = ["haiku", "sonnet", "opus", "inherit"];

/** The collapsed developer rows of a skill or agent: path, name, model, tools. */
function itemDeveloper(i: Item, ctx: Ctx, where: string): string {
  const one = (t: Omit<Target, "file">) => field(where, { file: i.path, ...t });
  return [
    row("Path", `<code>${esc(i.path)}</code>`),
    row(
      "Name",
      pen(
        ctx,
        one({ section: "frontmatter name", label: "Name", value: i.name, control: "input" }),
        esc(i.name),
        true,
      ),
    ),
    row(
      "Model",
      pen(
        ctx,
        one({
          section: "frontmatter model",
          label: "Model",
          value: i.model ?? "",
          control: "select",
          options: [...new Set(["", ...MODELS, i.model ?? ""])],
        }),
        esc(i.model ?? "not set"),
        true,
      ),
    ),
    row(
      "Tools",
      pen(
        ctx,
        one({
          section: "frontmatter tools",
          label: "Tools, comma separated",
          value: i.tools ?? "",
          control: "input",
        }),
        esc(i.tools ?? "not restricted"),
        true,
      ),
    ),
  ].join("");
}

/** One labelled part of the text a skill or agent says about itself, with where it is written. */
const sourced = (label: string, source: string, body: string): string =>
  `<div class="src"><p class="src-head"><b>${esc(label)}</b><span>${source}</span></p>${body}</div>`;

/** The trigger words of an item as chips, with the pen that edits the description's list. */
function triggerChips(i: Item, ctx: Ctx, where: string): string {
  return pen(
    ctx,
    field(where, {
      file: i.path,
      section: "trigger words (in the description)",
      label: "Trigger words, comma separated",
      value: i.triggers.join(", "),
      control: "input",
      hint: "They live inside the description, so changing them changes when the skill fires.",
    }),
    i.triggers.length === 0
      ? `<p class="dim">The description has no <code>Triggers:</code> list.</p>`
      : `<div class="chips">${i.triggers.map((t) => `<span class="trig">${esc(t)}</span>`).join("")}</div>`,
  );
}

/** The opening paragraph of an item's body, with its pen. */
function openingText(i: Item, ctx: Ctx, where: string): string {
  if (i.opening === "") {
    return `<p class="dim">The body has no opening paragraph.</p>`;
  }
  return pen(
    ctx,
    field(where, {
      file: i.path,
      section: "body opening paragraph",
      label: "Opening paragraph",
      value: i.opening,
      hint: `It says why the ${i.kind} exists, for whom, and what is out of scope; the model reads it once the ${i.kind} has loaded.`,
    }),
    `<p>${inline(i.opening)}</p>`,
  );
}

/** The three parts of the top box: the description, the trigger words, the opening paragraph. */
function itemText(i: Item, ctx: Ctx, where: string): string {
  const file = `<code>${esc(i.path)}</code>`;
  const description = pen(
    ctx,
    field(where, {
      file: i.path,
      section: "frontmatter description",
      label: "Description",
      value: i.description,
      hint: "The harness reads the description to decide when to load this; a vague one means it never fires.",
    }),
    `<p>${inline(i.description)}</p>`,
  );
  return [
    sourced("Description", `${file}, frontmatter. Decides when the ${i.kind} fires.`, description),
    i.notFor === null ? "" : `<div class="note">${inline(i.notFor)}</div>`,
    sourced(
      "Trigger words",
      "The <code>Triggers:</code> list inside the description above.",
      triggerChips(i, ctx, where),
    ),
    sourced(
      "Opening paragraph",
      `${file}, the first paragraph of the body. What it says it is for.`,
      openingText(i, ctx, where),
    ),
  ].join("");
}

function itemCases(i: Item, ctx: Ctx, where: string): string {
  const list =
    i.cases.length === 0
      ? `<p class="dim">No eval case names this ${i.kind}.</p>`
      : evalGroups(i.cases, ctx, where);
  const add = action(
    ctx,
    {
      where,
      file: i.path,
      section: "new eval case",
      what: "add eval case",
      fields: [
        { name: "does", label: "What the eval does", control: "textarea", value: "" },
        { name: "expects", label: "What the grader expects", control: "textarea", value: "" },
      ],
    },
    "Add an eval case",
  );
  return list + add;
}

function itemPanel(p: Plugin, i: Item, ctx: Ctx): string {
  const route = itemRoute(p, i);
  const where = `${p.name}:${i.name}`;
  const dev = `<details class="note" style="margin-top:0"><summary>Path, model, tools</summary><div class="rows">${itemDeveloper(i, ctx, where)}</div></details>`;
  return panel(
    route,
    i.name,
    `${p.name} · ${i.kind}`,
    `<em>${esc(i.name)}</em>`,
    `${bar(p, route)}
<a class="back" href="#${pluginRoute(p)}">&larr; ${esc(p.name)} overview</a>
${card("Its own text", "Where each part comes from.", itemText(i, ctx, where), { tone: "soft" })}
${i.headings.length === 0 ? "" : card("How it works", "Its steps.", flow(i))}
${card("Evals", plural(i.cases.length, "case"), itemCases(i, ctx, where), { tone: "calm" })}
${card("References", "What it refers to.", referenceGraph(i.name, slug(route), i.references, `the files of this ${i.kind}`))}
${taskCard(`Tasks naming ${i.name}`, i.tasks, `No open task names <code>${esc(i.name)}</code>.`)}
${card("Developer", "", dev)}`,
  );
}

// ---- plugin overview

const CAP: Record<RefKind, number> = { plugin: 24, tool: 12, mcp: 8, web: 10 };

const id = (r: Reference): string => `${r.kind}:${r.name}`;

/** The graph of one level (a plugin, a skill, an agent) and the names found in that level's files. */
function referenceGraph(
  subject: string,
  uid: string,
  refs: readonly Reference[],
  where: string,
): string {
  const shown = (["plugin", "tool", "mcp", "web"] as const).flatMap((k) =>
    refs.filter((r) => r.kind === k).slice(0, CAP[k]),
  );
  if (refs.length === 0) {
    return `<p class="dim">No other plugin, tool, MCP server or web host is named in ${esc(where)}.</p>`;
  }
  const nodes: Vertex[] = [
    { id: "self", label: subject, cls: "hl", layer: 0 },
    ...shown.map((r): Vertex => ({ id: id(r), label: r.name, cls: KIND_CLASS[r.kind], layer: 1 })),
  ];
  const edges: Link[] = shown.map((r) => ({ from: "self", to: id(r), dep: r.dependency }));
  const more = refs.length - shown.length;
  const note = `Names only, found in ${esc(where)}; none is resolved or checked.${refs.some((r) => r.dependency) ? " Heavy arrows are <code>dependencies</code>." : ""}${more > 0 ? ` ${plural(more, "more name")} not drawn.` : ""}`;
  return `<figure>${graph(`${subject} refers to`, uid, nodes, edges)}<figcaption>${legendOf(refs)}<br>${note}</figcaption></figure>`;
}

/** The outside names of one kind that most parts hold first, capped so the biggest plugin stays readable. */
function shownNames(held: ReadonlyMap<string, readonly Reference[]>): Reference[] {
  const count = new Map<string, { ref: Reference; n: number }>();
  for (const refs of held.values()) {
    for (const r of refs) {
      const at = count.get(`${r.kind}:${r.name}`) ?? { ref: r, n: 0 };
      count.set(`${r.kind}:${r.name}`, { ref: r, n: at.n + 1 });
    }
  }
  const sorted = [...count.values()].toSorted(
    (a, b) => b.n - a.n || a.ref.name.localeCompare(b.ref.name),
  );
  return (["tool", "mcp", "web"] as const).flatMap((k) =>
    sorted
      .filter((x) => x.ref.kind === k)
      .slice(0, CAP[k])
      .map((x) => x.ref),
  );
}

const part = (key: string, label: string, href?: string): Vertex => ({
  id: key,
  label,
  cls: "part",
  layer: 1,
  ...(href === undefined ? {} : { href }),
});

/** The plugin graph: the plugin, its parts, and the names each part refers to. */
function pluginGraph(p: Plugin): string {
  const parts: Vertex[] = p.items.map((i) =>
    part(`${i.kind}:${i.name}`, i.name, `#${itemRoute(p, i)}`),
  );
  if (p.hooks.length > 0) {
    parts.push(part("hooks", plural(p.hooks.length, "hook")));
  }
  if (p.bin !== null) {
    parts.push(part("cli", `${p.bin} CLI`));
  }
  const other = p.bin === null ? "self" : "cli";
  const held = new Map<string, readonly Reference[]>([
    ...p.items.map((i): [string, readonly Reference[]] => [`${i.kind}:${i.name}`, i.references]),
    [other, p.otherReferences],
  ]);
  const own = new Map([...held].map(([k, v]) => [k, v.filter((r) => r.kind !== "plugin")]));
  const shown = shownNames(own);
  const plugins = p.references.filter((r) => r.kind === "plugin");
  const nodes: Vertex[] = [
    { id: "self", label: p.name, cls: "hl", layer: 0 },
    ...parts,
    ...plugins.map((r): Vertex => ({ id: id(r), label: r.name, cls: "node", layer: 1 })),
    ...shown.map((r): Vertex => ({ id: id(r), label: r.name, cls: KIND_CLASS[r.kind], layer: 2 })),
  ];
  const edges: Link[] = [
    ...parts.map((v) => ({ from: "self", to: v.id, dep: false, own: true })),
    ...plugins.map((r) => ({ from: "self", to: id(r), dep: r.dependency })),
    ...[...own].flatMap(([from, refs]) =>
      refs.filter((r) => shown.includes(r)).map((r) => ({ from, to: id(r), dep: false })),
    ),
  ];
  const every = [...p.references];
  const drawn = new Set(shown.map(id));
  const more = every.filter((r) => r.kind !== "plugin" && !drawn.has(id(r))).length;
  const note = `Dashed lines join the plugin to its own parts. An arrow points from what is used to its user. Names only; none is resolved or checked. A name found in a skill or agent hangs off it; a name found in the scripts, lib, qsm.json or docs hangs off ${p.bin === null ? "the plugin" : "the CLI"}.${plugins.some((r) => r.dependency) ? " Heavy arrows are <code>dependencies</code>." : ""}${more > 0 ? ` ${plural(more, "more name")} not drawn.` : ""} Click a skill or agent to open it.`;
  if (nodes.length === 1) {
    return `<p class="dim">${esc(p.name)} ships no skill, agent, hook or CLI and names nothing outside.</p>`;
  }
  return `<figure>${graph(`${p.name} and what it refers to`, slug(p.name), nodes, edges)}<figcaption>${legendOf(every)}<br>${note}</figcaption></figure>`;
}

/** Skills and agents, each with what it says about itself, read only: the pens are on its own panel. */
function shipped(p: Plugin): string {
  const articles = p.items.map(
    (i) =>
      `<article class="ship"><h4><a href="#${itemRoute(p, i)}">${esc(i.name)}</a> ${tag(i.kind, i.kind)}</h4><p>${inline(i.description)}</p>${i.triggers.length === 0 ? "" : `<div class="chips">${i.triggers.map((t) => `<span class="trig">${esc(t)}</span>`).join("")}</div>`}${i.opening === "" ? "" : `<p class="dim">${inline(i.opening)}</p>`}</article>`,
  );
  return card(
    "Skills and agents",
    `${plural(kindCount(p, "skill"), "skill")}, ${plural(kindCount(p, "agent"), "agent")}.`,
    articles.length === 0
      ? `<p class="dim">This plugin ships no skill or agent.</p>`
      : articles.join(""),
    { tone: "calm" },
  );
}

/** The spec's requirements by title, each with its count of scenarios. */
function specCard(p: Plugin): string {
  if (p.requirements.length === 0) {
    return card("Spec", "None.", `<p class="dim">This plugin has no requirement in its spec.</p>`);
  }
  const lines = p.requirements.map((r) => row(plural(r.scenarios, "scenario"), esc(r.title)));
  return card("Spec", `${plural(p.requirements.length, "requirement")}.`, rows(...lines));
}

/** One eval case on one row: its name, its tags and its last result. */
function evalRow(c: Case, owner: string): string {
  const r = c.result;
  const result =
    r === null
      ? `<span class="dim">${esc(c.noResult)}</span>`
      : `${tag(meetsBar(r) ? "skill" : "stale", meetsBar(r) ? "bar met" : "bar not met")} with ${r.withPass}/${r.withTotal}, without ${r.withoutPass === null ? "not run" : `${r.withoutPass}/${r.withoutTotal}`}, ${esc(r.date)}`;
  return row(c.name, `${owner}${c.tags.map((t) => tag(TONE[t] ?? "", t)).join("")} ${result}`);
}

/** Every eval case of the plugin on one row: its name, its tags and its last result. */
function evalsCard(p: Plugin, ctx: Ctx): string {
  const lines = [
    ...p.items.flatMap((i) =>
      i.cases.map((c) => evalRow(c, `<a href="#${itemRoute(p, i)}">${esc(i.name)}</a> `)),
    ),
    ...p.looseCases.map((c) => evalRow(c, "")),
  ];
  const loose =
    p.looseCases.length === 0
      ? ""
      : `<p class="src-head" style="margin-top:24px"><b>Evals that name no skill or agent</b><span>Their names do not start with the name of a skill or agent of this plugin.</span></p>${evalGroups(p.looseCases, ctx, p.name)}`;
  if (lines.length === 0) {
    return card("Evals", "None.", `<p class="dim">No eval case is written for this plugin.</p>`);
  }
  return card(
    "Evals",
    `${plural(lines.length, "case")}.`,
    `<p class="dim">The last result of each case, written by the eval runner. A case opens on the page of the skill or agent it names.</p>${rows(...lines)}${loose}`,
  );
}

/** One hook: its event, the comment that says what it does, and the verbs it calls. */
function hookRow(p: Plugin, h: Hook, ctx: Ctx): string {
  const what =
    h.what === null
      ? ""
      : pen(
          ctx,
          field(p.name, {
            file: `${p.dir}/${h.file}`,
            section: `hook ${h.event} comment`,
            label: `What the ${h.event} hook does`,
            value: h.what,
          }),
          inline(h.what),
        );
  const calls = h.calls.map(
    (c) => `<div class="dim">calls <code>${esc(c.verb)}</code>: ${inline(c.description)}</div>`,
  );
  const body = what + calls.join("");
  return row(
    `${h.event}${h.command ? " (command)" : ""}`,
    body === "" ? `<span class="dim">no description is written</span>` : body,
  );
}

function surface(p: Plugin, ctx: Ctx): string {
  const verbText = (v: { name: string; description: string }): string =>
    pen(
      ctx,
      field(p.name, {
        file: `${p.dir}/qsm.json`,
        section: `command ${v.name} description`,
        label: `Description of ${v.name}`,
        value: v.description,
      }),
      inline(v.description),
    );
  const verbs =
    p.verbs.length === 0
      ? ""
      : card("CLI", "", rows(...p.verbs.map((v) => row(v.name, verbText(v)))), {
          titleHtml: `<code>${esc(p.bin ?? "")}</code>`,
        });
  const hooks =
    p.hooks.length === 0
      ? ""
      : card(
          "Hooks",
          `${plural(p.hooks.length, "hook")}.`,
          rows(...p.hooks.map((h) => hookRow(p, h, ctx))),
        );
  return hooks + verbs;
}

function developer(p: Plugin, ctx: Ctx): string {
  const body = [
    row("Plugin", `<code>${esc(p.dir)}</code>`),
    row(
      "Description",
      pen(
        ctx,
        field(p.name, {
          file: `${p.dir}/.claude-plugin/plugin.json`,
          section: "description",
          label: "Description",
          value: p.description,
        }),
        inline(p.description),
      ),
    ),
    ...p.items.map((i) => row(`${i.kind} ${i.name}`, `<code>${esc(i.path)}</code>`)),
    row("Evals", `<code>${esc(p.dir)}/evals</code>`),
  ].join("");
  return card(
    "Developer",
    "",
    `<details class="note" style="margin-top:0"><summary>Paths</summary><div class="rows">${body}</div></details>`,
  );
}

/** The declared dependencies, each with the reason the plugin's spec gives for it. */
function dependenciesCard(p: Plugin): string {
  if (p.dependencies.length === 0) {
    return card("Dependencies", "None.", `<p class="dim">This plugin declares no dependency.</p>`);
  }
  const lines = p.dependencies.map((d) =>
    row(
      d,
      p.dependencyReasons[d] === undefined
        ? `<span class="dim">no reason is written</span>`
        : inline(p.dependencyReasons[d] ?? ""),
    ),
  );
  return card(
    "Dependencies",
    "What it needs installed, and why.",
    `${rows(...lines)}<p class="dim" style="margin-top:12px">The reasons are written in the plugin's spec, requirement Dependencies.</p>`,
  );
}

function pluginPanel(p: Plugin, ctx: Ctx): string {
  const route = pluginRoute(p);
  const why =
    p.why === null
      ? "<p>This plugin has no Why it exists section in its README.md.</p>"
      : pen(
          ctx,
          field(p.name, {
            file: `${p.dir}/README.md`,
            section: "Why it exists",
            label: "Why it exists",
            control: "long",
            value: p.why,
          }),
          prose(p.why),
        );
  return panel(
    route,
    p.name,
    "plugin",
    `<em>${esc(p.name)}</em>`,
    `${bar(p, route)}
${card("Why it exists", "", why, { tone: "soft" })}
${shipped(p)}
${surface(p, ctx)}
${specCard(p)}
${evalsCard(p, ctx)}
${taskCard("Open epics and tasks", p.tasks, `No open task starts with <code>${esc(p.name)}:</code> or names the plugin.`)}
${dependenciesCard(p)}
${card("References", "What it refers to.", pluginGraph(p))}
${developer(p, ctx)}`,
  );
}

export interface PageOptions {
  /** the page is served: it listens for changes and redraws */
  readonly live?: boolean;
  /**
   * The page holds one view: the overview (null) or the plugin of that name, not every panel. The
   * export and the artifact leave it unset and hold all of them.
   */
  readonly only?: string | null;
  /**
   * every text gets a pen; `sha` reads a file's sha256 now. `server`: the page is served and saves
   * an edit as a task. `artifact`: the page is published; the pens stay hidden until the artifact
   * database answers, and save rows there for `lens pull`.
   */
  readonly edit?: {
    readonly sha: (relativePath: string) => string;
    readonly transport: "server" | "artifact";
  };
}

/** The page as a whole document, so a file opens in a browser from disk and a server can send it. */
export function renderDocument(m: Marketplace, opts: PageOptions = {}): string {
  return `<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n${renderPage(m, opts)}`;
}

/** A link of the top row: a hash route on a page that holds every panel, a path on a paged one. */
function top(ctx: Ctx, route: string, href: string, label: string, here: boolean): string {
  return ctx.paged
    ? `<a href="${esc(href)}"${here ? ' aria-current="page"' : ""}>${esc(label)}</a>`
    : `<a href="#${route}" data-route="${route}" data-top="1">${esc(label)}</a>`;
}

export function renderPage(m: Marketplace, opts: PageOptions = {}): string {
  const only = opts.only;
  const ctx: Ctx = { root: m.dir, edit: opts.edit, paged: only !== undefined };
  const links = [
    top(ctx, "overview", "/", "Overview", only === null),
    ...m.plugins.map((p) => top(ctx, pluginRoute(p), pluginHref(ctx, p), p.name, p.name === only)),
  ].join("");
  const plugins = m.plugins.filter((p) => only === undefined || p.name === only);
  const panels = [
    ...(only === undefined || only === null ? [overview(m, ctx)] : []),
    ...(only === null
      ? []
      : plugins.flatMap((p) => [pluginPanel(p, ctx), ...p.items.map((i) => itemPanel(p, i, ctx))])),
    ...(opts.edit === undefined || (only !== undefined && only !== null)
      ? []
      : [newItemPanel(m, ctx)]),
  ];
  return `<title>${esc(m.name)} marketplace lens</title>
<style>${CSS}${opts.edit === undefined ? "" : PEN_CSS}${opts.edit?.transport === "artifact" ? WAIT_CSS : ""}</style>
<a class="skip" href="#main">Skip to the content</a>
<button class="theme" type="button" id="theme">Light / dark</button>
<div class="sheet"><header class="part masthead"><span class="eyebrow">${esc(m.name)} · marketplace lens</span><h1 class="site">Plugins <em>and what proves them</em></h1>
<p class="lede">Why each plugin exists, what its skills and agents promise, and the eval cases that check them. Read from the files of <code>${esc(m.name)}</code> on ${esc(m.madeAt.slice(0, 10))}; nothing here is written by a model.</p>
${opts.edit?.transport === "server" ? "" : `<p class="dim read-only" style="margin-top:8px">This page is a snapshot and is read-only. Edits are made on <code>qsm-builder lens</code>, which serves this page and turns each edit into a task, or on this page once it is published as an artifact.</p>`}
<nav class="tabs" aria-label="Overview and plugins">${links}</nav></header>
<main id="main" tabindex="-1">
${panels.join("\n")}
</main></div>
<script>${SCRIPT}</script>
${opts.edit === undefined ? "" : `<script>${PEN_SCRIPT}</script>\n`}${opts.edit?.transport === "artifact" ? `<script>${ARTIFACT_SCRIPT}</script>\n` : ""}${opts.live === true ? `<script>${LIVE_SCRIPT}</script>\n` : ""}`;
}
