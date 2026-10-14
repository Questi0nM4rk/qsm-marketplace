// What a plugin.json must hold, checked as text before the write lands.

/** A plugin name: lowercase words joined by single dashes. */
const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
/** A version starts with a dotted triple of numbers; a suffix after it is free. */
const DOTTED_TRIPLE = /^\d+\.\d+\.\d+/;

function show(value: unknown): string {
  return value === undefined ? "nothing" : JSON.stringify(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** True when the path names a plugin manifest, whatever directory holds it. */
export function isManifestPath(path: string): boolean {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(cut + 1) === "plugin.json";
}

function checkName(json: Record<string, unknown>, found: string[]): void {
  const { name } = json;
  if (!isText(name)) {
    found.push(`name must be a non-empty string, found ${show(name)}`);
  } else if (!KEBAB_CASE.test(name)) {
    found.push(`name must be kebab-case, found ${show(name)}`);
  }
}

function checkVersion(json: Record<string, unknown>, found: string[]): void {
  const { version } = json;
  if (version === undefined) {
    return;
  }
  if (!isText(version)) {
    found.push(`version must be a non-empty string, found ${show(version)}`);
  } else if (!DOTTED_TRIPLE.test(version)) {
    found.push(`version must start with a dotted triple of numbers, found ${show(version)}`);
  }
}

function checkAuthor(json: Record<string, unknown>, found: string[]): void {
  const { author } = json;
  if (isText(author)) {
    return;
  }
  const named =
    typeof author === "object" &&
    author !== null &&
    !Array.isArray(author) &&
    isText((author as Record<string, unknown>).name);
  if (!named) {
    found.push(`author must be a name, or an object naming one, found ${show(author)}`);
  }
}

function checkKeywords(json: Record<string, unknown>, found: string[]): void {
  const { keywords } = json;
  if (!Array.isArray(keywords)) {
    found.push(`keywords must be an array of strings, found ${show(keywords)}`);
    return;
  }
  const bad = keywords.filter((k) => typeof k !== "string");
  if (bad.length > 0) {
    found.push(`every keyword must be a string, found ${show(bad)}`);
  }
}

/** The key Claude Code refuses as null: it is a path to a hooks file, or it
 * is absent. A manifest that carries `"hooks": null` loads nowhere. */
function checkHooks(json: Record<string, unknown>, found: string[]): void {
  if (!("hooks" in json)) {
    return;
  }
  const { hooks } = json;
  if (hooks === null) {
    found.push("hooks must be omitted rather than set to null");
  } else if (!(typeof hooks === "string" && hooks.endsWith(".json"))) {
    found.push(`hooks must be a path ending .json, or absent, found ${show(hooks)}`);
  }
}

/** Every violation in the manifest text, in field order. Empty means it passes. */
export function checkManifest(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return [`not valid JSON: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return [`must be a JSON object, found ${show(parsed)}`];
  }
  const json = parsed as Record<string, unknown>;
  const found: string[] = [];
  checkName(json, found);
  checkVersion(json, found);
  if (!isText(json.description)) {
    found.push(`description must be a non-empty string, found ${show(json.description)}`);
  }
  checkAuthor(json, found);
  checkKeywords(json, found);
  checkHooks(json, found);
  return found;
}

/**
 * The text an Edit would leave behind, or null when its old text is empty or is not there to
 * replace.
 */
export function applyEdit(
  current: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): string | null {
  if (oldString.length === 0 || !current.includes(oldString)) {
    return null;
  }
  if (replaceAll) {
    return current.split(oldString).join(newString);
  }
  const at = current.indexOf(oldString);
  return current.slice(0, at) + newString + current.slice(at + oldString.length);
}

/** The refusal the agent reads: the file, then one line per violation. */
export function denial(path: string, found: readonly string[]): string {
  const count = found.length === 1 ? "1 violation" : `${found.length} violations`;
  return [`${path}: ${count}`, ...found.map((f) => `  - ${f}`)].join("\n");
}
