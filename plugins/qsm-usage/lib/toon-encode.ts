// TOON encoder.

import { isPlainObject, isScalar, keyText, scalarText } from "./toon-scalar.ts";

const STEP = 2;

function pad(indent: number): string {
  return " ".repeat(indent);
}

/** The one shape worth encoding: every element an object, same keys in the
 * same order, every value on one line. Returns the shared columns, or null. */
export function tableColumns(items: readonly unknown[]): string[] | null {
  const [first] = items;
  if (items.length === 0 || !isPlainObject(first)) {
    return null;
  }
  const columns = Object.keys(first);
  if (columns.length === 0) {
    return null;
  }
  for (const item of items) {
    if (!isPlainObject(item)) {
      return null;
    }
    const keys = Object.keys(item);
    if (keys.length !== columns.length || keys.some((k, i) => k !== columns[i])) {
      return null;
    }
    if (Object.values(item).some((v) => !isScalar(v))) {
      return null;
    }
  }
  return columns;
}

function emitArray(key: string | null, items: readonly unknown[], indent: number, out: string[]) {
  const head = `${pad(indent)}${key === null ? "" : keyText(key)}[${items.length}]`;
  if (items.length === 0) {
    out.push(`${head}:`);
    return;
  }
  if (items.every(isScalar)) {
    out.push(`${head}: ${items.map(scalarText).join(",")}`);
    return;
  }
  const columns = tableColumns(items);
  if (columns !== null) {
    out.push(`${head}{${columns.map(keyText).join(",")}}:`);
    for (const item of items.filter((cell) => isPlainObject(cell))) {
      out.push(pad(indent + STEP) + columns.map((c) => scalarText(item[c])).join(","));
    }
    return;
  }
  out.push(`${head}:`);
  for (const item of items) {
    emitItem(item, indent + STEP, out);
  }
}

/** A list element. */
function emitItem(value: unknown, indent: number, out: string[]): void {
  if (isScalar(value)) {
    out.push(`${pad(indent)}- ${scalarText(value)}`);
    return;
  }
  const body: string[] = [];
  const inner = indent + STEP;
  if (Array.isArray(value)) {
    emitArray(null, value, inner, body);
  } else if (isPlainObject(value)) {
    emitObject(value, inner, body);
  } else {
    throw new TypeError("a TOON list element is a scalar, an array or a plain object");
  }
  const [first, ...rest] = body;
  out.push(first === undefined ? `${pad(indent)}-` : `${pad(indent)}- ${first.slice(inner)}`);
  out.push(...rest);
}

function emitObject(value: Record<string, unknown>, indent: number, out: string[]): void {
  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) {
      emitArray(key, child, indent, out);
    } else if (isPlainObject(child)) {
      out.push(`${pad(indent)}${keyText(key)}:`);
      emitObject(child, indent + STEP, out);
    } else {
      out.push(`${pad(indent)}${keyText(key)}: ${scalarText(child)}`);
    }
  }
}

/** Encodes any JSON-shaped value. An empty object encodes to an empty
 * document, which `decode` reads back as an empty object. */
export function encode(value: unknown): string {
  const out: string[] = [];
  if (Array.isArray(value)) {
    emitArray(null, value, 0, out);
  } else if (isPlainObject(value)) {
    emitObject(value, 0, out);
  } else {
    out.push(scalarText(value));
  }
  return out.join("\n");
}
