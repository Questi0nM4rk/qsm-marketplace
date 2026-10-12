import { describe, expect, test } from "bun:test";
import { DEFAULT_NAMESPACE, namespaceOf, parseEnvPair } from "./vault.ts";

describe("namespaceOf", () => {
  test("the flag wins over the environment, which wins over the default", () => {
    expect(namespaceOf("work", { QSM_SECRETS_FOLDER: "home" })).toBe("work");
    expect(namespaceOf(undefined, { QSM_SECRETS_FOLDER: "home" })).toBe("home");
    expect(namespaceOf(undefined, {})).toBe(DEFAULT_NAMESPACE);
  });

  test("the empty folder name is the whole vault, not the default", () => {
    expect(namespaceOf("", { QSM_SECRETS_FOLDER: "home" })).toBe("");
  });
});

describe("parseEnvPair", () => {
  test("splits <key>=<ENVVAR>", () => {
    expect(parseEnvPair("npm-token=NPM_TOKEN")).toEqual({
      key: "npm-token",
      variable: "NPM_TOKEN",
    });
  });

  test("refuses a variable name a shell would not accept", () => {
    expect(parseEnvPair("k=2BAD")).toBeNull();
    expect(parseEnvPair("k=WITH-DASH")).toBeNull();
    expect(parseEnvPair("k=")).toBeNull();
    expect(parseEnvPair("=VAR")).toBeNull();
    expect(parseEnvPair("nokey")).toBeNull();
  });
});
