// TOON decoder.

import { type Json, parseScalar, splitCells } from "./toon-scalar.ts";

const STEP = 2;

interface Line {
  readonly indent: number;
  readonly text: string;
  readonly no: number;
}

/** A parsed line head: `key[count]{columns}: rest`, every part optional but the colon. */
interface Head {
  readonly key: string | null;
  readonly count: number | null;
  readonly columns: string[] | null;
  readonly rest: string;
}

export class ToonDecodeError extends Error {}

function fail(line: Line | undefined, message: string): never {
  throw new ToonDecodeError(line === undefined ? message : `line ${line.no}: ${message}`);
}

function toLines(source: string): Line[] {
  const lines: Line[] = [];
  const raws = source.split(/\r?\n/);
  for (let index = 0; index < raws.length; index += 1) {
    const raw = raws[index] ?? "";
    if (raw.trim().length > 0) {
      lines.push({ indent: raw.length - raw.trimStart().length, text: raw.trim(), no: index + 1 });
    }
  }
  return lines;
}

function endOfQuoted(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === '"') {
      return i + 1;
    }
    i += 1;
  }
  return -1;
}

/** The key at the start of a head and the index just after it; key null when there is none. */
function readKey(text: string): { key: string | null; next: number } | null {
  if (text.startsWith('"')) {
    const end = endOfQuoted(text, 0);
    return end === -1 ? null : { key: JSON.parse(text.slice(0, end)) as string, next: end };
  }
  const stop = text.search(/[:[]/);
  if (stop === -1) {
    return null;
  }
  return { key: stop === 0 ? null : text.slice(0, stop), next: stop };
}

/** `{a,b}` at `at`, if there is one: its columns and the index after it. */
function readColumns(text: string, at: number): { columns: string[] | null; next: number } | null {
  if (text[at] !== "{") {
    return { columns: null, next: at };
  }
  const brace = text.indexOf("}", at);
  if (brace === -1) {
    return null;
  }
  const inner = text.slice(at + 1, brace);
  const columns = inner.length === 0 ? [] : splitCells(inner).map((c) => parseScalar(c) as string);
  return { columns, next: brace + 1 };
}

/** `[count]{columns}` at `at`, if there is one, and the index after it. */
function readBrackets(
  text: string,
  at: number,
): { count: number | null; columns: string[] | null; next: number } | null {
  if (text[at] !== "[") {
    return { count: null, columns: null, next: at };
  }
  const close = text.indexOf("]", at);
  const count = Number(text.slice(at + 1, close));
  if (close === -1 || !Number.isInteger(count) || count < 0) {
    return null;
  }
  const cols = readColumns(text, close + 1);
  return cols === null ? null : { count, columns: cols.columns, next: cols.next };
}

function parseHead(text: string): Head | null {
  const named = readKey(text);
  if (named === null) {
    return null;
  }
  const brackets = readBrackets(text, named.next);
  if (brackets === null || text[brackets.next] !== ":") {
    return null;
  }
  const { count, columns, next } = brackets;
  return { key: named.key, count, columns, rest: text.slice(next + 1).trim() };
}

function toRow(line: Line, columns: string[]): Json {
  const cells = splitCells(line.text);
  if (cells.length !== columns.length) {
    fail(line, `row has ${cells.length} cells, header names ${columns.length}`);
  }
  const row: Record<string, Json> = {};
  columns.forEach((column, c) => {
    row[column] = parseScalar(cells[c] ?? "");
  });
  return row;
}

function readRows(lines: Line[], start: number, indent: number, head: Head): [Json, number] {
  const columns = head.columns ?? [];
  const count = head.count ?? 0;
  const rows = lines.slice(start, start + count);
  const bad = rows.findIndex((line) => line.indent !== indent);
  const found = bad === -1 ? rows.length : bad;
  if (found < count) {
    fail(lines[start + found - 1], `table declares ${head.count} rows, found ${found}`);
  }
  return [rows.map((line) => toRow(line, columns)), start + count];
}

/** A list element starts with a dash alone or a dash and whitespace. */
const isDash = (line: Line | undefined, indent: number): line is Line =>
  line?.indent === indent &&
  line.text.startsWith("-") &&
  (line.text.length === 1 || line.text[1]?.trim() === "");

/** The lines of one list element starting at `at`, and the index after them. */
function takeItem(lines: Line[], at: number, inner: number): [Line[], number] {
  const first = lines[at] as Line;
  const content = first.text.slice(1).trim();
  const block: Line[] =
    content.length === 0 ? [] : [{ indent: inner, text: content, no: first.no }];
  let i = at + 1;
  while (i < lines.length && (lines[i] as Line).indent >= inner) {
    block.push(lines[i] as Line);
    i += 1;
  }
  return [block, i];
}

function itemValue(block: Line[], inner: number): Json {
  if (block.length === 0) {
    return {};
  }
  const [value, consumed] = readBody(block, 0, inner);
  if (consumed !== block.length) {
    fail(block[consumed], "list element has a line the parser could not place");
  }
  return value;
}

function readList(lines: Line[], start: number, indent: number, head: Head): [Json, number] {
  const items: Json[] = [];
  const inner = indent + STEP;
  let i = start;
  while (isDash(lines[i], indent)) {
    const [block, next] = takeItem(lines, i, inner);
    items.push(itemValue(block, inner));
    i = next;
  }
  if (items.length !== head.count) {
    fail(lines[start - 1], `list declares ${head.count} items, found ${items.length}`);
  }
  return [items, i];
}

function readInlineArray(lines: Line[], start: number, head: Head): [Json, number] {
  const values = splitCells(head.rest).map(parseScalar);
  if (values.length !== head.count) {
    fail(lines[start], `array declares ${head.count} values, found ${values.length}`);
  }
  return [values, start + 1];
}

function readArray(lines: Line[], start: number, inner: number, head: Head): [Json, number] {
  if (head.count === 0) {
    return [[], start + 1];
  }
  if (head.columns !== null) {
    return readRows(lines, start + 1, inner, head);
  }
  if (head.rest.length > 0) {
    return readInlineArray(lines, start, head);
  }
  return readList(lines, start + 1, inner, head);
}

function readValue(lines: Line[], start: number, indent: number, head: Head): [Json, number] {
  const inner = indent + STEP;
  if (head.count !== null) {
    return readArray(lines, start, inner, head);
  }
  if (head.rest.length > 0) {
    return [parseScalar(head.rest), start + 1];
  }
  if (lines[start + 1]?.indent === inner) {
    return readObject(lines, start + 1, inner);
  }
  return [{}, start + 1];
}

function readObject(lines: Line[], start: number, indent: number): [Json, number] {
  const object: Record<string, Json> = {};
  let i = start;
  while (i < lines.length && (lines[i] as Line).indent === indent) {
    const line = lines[i] as Line;
    const head = parseHead(line.text);
    if (head === null || head.key === null) {
      fail(line, `expected "key: value", got ${JSON.stringify(line.text)}`);
    }
    const [value, next] = readValue(lines, i, indent, head);
    object[head.key] = value;
    i = next;
  }
  if (i < lines.length && (lines[i] as Line).indent > indent) {
    fail(lines[i], "indented further than the entry above it");
  }
  return [object, i];
}

function readBody(lines: Line[], start: number, indent: number): [Json, number] {
  const line = lines[start];
  if (line === undefined) {
    return [{}, start];
  }
  const head = parseHead(line.text);
  if (head === null) {
    return [parseScalar(line.text), start + 1];
  }
  if (head.key === null) {
    return readValue(lines, start, indent, head);
  }
  return readObject(lines, start, indent);
}

/** Reads a TOON document back into the value it was encoded from. An empty
 * document is an empty object. */
export function decode(source: string): Json {
  const lines = toLines(source);
  const [first] = lines;
  if (first === undefined) {
    return {};
  }
  const [value, consumed] = readBody(lines, 0, first.indent);
  if (consumed !== lines.length) {
    fail(lines[consumed], "trailing line the parser could not place");
  }
  return value;
}
