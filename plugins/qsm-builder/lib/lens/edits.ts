// A saved edit becomes one task in the task tool, through `br`, run in the marketplace. No plugin
// file is written, ever: the task holds the file, the section, the file's sha256 when the page was
// rendered, the text before, the text after and the person's note.

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { spawn, which } from "bun";
import { isRecord } from "../../../../lib/outcome.ts";
import { isSha, sha256Of } from "./tasks.ts";

/** Runs one command to its end and returns what it printed and its exit code. */
export async function run(
  argv: readonly string[],
  options: { readonly cwd?: string; readonly stdin?: Blob } = {},
): Promise<{ out: string; err: string; code: number }> {
  const proc = spawn([...argv], { ...options, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { out, err, code };
}

export interface EditRequest {
  /** `new`: a skill, agent or plugin that does not exist yet; absent or `edit`: a change to a text */
  readonly kind?: "edit" | "new";
  /** the plugin, `<plugin>:<item>`, or `marketplace` */
  readonly where: string;
  readonly file: string;
  readonly sha: string;
  readonly section: string;
  readonly what: string;
  readonly before: string;
  readonly after: string;
  readonly note: string;
}

export class EditError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MAX = 400_000;
const FIELDS = ["where", "file", "sha", "section", "what", "before", "after", "note"] as const;

function pluginNames(root: string): string[] {
  const file = join(root, ".claude-plugin", "marketplace.json");
  if (!existsSync(file)) {
    return [];
  }
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.plugins)) {
    return [];
  }
  const names: string[] = [];
  const list: unknown[] = parsed.plugins;
  for (const plugin of list) {
    names.push(isRecord(plugin) && typeof plugin.name === "string" ? plugin.name : "");
  }
  return names;
}

/** The eight texts of an edit, each a string within the limit. */
function textsOf(body: unknown): EditRequest {
  if (!isRecord(body)) {
    throw new EditError(400, "the edit is not a JSON object");
  }
  const raw = body;
  if (raw.kind !== undefined && raw.kind !== "edit" && raw.kind !== "new") {
    throw new EditError(400, "kind must be edit or new");
  }
  const text = (key: (typeof FIELDS)[number]): string => {
    const value = raw[key];
    if (typeof value !== "string" || value.length > MAX) {
      throw new EditError(400, `${key} must be a text of at most ${MAX} characters`);
    }
    return value;
  };
  const request = {
    where: text("where"),
    file: text("file"),
    sha: text("sha"),
    section: text("section"),
    what: text("what"),
    before: text("before"),
    after: text("after"),
    note: text("note"),
  };
  return raw.kind === undefined ? request : { ...request, kind: raw.kind };
}

const isName = (s: string): boolean => /^[a-z0-9][a-z0-9-]*$/.test(s);

/** The shapes a new item's path may take after `plugins/<plugin>/`, each told by its parts. */
const NEW_SHAPES: Record<string, (rest: string[]) => boolean> = {
  skills: ([name = "", file, extra]) => isName(name) && file === "SKILL.md" && extra === undefined,
  agents: ([file = "", extra]) =>
    file.endsWith(".md") && isName(file.slice(0, -3)) && extra === undefined,
  ".claude-plugin": ([file, extra]) => file === "plugin.json" && extra === undefined,
};

/** Whether a path is where a new skill, agent or plugin may start, with a lowercase name. */
function isNewFile(file: string): boolean {
  const [top, plugin = "", kind = "", ...rest] = file.split("/");
  return top === "plugins" && isName(plugin) && NEW_SHAPES[kind]?.(rest) === true;
}

/** Whether a line `<label>: <text>` of the new item's fields has text on it. */
const hasLine = (after: string, label: string): boolean =>
  after
    .split("\n")
    .some((l) => l.startsWith(`${label}:`) && l.slice(label.length + 1).trim() !== "");

