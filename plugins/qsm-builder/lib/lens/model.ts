// The marketplace read into one typed value. Everything here is read from files; nothing is
// resolved or checked: a reference is a name, a missing optional file is a null or "not read".

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { YAML } from "bun";
import { type CommandDecl, toCamel, verbsOf } from "../../../../lib/qsm-manifest.ts";
import { commandHook, functionHooks, type Hook, type Methods } from "./hooks.ts";
import {
  type Reference,
  refsOf,
  refsOfFiles,
  refsOutsideParts,
  type Scope,
  scopeOf,
  searchedNames,
  textFiles,
} from "./refs.ts";
import { names, readTasks, type Task, tasksOf } from "./tasks.ts";

export class ModelError extends Error {
  readonly code: "missing" | "failed";
  constructor(code: "missing" | "failed", message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

export interface Case {
  readonly name: string;
  readonly dir: string;
  readonly tags: readonly string[];
  /** the opening line of an llm grader that starts `Intent of this eval:`, without that prefix */
  readonly intent: string | null;
  /** the first sentence of the prompt */
  readonly prompt: string;
  /** the whole prompt the agent is given, as one text */
  readonly promptText: string;
  readonly graders: readonly Grader[];
  /** absolute path of prompt.md */
  readonly promptFile: string;
  /** absolute path of the file that holds name, tags, runs: case.yaml, else the prompt */
  readonly metaFile: string;
  /** absolute path of the grader whose first line is the intent; null without one */
  readonly intentFile: string | null;
  readonly runs: string;
  readonly maxTurns: string;
  /** the latest result; null when there is none, and then `noResult` says why */
  readonly result: CaseResult | null;
  readonly noResult: string;
}

export interface CaseResult {
  readonly withPass: number;
  readonly withTotal: number;
  /** null when the case ran no arm without the plugin */
  readonly withoutPass: number | null;
  readonly withoutTotal: number;
  readonly run: string;
  /** the date of the result file, `YYYY-MM-DD` */
  readonly date: string;
}

/** The bar of skill-standards: every run with the plugin passes and at most one without does. */
export const meetsBar = (r: CaseResult): boolean =>
  r.withTotal > 0 && r.withPass === r.withTotal && (r.withoutPass ?? 0) <= 1;

export interface Grader {
  readonly name: string;
  /** absolute path */
  readonly file: string;
  /** the regex pattern, the tool of a tool_used grader; "" otherwise */
  readonly core: string;
  readonly type: string;
  /** llm: its first line; regex: the pattern; tool_used: the tool and counts */
  readonly summary: string;
  /** what the grader accepts, in words */
  readonly how: string;
  /** an llm grader's rule without its intent line; "" for the other types */
  readonly rule: string;
}

export interface Item {
  readonly kind: "skill" | "agent";
  readonly name: string;
  readonly description: string;
  readonly path: string;
  /** the opening paragraph of the body */
  readonly opening: string;
  readonly triggers: readonly string[];
  readonly notFor: string | null;
  /** the `##` headings of the body, in order */
  readonly headings: readonly string[];
  readonly model: string | null;
  readonly tools: string | null;
  readonly cases: readonly Case[];
  /** the names found in this item's own files only */
  readonly references: readonly Reference[];
  /** open tasks that name this item; null when tasks were not read */
  readonly tasks: readonly Task[] | null;
}

interface Verb {
  readonly name: string;
  readonly description: string;
}

export interface Plugin {
  readonly name: string;
  readonly dir: string;
  readonly description: string;
  readonly dependencies: readonly string[];
  /** `keywords` of plugin.json */
  readonly keywords: readonly string[];
  /** the reason the plugin's spec gives for each dependency; a name with none is absent */
  readonly dependencyReasons: Readonly<Record<string, string>>;
  /** the body of the README's `## Why it exists` section; null without one */
  readonly why: string | null;
  readonly items: readonly Item[];
  /** eval cases that name no skill or agent of the plugin */
  readonly looseCases: readonly Case[];
  readonly bin: string | null;
  readonly verbs: readonly Verb[];
  readonly hooks: readonly Hook[];
  readonly references: readonly Reference[];
  /** the names found in files outside `skills/` and `agents/` (scripts, lib, qsm.json, docs) */
  readonly otherReferences: readonly Reference[];
  /** null when tasks were not read */
  readonly tasks: readonly Task[] | null;
}

export interface Marketplace {
  readonly dir: string;
  readonly name: string;
  readonly why: string | null;
  readonly plugins: readonly Plugin[];
  readonly tasksNote: string;
  readonly madeAt: string;
}

const read = (path: string): string | null =>
  existsSync(path) ? readFileSync(path, "utf8") : null;

const dirs = (path: string): string[] =>
  existsSync(path)
    ? readdirSync(path, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];

const parseFailure = (label: string, cause: unknown): ModelError =>
  new ModelError("failed", `${label} does not parse: ${(cause as Error).message}`, { cause });

function parse(label: string, text: string, parser: (t: string) => unknown): unknown {
  try {
    return parser(text);
  } catch (error) {
    throw parseFailure(label, error);
  }
}

const json = (label: string, text: string) =>
  parse(label, text, JSON.parse) as Record<string, unknown>;

/** The frontmatter and the body of a markdown file (no frontmatter: empty meta). */
function split(label: string, text: string): { meta: Record<string, unknown>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (m === null) {
    return { meta: {}, body: text };
  }
  const meta = parse(`${label} frontmatter`, m[1] ?? "", (t) => YAML.parse(t)) ?? {};
  return { meta: meta as Record<string, unknown>, body: text.slice(m[0].length) };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const squash = (s: string): string => s.replace(/\s+/g, " ").trim();

/** The first paragraph that is not a heading, on one line. */
function opening(body: string): string {
  const paragraphs = body.split(/\r?\n\s*\r?\n/).map((p) => p.trim());
  return squash(
    paragraphs.find((p) => p !== "" && !p.startsWith("#") && !p.startsWith("```")) ?? "",
  );
}

export function firstSentence(text: string): string {
  const flat = squash(text);
  return /^.*?[.!?](?=\s|$)/.exec(flat)?.[0] ?? flat;
}

/** The `##` headings of a body outside code fences, in order. */
function headings(body: string): string[] {
  const found: string[] = [];
  let inFence = false;
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith("```")) {
      inFence = !inFence;
    } else if (!inFence && line.startsWith("## ")) {
      found.push(line.slice(3).trim());
    }
  }
  return found;
}

const QUOTES = "\u0022\u0027";

/** A trigger word without the quote marks around it. */
function unquote(s: string): string {
  const start = QUOTES.includes(s.charAt(0)) ? 1 : 0;
  const end = s.length > start && QUOTES.includes(s.at(-1) ?? "") ? s.length - 1 : s.length;
  return s.slice(start, end);
}

function triggersOf(description: string): string[] {
  const m = /Triggers?:\s*(.+?)(?:\.(?:\s+[A-Z]|\s*$)|$)/s.exec(description);
  return (m?.[1] ?? "")
    .split(",")
    .map((t) => unquote(squash(t)))
    .filter((t) => t !== "")
    .slice(0, 16);
}

const notForOf = (description: string): string | null =>
  /\bNot for [^.]*\./.exec(description)?.[0] ?? null;

/** The one line a grader shows: its first line, its pattern, or its tool and counts. */
const INTENT_PREFIX = "Intent of this eval:";

function summaryOf(type: string, meta: Record<string, unknown>, body: string): string {
  const shown: Record<string, () => string> = {
    regex: () => `/${str(meta.pattern)}/${str(meta.flags)}`,
    tool_used: () =>
      `${str(meta.tool)} (min ${String(meta.min ?? 1)}, max ${String(meta.max ?? "any")}, arm ${str(meta.arm) || "with"})`,
  };
  return shown[type]?.() ?? squash(body.trim().split(/\r?\n/)[0] ?? "");
}

const ARM: Record<string, string> = {
  "with-only": "checked only with the plugin installed",
  both: "checked with and without the plugin",
  "without-only": "checked only without the plugin",
};

const FOCUS: Record<string, string> = {
  trace: "the agent's whole trace (tool calls and reasoning)",
  last_message: "the agent's final reply",
};

/** How often a `tool_used` grader wants the tool called, in words. */
function countWords(tool: string, min: number, max: number | null): string {
  if (max === 0) {
    return `never called the ${tool} tool`;
  }
  const times = (n: number) => (n === 1 ? "once" : `${n} times`);
  if (max === null) {
    return `called the ${tool} tool at least ${times(min)}`;
  }
  return min === max
    ? `called the ${tool} tool exactly ${times(min)}`
    : `called the ${tool} tool ${min} to ${max} times`;
}

/** What a grader accepts, in words a person who never saw the file can follow. */
function howOf(type: string, meta: Record<string, unknown>): string {
  const arm = ARM[str(meta.arm)];
  const armWords = arm === undefined ? "" : `; ${arm}`;
  if (type === "tool_used") {
    const max = meta.max === undefined ? null : Number(meta.max);
    const match =
      str(meta.input_match) === ""
        ? ""
        : `, counting only calls whose input matches ${str(meta.input_match)}`;
    return `passes when the agent ${countWords(str(meta.tool), Number(meta.min ?? 1), max)}${match}${armWords}`;
  }
  if (type === "regex") {
    const flags = str(meta.flags).includes("i") ? ", ignoring case" : "";
    return `passes when the agent's output matches the pattern${flags}${armWords}`;
  }
  if (type === "llm") {
    return `a judge model reads ${FOCUS[str(meta.focus)] ?? "the agent's work"} and passes it when the rule below holds${armWords}`;
  }
  return "an unknown grader type";
}

function graderOf(file: string): Grader {
  const { meta, body } = split(file, readFileSync(file, "utf8"));
  const type = str(meta.type) || "unknown";
  const core = { regex: str(meta.pattern), tool_used: str(meta.tool) }[type as "regex"] ?? "";
  const lines = body.trim().split(/\r?\n/);
  const rule =
    type === "llm"
      ? squash(lines.slice(lines[0]?.startsWith(INTENT_PREFIX) ? 1 : 0).join(" "))
      : "";
  return {
    name: basename(file, ".md"),
    file,
    core,
    type,
    summary: summaryOf(type, meta, body),
    how: howOf(type, meta),
    rule,
  };
}

interface Aggregate {
  cases?: {
    name: string;
    arms?: { with?: { passed?: boolean }[]; without?: { passed?: boolean }[] };
  }[];
}

const passes = (arms: { passed?: boolean }[]): number =>
  arms.filter((x) => x.passed === true).length;

interface Run {
  readonly run: string;
  readonly agg: Aggregate;
  readonly date: string;
}

/** The latest run that holds the case; or why there is none. */
function resultOf(
  results: readonly Run[],
  name: string,
  hasDir: boolean,
): { result: CaseResult | null; noResult: string } {
  const none = (noResult: string) => ({ result: null, noResult });
  if (!hasDir) {
    return none("no results");
  }
  if (results.length === 0) {
    return none("not read (no aggregate-result.json)");
  }
  const latest = [...results]
    .reverse()
    .map((r) => ({ r, arms: r.agg.cases?.find((x) => x.name === name)?.arms }))
    .find(({ arms }) => (arms?.with ?? []).length > 0);
  if (latest === undefined) {
    return none("no result for this case");
  }
  const w = latest.arms?.with ?? [];
  const wo = latest.arms?.without ?? [];
  return {
    result: {
      withPass: passes(w),
      withTotal: w.length,
      withoutPass: wo.length > 0 ? passes(wo) : null,
      withoutTotal: wo.length,
      run: latest.r.run,
      date: latest.r.date,
    },
    noResult: "",
  };
}

function loadResults(evals: string): { hasDir: boolean; results: Run[] } {
  const dir = join(evals, "results");
  const results = dirs(dir).flatMap((run) => {
    const file = join(dir, run, "aggregate-result.json");
    const text = read(file);
    return text === null
      ? []
      : [
          {
            run,
            agg: json(`${run}/aggregate-result.json`, text) as Aggregate,
            date: statSync(file).mtime.toISOString().slice(0, 10),
          },
        ];
  });
  return { hasDir: existsSync(dir), results };
}

function gradersOf(dir: string): Grader[] {
  const gdir = join(dir, "graders");
  return existsSync(gdir)
    ? readdirSync(gdir)
        .filter((f) => f.endsWith(".md"))
        .sort()
        .map((f) => graderOf(join(gdir, f)))
    : [];
}

/** The case's metadata: case.yaml, else the prompt's frontmatter. */
function caseMeta(dir: string, fallback: Record<string, unknown>): Record<string, unknown> {
  const file = join(dir, "case.yaml");
  if (!existsSync(file)) {
    return fallback;
  }
  return (parse(file, readFileSync(file, "utf8"), (t) => YAML.parse(t)) ?? {}) as Record<
    string,
    unknown
  >;
}

const scalar = (v: unknown): string =>
  typeof v === "string" || typeof v === "number" ? String(v) : "";

function caseOf(dir: string, name: string): Case | null {
  const promptFile = join(dir, "prompt.md");
  if (!(existsSync(join(dir, "case.yaml")) || existsSync(promptFile))) {
    return null;
  }
  const prompt = split(promptFile, read(promptFile) ?? "");
  const meta = caseMeta(dir, prompt.meta);
  const graders = gradersOf(dir);
  const line = graders.find((g) => g.type === "llm" && g.summary.startsWith(INTENT_PREFIX));
  const metaFile = join(dir, "case.yaml");
  return {
    name: str(meta.name) || name,
    dir,
    tags: strings(meta.tags),
    intent: line === undefined ? null : line.summary.slice(INTENT_PREFIX.length).trim(),
    prompt: firstSentence(opening(prompt.body)),
    promptText: prompt.body.trim(),
    graders,
    promptFile,
    metaFile: existsSync(metaFile) ? metaFile : promptFile,
    intentFile: line?.file ?? null,
    runs: scalar(meta.runs),
    maxTurns: scalar(meta.max_turns),
    result: null,
    noResult: "",
  };
}

function casesOf(pluginDir: string): Case[] {
  const evals = join(pluginDir, "evals");
  const { hasDir, results } = loadResults(evals);
  return dirs(evals)
    .filter((d) => d !== "results" && d !== "mocks")
    .flatMap((d) => {
      const c = caseOf(join(evals, d), d);
      return c === null ? [] : [{ ...c, ...resultOf(results, c.name, hasDir) }];
    });
}

function itemOf(kind: Item["kind"], file: string, root: string, scope: Scope): Item {
  const { meta, body } = split(file, readFileSync(file, "utf8"));
  const description = squash(str(meta.description));
  const { tools } = meta;
  return {
    kind,
    name: str(meta.name) || basename(file, ".md"),
    description,
    path: relative(root, file),
    opening: opening(body),
    triggers: triggersOf(description),
    notFor: notForOf(description),
    headings: headings(body),
    model: str(meta.model) || null,
    tools: Array.isArray(tools) ? tools.join(", ") : str(tools) || null,
    cases: [],
    // A skill's own files are its directory; an agent is one file.
    references: refsOfFiles(scope, kind === "skill" ? textFiles(dirname(file)) : [file], []),
    tasks: null,
  };
}

/** The case belongs to the item whose name is the longest prefix of the case name. */
function attach(items: readonly Item[], cases: readonly Case[]): { items: Item[]; loose: Case[] } {
  const owner = (c: Case): Item | undefined =>
    items
      .filter((i) => c.name === i.name || c.name.startsWith(`${i.name}-`))
      .sort((a, b) => b.name.length - a.name.length)[0];
  const loose = cases.filter((c) => owner(c) === undefined);
  return { items: items.map((i) => ({ ...i, cases: cases.filter((c) => owner(c) === i) })), loose };
}

interface Qsm {
  bin?: Record<string, string>;
  noun?: string;
  commands?: Record<string, CommandDecl>;
}

/** `<noun>.<method>` of each verb, the way the generated noun joins its words. */
function methodsOf(qsm: Qsm | undefined, bin: string | null): Methods {
  if (qsm?.noun === undefined || bin === null) {
    return new Map();
  }
  const commands = verbsOf({ qsm: { commands: qsm.commands ?? {} } }, bin);
  return new Map(
    [...commands].map(([verb, d]) => [
      `${qsm.noun}.${toCamel(verb.replaceAll(" ", "-"))}`,
      { verb, description: squash(str(d.description)) },
    ]),
  );
}

/** The source of a classic command hook, named by the last part of its command. */
function commandSource(dir: string, command: string): { file: string; src: string | null } {
  const name = /([\w.-]+)"?$/.exec(command.trim())?.[1] ?? command;
  const file = ["ts", "tsx"]
    .map((ext) => `hooks/${name}.${ext}`)
    .find((f) => existsSync(join(dir, f)));
  return { file: file ?? `hooks/${name}`, src: file === undefined ? null : read(join(dir, file)) };
}

interface Group {
  hooks?: { command?: string }[];
}

function hooksOf(dir: string, methods: Methods): Hook[] {
  const file = join(dir, "hooks", "hooks.json");
  const text = read(file);
  if (text === null) {
    return [];
  }
  const cfg = json(file, text);
  const modules = (Array.isArray(cfg.modules) ? cfg.modules.map(String) : []).flatMap((mod) => {
    const path = `hooks/${mod.replace(/^\.\//, "")}`;
    return functionHooks(path, read(join(dir, path)) ?? "", methods);
  });
  const command = Object.entries((cfg.hooks ?? {}) as Record<string, Group[]>).flatMap(
    ([event, groups]) =>
      groups.flatMap((g) =>
        (g.hooks ?? []).map((h) => {
          const { file: source, src } = commandSource(dir, str(h.command));
          return commandHook(source, event, src);
        }),
      ),
  );
  return [...modules, ...command];
}

/** The skills (one directory each, SKILL.md inside) and agents (one markdown file each) of a plugin. */
function itemsOf(dir: string, root: string, scope: Scope): Item[] {
  const skills = join(dir, "skills");
  const agents = join(dir, "agents");
  return [
    ...dirs(skills)
      .filter((d) => existsSync(join(skills, d, "SKILL.md")))
      .map((d) => itemOf("skill", join(skills, d, "SKILL.md"), root, scope)),
    ...(existsSync(agents) ? readdirSync(agents) : [])
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => itemOf("agent", join(agents, f), root, scope)),
  ];
}

