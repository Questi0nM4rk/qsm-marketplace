// What the mask and the scrub share. Import-free, because hooks/register.tsx imports it inside the
// engine sandbox and lib/run.ts imports it too.

/** A stored value shorter than this is not masked: it would match inside ordinary words. */
export const MIN_MASKED = 6;

/** Keys of a transcript line that link the record to its session, its parent or its place: never message text. */
export const STRUCTURAL_KEYS: ReadonlySet<string> = new Set([
  "sessionId",
  "uuid",
  "parentUuid",
  "cwd",
  "transcript_path",
  "agentId",
  "toolUseID",
  "tool_use_id",
]);

// A media block (an image, an audio clip, a document) is kept whole: its bytes are no text, and a
// short value could match inside them.
const MEDIA_TYPES: ReadonlySet<unknown> = new Set(["image", "audio", "document"]);

/** Parsed JSON with every string rewritten by `map`, in a fixed order; a value under a key in `keep`
 * and a media block are left as they are. */
export function mapStrings(
  node: unknown,
  map: (text: string) => string,
  keep: ReadonlySet<string>,
): unknown {
  if (typeof node === "string") {
    return map(node);
  }
  if (Array.isArray(node)) {
    return node.map((item: unknown) => mapStrings(item, map, keep));
  }
  if (node !== null && typeof node === "object") {
    if ("type" in node && MEDIA_TYPES.has(node.type)) {
      return node;
    }
    return Object.fromEntries(
      Object.entries(node).map(([key, child]) => [
        key,
        keep.has(key) ? child : mapStrings(child, map, keep),
      ]),
    );
  }
  return node;
}
