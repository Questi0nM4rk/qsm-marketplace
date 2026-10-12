// Whether a piece of text should reach the model as TOON: the one decision behind `qsm-usage toon
// wrap`.

import { estimateTokens } from "./estimate.ts";
import { type DataFormat, parseData } from "./formats.ts";
import { encode } from "./toon-encode.ts";

/** At or below this estimate a conversion is not worth a header line. */
const MIN_TOKENS = 1000;
/** TOON must be at least 20% smaller, or the original stays. */
const MAX_RATIO = 0.8;

const ORDER: readonly DataFormat[] = ["json", "yaml", "toml"];

export interface WrapDecision {
  readonly use: "toon" | "original";
  readonly format: DataFormat | null;
  readonly originalTokens: number;
  readonly toonTokens: number;
  readonly toon?: string;
  readonly reason: string;
}

interface Parsed {
  readonly format: DataFormat;
  readonly value: object;
}

function parseStructured(text: string): Parsed | null {
  for (const format of ORDER) {
    try {
      const value: unknown = parseData(text, format);
      if (typeof value === "object" && value !== null) {
        return { format, value };
      }
    } catch {
      // Not this format; the next one gets its turn.
    }
  }
  return null;
}

export function wrapDecision(text: string): WrapDecision {
  const originalTokens = estimateTokens(text);
  const parsed = parseStructured(text);
  if (parsed === null) {
    return {
      use: "original",
      format: null,
      originalTokens,
      toonTokens: 0,
      reason: "not structured: no JSON, YAML, or TOML object or array",
    };
  }
  const toon = encode(parsed.value);
  const toonTokens = estimateTokens(toon);
  const base = { format: parsed.format, originalTokens, toonTokens };
  if (originalTokens <= MIN_TOKENS) {
    return {
      ...base,
      use: "original",
      reason: `under the threshold: ${originalTokens} of ${MIN_TOKENS} tokens`,
    };
  }
  if (toonTokens > originalTokens * MAX_RATIO) {
    return {
      ...base,
      use: "original",
      reason: `TOON is not 20% smaller: ${toonTokens} against ${originalTokens} tokens`,
    };
  }
  return {
    ...base,
    use: "toon",
    toon,
    reason: `TOON is ${toonTokens} of ${originalTokens} tokens`,
  };
}
