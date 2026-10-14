// Open tasks from `br list --json`: a plugin's own (title starts with `<plugin>:` or the name without `qsm-`) and the project
// tasks that name it. Without br, or when it fails here, the page says tasks were not read.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync, which } from "bun";
import { isRecord } from "../guards.ts";

/** What the task is: an edit made on the lens, a new item asked for on it, feedback on a tool, or any other task. */
type TaskKind = "edit" | "new" | "feedback" | "task";

interface OpenTask {
  readonly id: string;
  readonly title: string;
  readonly kind: TaskKind;
  /** an edit whose target file no longer has the sha256 the page was rendered with, or a new item whose file now exists; null for other kinds */
  readonly stale: boolean | null;
  readonly epic: boolean;
}

export interface Task extends OpenTask {
  /** why it is listed for the plugin */
  readonly source: "title prefix" | "names the plugin" | "epic of a listed task";
}

export interface TaskRead {
  /** null when tasks were not read */
  readonly open: readonly OpenTask[] | null;
  readonly note: string;
}

export interface Issue {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly issue_type?: string;
  readonly description?: string;
  readonly labels?: readonly string[];
}

function isIssue(value: unknown): value is Issue {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.status === "string" &&
    (value.issue_type === undefined || typeof value.issue_type === "string") &&
    (value.description === undefined || typeof value.description === "string") &&
    (value.labels === undefined ||
      (Array.isArray(value.labels) && value.labels.every((l) => typeof l === "string")))
  );
}

/** The issues of `br list --json` output; throws when the text is not JSON. */
export function issuesOf(text: string): Issue[] {
  const parsed: unknown = JSON.parse(text);
  const listed: unknown = isRecord(parsed) ? parsed.issues : undefined;
  return Array.isArray(listed) ? listed.filter(isIssue) : [];
}

/** A sha256 in hex, or `missing` for a file that was not there. */
export const isSha = (s: string): boolean => s === "missing" || /^[0-9a-f]{64}$/.test(s);

/** The header an edit task opens with: `file:`, `section:`, `sha256:` lines before `--- before`. */
function editHeader(description: string): { file: string; sha: string; isNew: boolean } | null {
  const head = description.split(/^--- before$/m)[0] ?? "";
  const file = /^file: (.+)$/m.exec(head)?.[1];
  const sha = /^sha256: (\S+)$/m.exec(head)?.[1];
  return file === undefined || sha === undefined || !isSha(sha)
    ? null
    : { file, sha, isNew: /^kind: new$/m.test(head) };
}

function openTask(issue: Issue, root: string): OpenTask {
  const epic = issue.issue_type === "epic";
  const edit = editHeader(issue.description ?? "");
  if (edit !== null) {
    const stale = sha256Of(root, edit.file) !== edit.sha;
    return { id: issue.id, title: issue.title, kind: edit.isNew ? "new" : "edit", stale, epic };
  }
  const feedback = (issue.labels ?? []).some((l) => l.startsWith("source:"));
  return {
    id: issue.id,
    title: issue.title,
    kind: feedback ? "feedback" : "task",
    stale: null,
    epic,
  };
}

export function readTasks(root: string): TaskRead {
  if (which("br") === null) {
    return { open: null, note: "Tasks were not read: br is not on PATH. Install qsm-tasks." };
  }
  const run = spawnSync(["br", "list", "--json"], { cwd: root, stdout: "pipe", stderr: "pipe" });
  if (run.exitCode !== 0) {
    return { open: null, note: "Tasks were not read: br list --json failed here." };
  }
  try {
    const issues = issuesOf(run.stdout.toString());
    return {
      open: issues.filter((i) => i.status !== "closed").map((i) => openTask(i, root)),
      note: "Open tasks come from br: a title starting with the plugin name (or the name without qsm-) and a colon, or a project task that names the plugin. An edit task is stale when its file changed after the page it came from.",
    };
  } catch {
    return { open: null, note: "Tasks were not read: br list --json gave no JSON." };
  }
}

/** Whether a title names `name` as a whole word (a hyphen continues a name). */
export function names(title: string, name: string): boolean {
  const lower = title.toLowerCase();
  const want = name.toLowerCase();
  const word = (c: string | undefined) => c !== undefined && /[a-z0-9-]/.test(c);
  for (let at = lower.indexOf(want); at >= 0; at = lower.indexOf(want, at + 1)) {
    if (!(word(lower[at - 1]) || word(lower[at + want.length]))) {
      return true;
    }
  }
  return false;
}

/** The open tasks of one plugin: its own by prefix first, then the ones that name it. */
export function tasksOf(plugin: string, open: TaskRead["open"]): Task[] | null {
  if (open === null) {
    return null;
  }
  // `qsm-web` is also written `web:`.
  const prefixes = [`${plugin}:`, `${plugin.replace(/^qsm-/, "")}:`];
  const own = open.filter((t) => prefixes.some((x) => t.title.startsWith(x)));
  const mentions = open.filter((t) => !own.includes(t) && names(t.title, plugin));
  const listed = [...own, ...mentions];
  // An open epic that parents a listed task (its id is the epic's id, a dot and a number) joins them.
  const parents = open.filter(
    (e) => e.epic && !listed.includes(e) && listed.some((t) => t.id.startsWith(`${e.id}.`)),
  );
  return [
    ...own.map((t) => ({ ...t, source: "title prefix" as const })),
    ...mentions.map((t) => ({ ...t, source: "names the plugin" as const })),
    ...parents.map((t) => ({ ...t, source: "epic of a listed task" as const })),
  ];
}

/** The sha256 of a file of the marketplace as it is now; `missing` when it is not there. */
export function sha256Of(root: string, relativePath: string): string {
  const file = join(root, relativePath);
  return existsSync(file)
    ? createHash("sha256").update(readFileSync(file)).digest("hex")
    : "missing";
}
