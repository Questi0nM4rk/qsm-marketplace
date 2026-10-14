// The hooks of one plugin, read from the text of their source: what each one does is the comment
// written for it, and which verbs it calls are the `$.<noun>.<verb>(` calls inside it. Nothing
// is run or resolved.

interface HookCall {
  readonly verb: string;
  readonly description: string;
}

export interface Hook {
  /** the source file, relative to the plugin directory */
  readonly file: string;
  readonly event: string;
  readonly command: boolean;
  /** the comment that says what it does, or null when none is written */
  readonly what: string | null;
  readonly calls: readonly HookCall[];
}

/** `<noun>.<method>` of the plugin's own noun, to the verb it calls. */
export type Methods = ReadonlyMap<string, HookCall>;

const isComment = (line: string | undefined): boolean => {
  const t = (line ?? "").trimStart();
  return t.startsWith("//") || t.startsWith("/*") || t.startsWith("*");
};
const MARKER = /classic: \S+ has no function event\.?/;

/** The text of comment lines, markers and stars off. */
function commentText(lines: readonly string[]): string | null {
  const text = lines
    .map((l) => l.replace(/^\s*(\/\/+|\/\*+|\*+\/?)\s?/, "").replace(/\s*\*\/\s*$/, ""))
    .join(" ")
    .replace(MARKER, "")
    .replaceAll(/\s+/g, " ")
    .trim();
  return text === "" ? null : text;
}

/** The comment lines that end directly above `index`: no blank line between. */
function commentAbove(lines: readonly string[], index: number): string | null {
  let from = index;
  while (from > 0 && isComment(lines[from - 1])) {
    from -= 1;
  }
  return commentText(lines.slice(from, index));
}

/** The opening comment of a source file, after a shebang. */
function openingComment(src: string): string | null {
  const lines = src.split("\n");
  const first = lines.findIndex((l, i) => l.trim() !== "" && !(i === 0 && l.startsWith("#!")));
  const start = first === -1 ? lines.length : first;
  const end = lines.findIndex((l, i) => i >= start && !isComment(l));
  return commentText(lines.slice(start, end === -1 ? lines.length : end));
}

function callsOf(text: string, methods: Methods): HookCall[] {
  const found = [...text.matchAll(/\$\.(\w+)\.(\w+)\(/g)].flatMap((m) => {
    const call = methods.get(`${m[1]}.${m[2]}`);
    return call === undefined ? [] : [call];
  });
  return [...new Map(found.map((c) => [c.verb, c])).values()];
}

/** Each top-level function of the file by name, for the helpers a hook calls. */
function helpersOf(lines: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  lines.forEach((l, i) => {
    const name = /^(?:export )?(?:async )?function (\w+)/.exec(l)?.[1];
    if (name !== undefined) {
      const end = lines.findIndex((x, j) => j > i && x.startsWith("}"));
      out.set(name, lines.slice(i, end === -1 ? lines.length : end + 1).join("\n"));
    }
  });
  return out;
}

/** The body plus the text of every helper it calls, and theirs in turn. */
function reach(body: string, helpers: ReadonlyMap<string, string>, seen: Set<string>): string {
  const more = [...helpers].filter(([name]) => !seen.has(name) && body.includes(`${name}(`));
  const texts = more.map(([name, text]) => {
    seen.add(name);
    return text;
  });
  return [body, ...texts.map((t) => reach(t, helpers, seen))].join("\n");
}

/** The `on("<event>", ...)` hooks of a hooks module. */
export function functionHooks(file: string, src: string, methods: Methods): Hook[] {
  const lines = src.split("\n");
  const helpers = helpersOf(lines);
  const starts = lines.flatMap((l, i) => {
    const event = /^\s*on\(\s*"([a-z.*]+)"/.exec(l)?.[1];
    return event === undefined ? [] : [{ event, i }];
  });
  return starts.map(({ event, i }, n) => {
    const next = lines.findIndex((l, j) => j > i && l !== "" && l.trimStart() === l);
    const stop = Math.min(starts[n + 1]?.i ?? lines.length, next === -1 ? lines.length : next);
    const body = lines.slice(i, stop).join("\n");
    const text = reach(body, helpers, new Set());
    return {
      file,
      event,
      command: false,
      what: commentAbove(lines, i),
      calls: callsOf(text, methods),
    };
  });
}

/** A classic command hook: its event, and the opening comment of its source. */
export function commandHook(file: string, event: string, src: string | null): Hook {
  return {
    file,
    event,
    command: true,
    what: src === null ? null : openingComment(src),
    calls: [],
  };
}
