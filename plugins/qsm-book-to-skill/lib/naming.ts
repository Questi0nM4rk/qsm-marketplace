// Stage four, naming: the slug the generated skill is addressed by for the rest of its life.

/** A skill slug the host agents accept: lowercase, digits, single hyphens. */
export function slugify(raw: string): string {
  return raw
    .normalize("NFKD")
    .replaceAll(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

const MINIMUM_LENGTH = 3;
const MAXIMUM_LENGTH = 64;

type NameOrigin = "given" | "derived";

export interface NameResult {
  readonly slug: string;
  readonly origin: NameOrigin;
  readonly problems: readonly string[];
}

/** Cuts at a hyphen rather than mid-word, so a truncated name still reads. */
function shorten(slug: string): string {
  if (slug.length <= MAXIMUM_LENGTH) {
    return slug;
  }
  const cut = slug.slice(0, MAXIMUM_LENGTH);
  const lastHyphen = cut.lastIndexOf("-");
  return lastHyphen >= MINIMUM_LENGTH ? cut.slice(0, lastHyphen) : cut;
}

function problemsWith(slug: string, raw: string): string[] {
  if (slug.length === 0) {
    return [`no slug can be made from ${JSON.stringify(raw)}; pass one`];
  }
  if (slug.length < MINIMUM_LENGTH) {
    return [`${slug} is shorter than ${MINIMUM_LENGTH} characters`];
  }
  return [];
}

/**
 * `given` wins when it is there, because a caller who named the skill has a reason the source text
 * cannot know.
 */
export function resolveName(given: string | undefined, hint: string): NameResult {
  const raw = given ?? hint;
  const origin: NameOrigin = given === undefined ? "derived" : "given";
  const slug = shorten(slugify(raw));
  return { slug, origin, problems: problemsWith(slug, raw) };
}

/** The first heading of the consolidated text, or the empty string. Used as
 * the naming hint and as the generated skill's working title. */
export function titleHint(text: string): string {
  for (const line of text.split("\n")) {
    const heading = /^#{1,3}\s+(\S.*?)\s*$/.exec(line);
    if (heading?.[1] !== undefined) {
      return heading[1];
    }
  }
  return "";
}
