import { describe, expect, test } from "bun:test";
import { catalogOverride, RemovalRefused, tokenExpiry, withoutCcrKeys } from "./codex.ts";
import { jwt } from "./fixtures/ccr-db.ts";

const GATEWAY = { address: "http://127.0.0.1:3456", key: "gw-key" };

const CCR_WRITTEN = `model = "gpt-6.1"
model_provider = "claude-code-router"
model_catalog_json = "/h/.codex/ccr-model-catalog.json"
# mine
approval_policy = "never"

[model_providers.claude-code-router]
name = "Claude Code Router"
base_url = "http://127.0.0.1:3456/v1"
experimental_bearer_token = "gw-secret"
wire_api = "responses"

[model_providers.ollama]
name = "Ollama"
base_url = "http://localhost:11434/v1"

[profiles.x]
model = "y"
`;

const NATIVE = `model = "gpt-6.1"
# mine
approval_policy = "never"

[model_providers.ollama]
name = "Ollama"
base_url = "http://localhost:11434/v1"

[profiles.x]
model = "y"
`;

describe("codex's files", () => {
  test("a JWT's exp is read in ms, a non-JWT is undefined", () => {
    expect(tokenExpiry(jwt(1_800_000_000, "x"))).toBe(1_800_000_000_000);
    expect(tokenExpiry("opaque")).toBeUndefined();
  });

  test("every key CCR wrote is removed, the person's keys and tables stay, and it is named", () => {
    const r = withoutCcrKeys(CCR_WRITTEN, GATEWAY);
    expect(r?.text).toBe(NATIVE);
    expect(r?.removed).toEqual([
      "model_provider",
      "model_catalog_json",
      "[model_providers.claude-code-router]",
    ]);
  });

  test("removal is idempotent", () => {
    expect(withoutCcrKeys(NATIVE, GATEWAY)).toBeNull();
  });

  test("top-level base_url, token and wire_api go with a CCR model_provider", () => {
    const toml = `model_provider = "ccr"
base_url = "http://127.0.0.1:3456/v1"
experimental_bearer_token = "x"
wire_api = "responses"
model = "m"
`;
    expect(withoutCcrKeys(toml)?.text).toBe('model = "m"\n');
  });

  test("a provider the person chose, and its base_url, are left alone", () => {
    const toml = `model_provider = "ollama"
base_url = "http://localhost:11434/v1"
wire_api = "chat"
`;
    expect(withoutCcrKeys(toml, GATEWAY)).toBeNull();
  });

  test("a table whose base_url points at the router goes, whatever its id", () => {
    const toml = `[model_providers.local]
base_url = "http://localhost:3456/v1"

[profiles.x]
model = "y"
`;
    expect(withoutCcrKeys(toml, GATEWAY)?.text).toBe('[profiles.x]\nmodel = "y"\n');
  });

  test("a catalog the person wrote is left alone but still seen", () => {
    const toml = 'model_catalog_json = "/mine.json"\n';
    expect(withoutCcrKeys(toml, GATEWAY)).toBeNull();
    expect(catalogOverride(toml)).toBe("/mine.json");
  });

  test("a file that does not parse throws, so the caller can name it", () => {
    expect(() => withoutCcrKeys("= nope [", GATEWAY)).toThrow();
  });

  test("an edit that changes a key of the person's too is refused: a CCR-looking line inside their multi-line string", () => {
    const toml = `model_provider = "ccr"
base_url = "http://127.0.0.1:3456/v1"
wire_api = "responses"
notes = """
wire_api = keep this line
"""
model = "gpt-5"
`;
    expect(() => withoutCcrKeys(toml)).toThrow(RemovalRefused);
  });

  test("a header-looking line inside the person's multi-line string is refused too", () => {
    const toml = `model_provider = "ccr"
notes = """
[model_providers.ccr]
"""
[model_providers.ccr]
name = "ccr"
`;
    expect(() => withoutCcrKeys(toml)).toThrow(RemovalRefused);
  });
});
