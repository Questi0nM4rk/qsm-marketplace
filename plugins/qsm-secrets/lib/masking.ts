// What the mask and the scrub share. Import-free, because hooks/register.tsx imports it inside the
// engine sandbox and lib/run.ts imports it too.

/** A stored value shorter than this is not masked: it would match inside ordinary words. */
export const MIN_MASKED = 6;

/** Keys of a transcript line that link the record to its session, its parent or its place: never message text. */
const STRUCTURAL_KEYS: ReadonlySet<string> = new Set([
  "sessionId",
  "uuid",
  "parentUuid",
  "cwd",
  "transcript_path",
  "agentId",
  "toolUseID",
  "tool_use_id",
]);

// Bytes are no text, and a short value could match inside them: a `base64` field, and the `data` of
// a base64 source or of an image or audio block. A document's text source is text, and is masked.
const BYTES_HOLDERS: ReadonlySet<unknown> = new Set(["base64", "image", "audio"]);

function holdsBytes(node: object, key: string): boolean {
  return key === "base64" || (key === "data" && "type" in node && BYTES_HOLDERS.has(node.type));
}

/** Parsed JSON with every string rewritten by `map`, in a fixed order; a structural key and a field
 * of bytes are left as they are. */
export function mapStrings(node: unknown, map: (text: string) => string): unknown {
  if (typeof node === "string") {
    return map(node);
  }
  if (Array.isArray(node)) {
    return node.map((item: unknown) => mapStrings(item, map));
  }
  if (node !== null && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([key, child]) => [
        key,
        STRUCTURAL_KEYS.has(key) || holdsBytes(node, key) ? child : mapStrings(child, map),
      ]),
    );
  }
  return node;
}