function pluginOf(
  name: string,
  dir: string,
  root: string,
  vocabulary: { known: ReadonlySet<string>; searched: ReadonlySet<string> },
): Plugin {
  const scope = scopeOf(name, vocabulary.known, vocabulary.searched);
  const pj = read(join(dir, ".claude-plugin", "plugin.json"));
  const manifest = pj === null ? {} : json(`${name} plugin.json`, pj);
  const dependencies = strings(manifest.dependencies);
  const { items, loose } = attach(itemsOf(dir, root, scope), casesOf(dir));
  const qsmText = read(join(dir, "qsm.json"));
  const qsm = qsmText === null ? null : (json(`${name} qsm.json`, qsmText).qsm as Qsm | undefined);
  const bin = Object.keys(qsm?.bin ?? {})[0] ?? null;
  const references = refsOf(scope, dir, dependencies);
  const otherReferences = refsOutsideParts(scope, dir, dependencies);
  return {
    name,
    dir: relative(root, dir),
    description: squash(str(manifest.description)),
    dependencies,
    keywords: strings(manifest.keywords),
    dependencyReasons: dependencyReasons(name, dir),
    why: whyOf(dir),
    items,
    looseCases: loose,
    bin,
    verbs: Object.entries(qsm?.commands ?? {}).map(([k, v]) => ({
      name: k,
      description: squash(str(v.description)),
    })),
    hooks: hooksOf(dir, methodsOf(qsm ?? undefined, bin)),
    references,
    otherReferences,
    tasks: null,
  };
}

