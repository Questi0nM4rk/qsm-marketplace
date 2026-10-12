// The offline estimate every surface of this plugin shares, so a number from `qsm-usage toon size`
// and a number from `qsm-usage count` are the same number.

export const ESTIMATE_NOTE =
  "token counts are an offline estimate (characters / 4), not an exact count from a model's tokenizer";

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