/** The first reason a new item is refused, or null: a path of the three shapes that is free, and an eval case. */
function newRefusal(edit: EditRequest, root: string): string | null {
  const checks: [boolean, string][] = [
    [
      !isNewFile(edit.file),
      `a new item's file must be plugins/<plugin>/skills/<name>/SKILL.md, agents/<name>.md or .claude-plugin/plugin.json with a lowercase name: ${edit.file}`,
    ],
    [
      sha256Of(root, edit.file) !== "missing",
      `${edit.file} already exists: change it with the pen instead of starting it again`,
    ],
    [
      !(
        hasLine(edit.after, "What the eval does") && hasLine(edit.after, "What the grader expects")
      ),
      "a new item needs at least one eval case: what the eval does and what the grader expects",
    ],
  ];
  return checks.find(([refused]) => refused)?.[1] ?? null;
}

/** The first reason an edit is refused, or null. */
function refusal(edit: EditRequest, root: string): string | null {
  const [plugin = ""] = edit.where.split(":");
  const checks: [boolean, string][] = [
    [
      plugin !== "marketplace" && !pluginNames(root).includes(plugin),
      `where names no plugin of this marketplace: ${edit.where}`,
    ],
    // The file is only ever recorded and hashed, but it must stay inside the marketplace.
    [
      edit.file === "" || isAbsolute(edit.file) || normalize(edit.file).startsWith(".."),
      `file must be a path inside the marketplace: ${edit.file}`,
    ],
    [!isSha(edit.sha), "sha must be a sha256 in hex, or missing"],
    [edit.what.trim() === "" || edit.section.trim() === "", "what and section must not be empty"],
  ];
  return (
    checks.find(([refused]) => refused)?.[1] ??
    (edit.kind === "new" ? newRefusal(edit, root) : null)
  );
}

/** The request body as an edit, or the reason it is refused (status 400). */
export function parseEdit(body: unknown, root: string): EditRequest {
  const edit = textsOf(body);
  const why = refusal(edit, root);
  if (why !== null) {
    throw new EditError(400, why);
  }
  return edit;
}

const oneLine = (s: string): string => s.replaceAll(/\s+/g, " ").trim().slice(0, 120);

const titleOf = (e: EditRequest): string => `${e.where}: ${oneLine(e.what)}`;

/** The description of the task; `editHeader` in tasks.ts reads its first lines back. */
function descriptionOf(e: EditRequest): string {
  const intro =
    e.kind === "new"
      ? "New item asked for on the marketplace lens. Nothing was written. Search for an existing owner first, create the item only after the person's yes, and with its eval case; the file below must still not exist."
      : "Edit made on the marketplace lens. Nothing was written to the file; apply it only after the person's yes, and not as is when the sha256 below no longer matches the file.";
  return [
    intro,
    ...(e.kind === "new" ? ["kind: new"] : []),
    `file: ${e.file}`,
    `section: ${e.section}`,
    `sha256: ${e.sha}`,
    "--- before",
    e.before,
    "--- after",
    e.after,
    "--- note",
    e.note,
    "",
  ].join("\n");
}

/** Creates the task; the description goes in on stdin, so a long text never meets an argv limit. */
export async function createEditTask(
  root: string,
  edit: EditRequest,
): Promise<{ id: string; title: string }> {
  if (which("br") === null) {
    throw new EditError(500, "br is not on PATH, so the edit cannot become a task");
  }
  const title = titleOf(edit);
  const { out, err, code } = await run(
    ["br", "create", title, "-t", "task", "--description-file", "-", "--json"],
    { cwd: root, stdin: new Blob([descriptionOf(edit)]) },
  );
  if (code !== 0) {
    throw new EditError(500, `br create failed (${code}): ${err.trim() || out.trim()}`);
  }
  const created: unknown = JSON.parse(out);
  const id = isRecord(created) ? created.id : undefined;
  if (typeof id !== "string") {
    throw new EditError(500, "br create gave no task id");
  }
  return { id, title };
}
