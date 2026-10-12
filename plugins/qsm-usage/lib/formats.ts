// Which parser reads a file, decided by its extension alone.

import { extname } from "node:path";
import { TOML, YAML } from "bun";

export type DataFormat = "json" | "yaml" | "toml";

const SUPPORTED_EXTENSIONS = [".json", ".yaml", ".yml", ".toml"] as const;

export class InputError extends Error {}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function detectFormat(path: string): DataFormat | null {
  switch (extname(path).toLowerCase()) {
    case ".json":
      return "json";
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".toml":
      return "toml";
    default:
      return null;
  }
}

/** YAML and TOML come from the runtime, so the plugin carries no parser
 * dependency of its own. */
export function parseData(text: string, format: DataFormat): unknown {
  switch (format) {
    case "yaml":
      return YAML.parse(text);
    case "toml":
      return TOML.parse(text);
    default:
      return JSON.parse(text) as unknown;
  }
}

/** Parses a data file's text by its extension, or throws an `InputError`
 * naming which of the two things went wrong. */
export function readData(path: string, text: string): unknown {
  const format = detectFormat(path);
  if (format === null) {
    throw new InputError(
      `unsupported extension: ${path} (expected ${SUPPORTED_EXTENSIONS.join(", ")})`,
    );
  }
  try {
    return parseData(text, format);
  } catch (error) {
    throw new InputError(`cannot parse ${path} as ${format}: ${messageOf(error)}`, {
      cause: error,
    });
  }
}

/** Whether a read failed because nothing is at the path. */
export function absent(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}