const TICK = "\u0060";

/** One `- <tick>name<tick>: reason` bullet of the Dependencies requirement: its name and reason. */
function bulletOf(line: string): { name: string; reason: string } | null {
  const open = `- ${TICK}`;
  const close = line.indexOf(`${TICK}: `, open.length);
  return line.startsWith(open) && close > 0
    ? { name: line.slice(open.length, close), reason: line.slice(close + 3) }
    : null;
}

/**
 * The reason each dependency has in the plugin's spec: the bullets of its `Dependencies`
 * requirement, a reason that continues on the lines under its bullet joined into one.
 */
function dependencyReasons(name: string, dir: string): Record<string, string> {
  const lines = (read(join(dir, "openspec", "specs", name, "spec.md")) ?? "").split(/\r?\n/);
  const start = lines.indexOf("### Requirement: Dependencies");
  const reasons: Record<string, string> = {};
  let current: string | null = null;
  for (const line of start < 0 ? [] : lines.slice(start + 1)) {
    const bullet = bulletOf(line);
    if (line.startsWith("#")) {
      break;
    }
    if (bullet !== null) {
      current = bullet.name;
      reasons[current] = bullet.reason;
    } else if (current !== null && line.trim() !== "") {
      reasons[current] = squash(`${reasons[current]} ${line}`);
    } else {
      current = null;
    }
  }
  return reasons;
}

