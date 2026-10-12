// Two ways to get a token count, and the line between them is a credential.

import { estimateTokens } from "./estimate.ts";

export type CountMode = "estimate" | "exact";

export const CREDENTIAL_ENV = "ANTHROPIC_API_KEY";
export const DEFAULT_MODEL = "claude-sonnet-4-6";
const ENDPOINT = "https://api.anthropic.com/v1/messages/count_tokens";
const API_VERSION = "2023-06-01";

/** `missing`: exact mode without its credential. `failed`: the provider's answer was unusable. */
export class CountError extends Error {
  readonly code: "missing" | "failed";

  constructor(message: string, code: "missing" | "failed") {
    super(message);
    this.code = code;
  }
}

/** The exact path, injectable so a test never reaches the network. */
type ExactCounter = (text: string, model: string, apiKey: string) => Promise<number>;

async function countOverApi(text: string, model: string, apiKey: string): Promise<number> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "anthropic-version": API_VERSION,
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ model, messages: [{ role: "user", content: text }] }),
  });
  if (!response.ok) {
    throw new CountError(
      `exact count failed: HTTP ${response.status} ${response.statusText}`,
      "failed",
    );
  }
  const body = (await response.json()) as { input_tokens?: number };
  if (typeof body.input_tokens !== "number") {
    throw new CountError("exact count response carried no input_tokens", "failed");
  }
  return body.input_tokens;
}

export interface CountOptions {
  readonly mode: CountMode;
  readonly model?: string;
  readonly apiKey?: string | undefined;
  readonly exact?: ExactCounter;
}

/** The estimate unless the caller asked for exact; exact without its
 * credential is an error, never a downgrade. */
export async function countText(text: string, options: CountOptions): Promise<number> {
  if (options.mode === "estimate") {
    return estimateTokens(text);
  }
  const { apiKey } = options;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new CountError(
      `exact mode needs ${CREDENTIAL_ENV}; it does not fall back to the offline estimate. ` +
        `Set ${CREDENTIAL_ENV}, or drop --mode exact to get the estimate.`,
      "missing",
    );
  }
  return await (options.exact ?? countOverApi)(text, options.model ?? DEFAULT_MODEL, apiKey);
}
