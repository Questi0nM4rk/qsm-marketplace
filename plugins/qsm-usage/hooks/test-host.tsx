// The host a qsm-usage hooks test stands on: host operations (store, clock, session, ui) have no
// default beneath the plugins, so the tests answer them here.
import type { On, SessionUsage } from "claude-code";
import { asSession, type SessionRecord } from "./ledger.ts";

/** A fresh usage reading each call, as the engine hands one out. */
function usage(): SessionUsage {
  return {
    startedAt: 0,
    context: {
      tokens: 42_000,
      window: 200_000,
      percent: 21,
      breakdown: {
        categories: [
          { name: "System prompt", tokens: 3000, color: "x", isDeferred: false, kind: "used" },
          { name: "MCP tools", tokens: 12_000, color: "x", isDeferred: false, kind: "used" },
          { name: "Messages", tokens: 27_000, color: "x", isDeferred: false, kind: "used" },
          { name: "Free space", tokens: 158_000, color: "x", isDeferred: false, kind: "free" },
        ],
        totalTokens: 42_000,
        maxTokens: 200_000,
        rawMaxTokens: 200_000,
        autocompactSource: "model-default",
        percentage: 21,
        gridRows: [],
        model: "claude-test",
        memoryFiles: [{ path: "/repo/CLAUDE.md", type: "Project", tokens: 2000 }],
        mcpTools: [
          { name: "mcp__idle__a", serverName: "idle", tokens: 7000, isLoaded: true },
          { name: "mcp__idle__b", serverName: "idle", tokens: 5000, isLoaded: true },
        ],
        agents: [],
        skills: {
          totalSkills: 1,
          includedSkills: 1,
          tokens: 300,
          skillFrontmatter: [{ name: "tdd", source: "plugin", pluginName: "p", tokens: 300 }],
        },
        isAutoCompactEnabled: true,
        apiUsage: null,
      },
    },
    rateLimits: [],
  };
}

export type Store = Map<string, unknown>;

/** A store the test can read back, failing every write when asked to. */
export function stubStore(on: On, store: Store, failWrites = false): void {
  on("store.get", (_$, e) => ({ value: store.get(e.key) }));
  on("store.set", (_$, e) => {
    if (failWrites) {
      throw new Error("disk full");
    }
    store.set(e.key, e.value);
    return { value: undefined };
  });
  on("store.delete", (_$, e) => {
    store.delete(e.key);
    return { value: undefined };
  });
  on("store.keys", () => ({ value: [...store.keys()] }));
}

/** What the host saw the plugin ask for, for a test to assert on. */
export interface Seen {
  logs: string[];
  registered: string[];
  usageArgs: unknown[];
}

export function newSeen(): Seen {
  return { logs: [], registered: [], usageArgs: [] };
}

/** Everything else the ledger asks the host: a fixed session, clock and breakdown. */
export function stubHost(on: On, sessionId: string, seen: Seen = newSeen()): void {
  let now = 1000;
  on("clock.now", () => {
    now += 5;
    return { value: now };
  });
  on("session.id", () => ({ value: sessionId }));
  on("session.usage", (_$, e) => {
    seen.usageArgs.push(e);
    return { value: usage() };
  });
  on("tool.register", (_$, e) => {
    seen.registered.push(e.name);
    return { value: { tool: `mcp__qsm-usage__${e.name}` } };
  });
  on("command.register", (_$, e) => ({ value: { command: e.name } }));
  on("ui.log", (_$, e) => {
    seen.logs.push(e.text);
    return { value: undefined };
  });
  on("ui.toast", () => ({ value: undefined }));
  on("session.start", (_$, e) => ({ cwd: e.cwd }));
  on("session.end", (_$, e) => ({ sessionId: e.sessionId }));
  on("turn.complete", (_$, e) => ({ text: e.answer, usage: e.usage }));
}

/** The record the ledger stored for a session; absent or malformed throws. */
export function sessionIn(store: Store, id: string): SessionRecord {
  const rec = asSession(store.get(`session:${id}`));
  if (rec === null) {
    throw new Error(`no ledger record for session ${id}`);
  }
  return rec;
}

/** The text a Bash result printed; any other shape throws. */
export function stdoutOf(result: unknown): string {
  if (typeof result === "object" && result !== null && "stdout" in result) {
    const { stdout } = result;
    if (typeof stdout === "string") {
      return stdout;
    }
  }
  throw new Error(`not a Bash result: ${JSON.stringify(result)}`);
}

/** A stored list of strings; any other value throws. */
export function stringsIn(store: Store, key: string): string[] {
  const value = store.get(key);
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${key} is not a list of strings`);
  }
  return value;
}