/** The body of the README's `## Why it exists` section in dir, or null. */
function whyOf(dir: string): string | null {
  const text = read(join(dir, "README.md"));
  const m = text?.match(/^## Why it exists\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  return m?.[1]?.trim() ?? null;
}

export function readMarketplace(dir: string): Marketplace {
  const file = join(dir, ".claude-plugin", "marketplace.json");
  const text = read(file);
  if (text === null) {
    throw new ModelError("missing", `${file} is missing: ${dir} is not a marketplace`);
  }
  const mp = json(file, text);
  const entries = (Array.isArray(mp.plugins) ? mp.plugins : []) as {
    name?: string;
    source?: string;
  }[];
  const known = new Set(entries.map((e) => str(e.name)));
  const tasks = readTasks(dir);
  const searched = searchedNames(dir);
  const plugins = entries.map((e) => {
    const name = str(e.name);
    const pdir = join(dir, str(e.source) || `plugins/${name}`);
    if (!existsSync(pdir)) {
      throw new ModelError("missing", `${pdir} is missing: marketplace.json lists ${name}`);
    }
    const p = pluginOf(name, pdir, dir, { known, searched });
    const list = tasksOf(name, tasks.open);
    const items = p.items.map((i) => ({
      ...i,
      tasks: list === null ? null : list.filter((t) => names(t.title, i.name)),
    }));
    return { ...p, items, tasks: list };
  });
  return {
    dir,
    name: str(mp.name) || basename(dir),
    why: whyOf(dir),
    plugins,
    tasksNote: tasks.note,
    madeAt: new Date().toISOString(),
  };
}
