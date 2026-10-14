// The scalar layer both halves of the codec share: what a value looks like on one TOON line, and
// how a line turns back into a value.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** A value that fits on one line: null, a boolean, a finite number, a string. */
export function isScalar(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  const t = typeof value;
  return (
    t === "string" || t === "boolean" || (t === "number" && Number.isFinite(value)) || isDate(value)
  );
}

function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !isDate(value);
}

/**
 * A bare (unquoted) token: no character that carries structure, no leading dash (which starts a
 * list item), no surrounding space, and nothing that would read back as a number, a boolean, or
 * null.
 */
const STRUCTURAL = /["`,:[\]{}#\n\r]/;
const LITERAL = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/;

function isBare(text: string): boolean {
  return (
    text.length > 0 &&
    !STRUCTURAL.test(text) &&
    text.trim() === text &&
    !text.startsWith("-") &&
    !LITERAL.test(text)
  );
}

/** One value as it appears on a line or inside a comma-separated row. */
export function scalarText(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (isDate(value)) {
    return JSON.stringify(value.toISOString());
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  if (typeof value !== "string") {
    throw new TypeError("a TOON scalar is null, a boolean, a number, a string or a date");
  }
  const text = value;
  return isBare(text) ? text : JSON.stringify(text);
}

/** An object key: same rule as a string value, minus the literal test: a key
 * named `true` reads back as the string it is. */
export function keyText(key: string): string {
  return key.length > 0 && !STRUCTURAL.test(key) && key.trim() === key && !key.startsWith("-")
    ? key
    : JSON.stringify(key);
}

/** A JSON string literal read back as its string; anything else is an error. */
export function parseQuoted(literal: string): string {
  const parsed: unknown = JSON.parse(literal);
  if (typeof parsed !== "string") {
    throw new TypeError(`${literal} is not a JSON string literal`);
  }
  return parsed;
}

/** The inverse of `scalarText`. An empty token is an empty string, which is
 * what an empty cell in a row means. */
export function parseScalar(token: string): Json {
  const text = token.trim();
  if (text.length === 0) {
    return "";
  }
  if (text.startsWith('"')) {
    return parseQuoted(text);
  }
  if (text === "null") {
    return null;
  }
  if (text === "true") {
    return true;
  }
  if (text === "false") {
    return false;
  }
  return LITERAL.test(text) ? Number(text) : text;
}

/** Splits `a,"b,c",d` on the commas that are not inside a quoted token. */
export function splitCells(text: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) {
      current += ch;
      escaped = false;
    } else if (quoted && ch === "\\") {
      current += ch;
      escaped = true;
    } else if (ch === '"') {
      current += ch;
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}
