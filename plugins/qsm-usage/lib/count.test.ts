import { describe, expect, test } from "bun:test";
import { CREDENTIAL_ENV, countText } from "./count.ts";
import { estimateTokens } from "./estimate.ts";

describe("estimate mode", () => {
  test("is the default path and needs no credential", async () => {
    await expect(countText("hello world", { mode: "estimate" })).resolves.toBe(
      estimateTokens("hello world"),
    );
  });

  test("empty text is zero", async () => {
    await expect(countText("", { mode: "estimate" })).resolves.toBe(0);
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
    await expect(countText("count this", { mode: "exact" })).rejects.toMatchObject({
      code: "missing",
    });
  });

  test("the failure names the missing credential", async () => {
    await expect(countText("x", { mode: "exact", apiKey: "" })).rejects.toThrow(CREDENTIAL_ENV);
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
    await expect(attempt).rejects.toMatchObject({ code: "missing" });
    expect(called).toBe(false);
  });
});
