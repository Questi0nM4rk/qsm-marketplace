// The /qsm-usage pane: context used and left, the categories, and the three largest resident items
// with the change that would cut each.
import type { Breakdown, SessionRecord } from "./ledger.ts";
import { kTokens, used } from "./report.ts";

/** One of the session's largest resident items and the change that would cut it. */
export interface Item {
  tokens: number;
  line: string;
}

function mcpCalls(rec: SessionRecord | null, server: string): number {
  const prefix = `mcp__${server}__`;
  return Object.entries(rec?.uses.tools ?? {})
    .filter(([tool]) => tool.startsWith(prefix))
    .reduce((sum, [, n]) => sum + n, 0);
}

function mcpItem(server: string, tokens: number, calls: number): Item {
  const k = kTokens(tokens);
  return {
    tokens,
    line:
      calls === 0
        ? `MCP server ${server} has no calls this session: \`/mcp disable ${server}\` saves ~${k} tokens per turn`
        : `MCP server ${server} (~${k} tokens) was called ${calls} times this session: keep it, no saving`,
  };
}

function unusedLine(kind: string, name: string, tokens: number, uses: number): Item {
  const k = kTokens(tokens);
  return {
    tokens,
    line:
      uses === 0
        ? `${kind} ${name} was not used this session: switching it off saves ~${k} tokens per turn (the unused-extensions skill offers it)`
        : `${kind} ${name} (~${k} tokens) was used ${uses} times this session: keep it, no saving`,
  };
}

/** The resident items the breakdown names one by one, largest first. */
export function largestItems(b: Breakdown, rec: SessionRecord | null, count = 3): Item[] {
  const items: Item[] = [
    ...b.mcpServers.map((s) => mcpItem(s.server, s.tokens, mcpCalls(rec, s.server))),
    ...b.memoryFiles.map((f) => ({
      tokens: f.tokens,
      line: `${f.path} loads on every turn: the claude-md-trim skill finds what to cut, up to ~${kTokens(f.tokens)} tokens per turn`,
    })),
    ...b.skills.map((s) => unusedLine("skill", s.name, s.tokens, rec?.uses.skills[s.name] ?? 0)),
    ...b.agents.map((a) => unusedLine("agent", a.name, a.tokens, rec?.uses.agents[a.name] ?? 0)),
  ];
  return items.sort((x, y) => y.tokens - x.tokens).slice(0, count);
}

/** The recorded start breakdown while no main-thread turn has run, else null. */
export function startBeforeFirstTurn(rec: SessionRecord | null): Breakdown | null {
  if (rec === null || rec.turns.some((t) => t.agentId === null)) {
    return null;
  }
  return rec.start;
}

export function paneMarkdown(b: Breakdown, rec: SessionRecord | null): string {
  const u = used(b);
  const left = Math.max(0, b.window - u);
  const percent = b.window > 0 ? Math.round((u / b.window) * 100) : 0;
  const rows = [...b.categories]
    .sort((x, y) => y.tokens - x.tokens)
    .map((c) => `| ${c.name} | ${kTokens(c.tokens)} |`);
  const items = largestItems(b, rec).map((item, i) => `${i + 1}. ${item.line}`);
  const turns = rec?.turns.filter((t) => t.agentId === null).length ?? 0;
  return [
    `**Context:** ${kTokens(u)} of ${kTokens(b.window)} used, ${kTokens(left)} left (${percent}%)`,
    "",
    "| Category | Tokens |",
    "| --- | ---: |",
    ...rows,
    "",
    "**Largest items**",
    "",
    ...(items.length > 0 ? items : ["The breakdown names no single item."]),
    "",
    turns === 0 ? "No turn has run yet: this is the start breakdown." : `${turns} turns so far.`,
    "",
    "_Counts are the engine's summary breakdown, an estimate. Nothing here changes anything._",
  ].join("\n");
}
