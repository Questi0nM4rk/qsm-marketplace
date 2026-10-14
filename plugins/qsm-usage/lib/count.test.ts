import { describe, expect, test } from "bun:test";
import { CREDENTIAL_ENV, countText } from "./count.ts";
import { estimateTokens } from "./estimate.ts";

describe("estimate mode", () => {
  test("is the default path and needs no credential", async () => {
    expect(await countText("hello world", { mode: "estimate" })).toBe(
      estimateTokens("hello world"),
    );
  });

  test("empty text is zero", async () => {
    expect(await countText("", { mode: "estimate" })).toBe(0);
  });

  test("grows with the input", () => {
    expect(estimateTokens("x".repeat(400))).toBeGreaterThan(estimateTokens("x".repeat(4)));
  });
});

describe("exact mode", () => {
  test("uses the provider counter when the credential is there", async () => {
    const seen: string[] = [];
    const tokens = await countText("count this", {
      mode: "exact",
      model: "a-model",
      apiKey: "a-key",
      exact: (text, model, apiKey) => {
        seen.push(`${text}|${model}|${apiKey}`);
        return Promise.resolve(42);
      },
    });
    expect(tokens).toBe(42);
    expect(seen).toEqual(["count this|a-model|a-key"]);
  });

  test("fails without the credential instead of estimating", async () => {
    const error = await countText("count this", { mode: "exact" }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "missing" });
  });

  test("the failure names the missing credential", async () => {
    const error = await countText("x", { mode: "exact", apiKey: "" }).catch((e: unknown) => e);
    expect(error instanceof Error && error.message.includes(CREDENTIAL_ENV)).toBe(true);
  });

  test("never reaches the provider when the credential is missing", async () => {
    let called = false;
    const attempt = countText("x", {
      mode: "exact",
      exact: () => {
        called = true;
        return Promise.resolve(1);
      },
    });
    expect(await attempt.catch((e: unknown) => e)).toMatchObject({ code: "missing" });
    expect(called).toBe(false);
  });
});
