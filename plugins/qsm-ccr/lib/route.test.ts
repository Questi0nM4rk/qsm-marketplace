import { describe, expect, test } from "bun:test";
import { fail, ok } from "../../../lib/outcome.ts";
import {
  CLAUDE,
  type Launch,
  launchArgs,
  launchEnv,
  type ModelsOf,
  ROUTER_ENV,
  resolveLead,
  resolveTeammate,
  slugInName,
} from "./route.ts";

const CATALOG = [
  { slug: "gpt-6.1-sol", visibility: "list", priority: 1, contextWindow: 400_000 },
  { slug: "gpt-6.1", visibility: "list", priority: 2, contextWindow: 272_000 },
];
const models =
  (allowlist: readonly string[]): ModelsOf =>
  () => ({ allowlist, catalog: CATALOG });
const BOTH = models(["gpt-6.1", "gpt-6.1-sol"]);
const loaded = (m: ModelsOf) => () => ok(m);
const GATEWAY = { address: "http://127.0.0.1:3456", key: "gw-key" };
const ROUTED: Launch = { kind: "routed", provider: "codex-api", slug: "gpt-6.1", gateway: GATEWAY };

/** The message of a refusal whose code is `missing`; anything else fails the test. */
function refusedMissing(r: ReturnType<typeof resolveTeammate | typeof resolveLead>): string {
  expect(r.kind).toBe("refused");
  if (r.kind !== "refused") {
    throw new Error(`${r.kind} is not a refusal`);
  }
  expect(r.outcome.code).toBe("missing");
  return r.outcome.message ?? "";
}

describe("a teammate's name selects its provider and model", () => {
  test("the longest allowlist slug the name begins with wins", () => {
    expect(resolveTeammate("gpt-6.1-sol-reviewer", loaded(BOTH))).toEqual({
      kind: "routed",
      provider: "codex-api",
      slug: "gpt-6.1-sol",
      contextWindow: 400_000,
    });
  });

  test("a name equal to a slug selects it", () => {
    expect(slugInName("gpt-6.1", ["gpt-6.1", "gpt-6.1-sol"])).toBe("gpt-6.1");
  });

  test("a role-only name takes the catalog's default", () => {
    expect(resolveTeammate("gpt-reviewer", loaded(BOTH))).toMatchObject({
      kind: "routed",
      slug: "gpt-6.1-sol",
    });
  });

  test("a default that drifted out of the allowlist is missing naming it and sync", () => {
    const message = refusedMissing(resolveTeammate("gpt-reviewer", loaded(models(["gpt-6.1"]))));
    expect(message).toContain("gpt-6.1-sol");
    expect(message).toContain("qsm-ccr sync");
  });

  test("a name with no registered prefix is plain claude, and no models are loaded for it", () => {
    const unread = () => {
      throw new Error("models loaded for a Claude name");
    };
    expect(resolveTeammate("planner", unread)).toEqual(CLAUDE);
    expect(resolveTeammate("researcher", unread)).toEqual(CLAUDE);
  });

  test("models that cannot be loaded refuse a routed name with the loader's outcome", () => {
    const r = resolveTeammate("gpt-reviewer", () => fail("missing", "no CCR config"));
    expect(r).toEqual({
      kind: "refused",
      outcome: fail("missing", "no CCR config"),
      provider: "codex-api",
    });
  });
});

describe("a lead's model", () => {
  test("a Claude model is absent from every allowlist", () => {
    const message = refusedMissing(resolveLead("sonnet", BOTH));
    expect(message).toContain("sonnet is absent from every allowlist");
    expect(message).toContain("codex-api: gpt-6.1, gpt-6.1-sol");
  });

  test("a Claude model is refused even when an allowlist lists it", () => {
    const sneaky = models(["claude-sonnet-5", "opus", "Sonnet[1m]", "haiku", "fable", "gpt-6.1"]);
    for (const slug of ["claude-sonnet-5", "opus", "Sonnet[1m]", "haiku", "fable"]) {
      const r = resolveLead(slug, sneaky);
      expect(r.kind).toBe("refused");
      if (r.kind === "refused") {
        expect(r.outcome.message).toContain(slug);
      }
    }
    expect(resolveLead("gpt-6.1", sneaky).kind).toBe("routed");
  });

  test("a Claude model as the catalog default is refused, not routed", () => {
    const r = resolveLead(undefined, () => ({
      allowlist: ["claude-x"],
      catalog: [{ slug: "claude-x", visibility: "list", priority: 1 }],
    }));
    expect(r.kind).toBe("refused");
  });

  test("no slug is the default", () => {
    expect(resolveLead(undefined, BOTH)).toMatchObject({ kind: "routed", slug: "gpt-6.1-sol" });
  });
});

const parent = {
  PATH: "/bin",
  HOME: "/h",
  ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
  ANTHROPIC_API_KEY: "gw-key",
  ANTHROPIC_AUTH_TOKEN: "t",
  ANTHROPIC_MODEL: "codex-api,x",
  ANTHROPIC_DEFAULT_OPUS_MODEL: "x",
  ANTHROPIC_DEFAULT_SONNET_MODEL: "x",
  ANTHROPIC_DEFAULT_HAIKU_MODEL: "x",
  CLAUDE_CODE_MAX_CONTEXT_TOKENS: "1",
  CLAUDE_CODE_SUBAGENT_MODEL: "x",
  ANTHROPIC_SMALL_FAST_MODEL: "x",
};

describe("a Claude launch", () => {
  test("a Claude launch strips every router variable the parent holds", () => {
    const env = launchEnv(parent, CLAUDE);
    for (const key of ROUTER_ENV) {
      expect(env[key]).toBeUndefined();
    }
    expect(env).toEqual({ PATH: "/bin", HOME: "/h" });
  });
});

describe("a routed launch", () => {
  test("sets every tier to <provider>,<slug> and the context window", () => {
    const launch: Launch = {
      kind: "routed",
      provider: "codex-api",
      slug: "gpt-6.1",
      contextWindow: 272_000,
      gateway: GATEWAY,
    };
    expect(launchEnv({ PATH: "/bin" }, launch)).toEqual({
      PATH: "/bin",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:3456",
      ANTHROPIC_API_KEY: "gw-key",
      ANTHROPIC_MODEL: "codex-api,gpt-6.1",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "codex-api,gpt-6.1",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "codex-api,gpt-6.1",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "codex-api,gpt-6.1",
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: "272000",
    });
  });

  test("drops --model in both spellings and keeps everything else", () => {
    const argv = [
      "--agent-id",
      "a@t",
      "--model",
      "sonnet",
      "--x",
      "--model=opus",
      "--agent-name",
      "gpt-r",
    ];
    expect(launchArgs(argv, ROUTED)).toEqual(["--agent-id", "a@t", "--x", "--agent-name", "gpt-r"]);
  });

  test("a routed launch holds neither subagent model variable the parent set", () => {
    const env = launchEnv(parent, ROUTED);
    expect(env.CLAUDE_CODE_SUBAGENT_MODEL).toBeUndefined();
    expect(env.ANTHROPIC_SMALL_FAST_MODEL).toBeUndefined();
    expect(env.PATH).toBe("/bin");
  });

  test("a --model with no value does not swallow the next flag", () => {
    expect(launchArgs(["--model", "--x", "v", "--model"], ROUTED)).toEqual(["--x", "v"]);
  });

  test("a Claude launch keeps --model", () => {
    expect(launchArgs(["--model", "sonnet"], CLAUDE)).toEqual(["--model", "sonnet"]);
  });
});
