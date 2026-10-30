// JSON shapes, and a parse that names its file. A parser's message can quote the text it choked
// on, a token or a key included, so it never leaves parseOrName: the error names the file and the
// format only.

export type Json = Record<string, unknown>;

export function parseOrName<T>(what: string, kind: string, parse: () => T): T {
  try {
    return parse();
  } catch {
    throw new Error(`${what} does not parse as ${kind}`);
  }
}

/** `JSON.parse` typed for what it is: a value nobody has checked yet. */
export function parseJson(text: string): unknown {
  return JSON.parse(text);
}
