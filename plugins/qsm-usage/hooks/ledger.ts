// The ledger's data: one record per session, names, sizes and counts only.

import { isPlainObject } from "../lib/toon-scalar.ts";

export interface TurnUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface ContextUsage {
  tokens?: number;
  window: number;
  breakdown?: {
    categories: readonly { name: string; tokens: number; kind: string }[];
    memoryFiles: readonly { path: string; tokens: number }[];
    mcpTools: readonly { name: string; serverName: string; tokens: number; isLoaded: boolean }[];
    agents: readonly { agentType: string; tokens: number }[];
    skills?: { skillFrontmatter: readonly { name: string; pluginName?: string; tokens: number }[] };
  };
}

export const LEDGER_SESSIONS = 200;

export type InjectionSource = "prompt.attachment" | "tool.describe" | "skill.prompt";

export type UseKind = "skills" | "commands" | "agents" | "tools";

/** The context breakdown as the ledger keeps it: the summary figures, no grid. */
export interface Breakdown {
  at: number;
  tokens: number | null;
  window: number;
  categories: readonly { name: string; tokens: number; kind: string }[];
  mcpServers: readonly { server: string; tokens: number; tools: number }[];
  memoryFiles: readonly { path: string; tokens: number }[];
  skills: readonly { name: string; plugin: string | null; tokens: number }[];
  agents: readonly { name: string; tokens: number }[];
}

export interface TurnRecord {
  at: number;
  durationMs: number;
  reason: string;
  agentId: string | null;
  usage: TurnUsage | null;
  costUsd: number | null;
}

/** Every piece with one source and name folded into one row: how often, how big. */
export interface Injection {
  source: InjectionSource;
  name: string;
  count: number;
  chars: number;
  lastChars: number;
}

export interface ToonSaving {
  pattern: string;
  count: number;
  fromTokens: number;
  toTokens: number;
}

export interface SessionRecord {
  id: string;
  startedAt: number;
  start: Breakdown | null;
  turns: TurnRecord[];
  costUsd: number | null;
  injected: Injection[];
  uses: Record<UseKind, Record<string, number>>;
  toon: ToonSaving[];
  /**
   * How many of the main conversation's messages `turn.complete` has already read for their
   * tool_use blocks; `toolUsesSince` reads only what came after.
   */
  toolMessagesSeen: number;
}

export function newSession(id: string, at: number): SessionRecord {
  return {
    id,
    startedAt: at,
    start: null,
    turns: [],
    costUsd: null,
    injected: [],
    uses: { skills: {}, commands: {}, agents: {}, tools: {} },
    toon: [],
    toolMessagesSeen: 0,
  };
}

const isNum = (value: unknown): value is number => typeof value === "number";
const isStr = (value: unknown): value is string => typeof value === "string";
const isNumOrNull = (value: unknown): value is number | null => value === null || isNum(value);
const isStrOrNull = (value: unknown): value is string | null => value === null || isStr(value);

function everyRow(value: unknown, row: (item: Record<string, unknown>) => boolean): boolean {
  return Array.isArray(value) && value.every((item: unknown) => isPlainObject(item) && row(item));
}

function isCounts(value: unknown): boolean {
  return isPlainObject(value) && Object.values(value).every((count) => isNum(count));
}

function isBreakdown(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    isNum(value.at) &&
    isNumOrNull(value.tokens) &&
    isNum(value.window) &&
    everyRow(value.categories, (c) => isStr(c.name) && isNum(c.tokens) && isStr(c.kind)) &&
    everyRow(value.mcpServers, (m) => isStr(m.server) && isNum(m.tokens) && isNum(m.tools)) &&
    everyRow(value.memoryFiles, (f) => isStr(f.path) && isNum(f.tokens)) &&
    everyRow(value.skills, (s) => isStr(s.name) && isStrOrNull(s.plugin) && isNum(s.tokens)) &&
    everyRow(value.agents, (a) => isStr(a.name) && isNum(a.tokens))
  );
}

function isTurn(turn: Record<string, unknown>): boolean {
  const { usage } = turn;
  return (
    isNum(turn.at) &&
    isNum(turn.durationMs) &&
    isStr(turn.reason) &&
    isStrOrNull(turn.agentId) &&
    isNumOrNull(turn.costUsd) &&
    (usage === null ||
      (isPlainObject(usage) &&
        isStr(usage.model) &&
        isNum(usage.input_tokens) &&
        isNum(usage.output_tokens) &&
        isNum(usage.cache_read_input_tokens) &&
        isNum(usage.cache_creation_input_tokens)))
  );
}

const isInjectionSource = (value: unknown): value is InjectionSource =>
  value === "prompt.attachment" || value === "tool.describe" || value === "skill.prompt";

function isInjection(row: Record<string, unknown>): boolean {
  return (
    isInjectionSource(row.source) &&
    isStr(row.name) &&
    isNum(row.count) &&
    isNum(row.chars) &&
    isNum(row.lastChars)
  );
}

function isSaving(row: Record<string, unknown>): boolean {
  return isStr(row.pattern) && isNum(row.count) && isNum(row.fromTokens) && isNum(row.toTokens);
}

/** Checks every field the ledger reads from a stored record, down to the rows. */
function isSessionRecord(value: unknown): value is SessionRecord {
  return (
    isPlainObject(value) &&
    isStr(value.id) &&
    isNum(value.startedAt) &&
    (value.start === null || isBreakdown(value.start)) &&
    everyRow(value.turns, isTurn) &&
    isNumOrNull(value.costUsd) &&
    everyRow(value.injected, isInjection) &&
    isPlainObject(value.uses) &&
    isCounts(value.uses.skills) &&
    isCounts(value.uses.commands) &&
    isCounts(value.uses.agents) &&
    isCounts(value.uses.tools) &&
    everyRow(value.toon, isSaving) &&
    isNum(value.toolMessagesSeen)
  );
}

/** A stored value read back: a record this module wrote, or null. */
export function asSession(value: unknown): SessionRecord | null {
  if (!isPlainObject(value) || typeof value.id !== "string" || !Array.isArray(value.turns)) {
    return null;
  }
  // Older records carried a per-turn breakdown nothing read; it goes when the record is next written.
  const turns: unknown[] = value.turns.map((turn: unknown) => {
    if (!isPlainObject(turn)) {
      return turn;
    }
    const { after: _after, ...kept } = turn;
    return kept;
  });
  const record = { ...value, turns };
  return isSessionRecord(record) ? record : null;
}

export function breakdownOf(context: ContextUsage, at: number): Breakdown {
  const b = context.breakdown;
  const servers = new Map<string, { tokens: number; tools: number }>();
  for (const tool of b?.mcpTools ?? []) {
    if (!tool.isLoaded) {
      continue;
    }
    const row = servers.get(tool.serverName) ?? { tokens: 0, tools: 0 };
    servers.set(tool.serverName, { tokens: row.tokens + tool.tokens, tools: row.tools + 1 });
  }
  return {
    at,
    tokens: context.tokens ?? null,
    window: context.window,
    categories: (b?.categories ?? []).map((c) => ({
      name: c.name,
      tokens: c.tokens,
      kind: c.kind,
    })),
    mcpServers: [...servers].map(([server, row]) => ({ server, ...row })),
    memoryFiles: (b?.memoryFiles ?? []).map((f) => ({ path: f.path, tokens: f.tokens })),
    skills: (b?.skills?.skillFrontmatter ?? []).map((s) => ({
      name: s.name,
      plugin: s.pluginName ?? null,
      tokens: s.tokens,
    })),
    agents: (b?.agents ?? []).map((a) => ({ name: a.agentType, tokens: a.tokens })),
  };
}

export function addInjection(
  rec: SessionRecord,
  source: InjectionSource,
  name: string,
  chars: number,
): void {
  const row = rec.injected.find((i) => i.source === source && i.name === name);
  if (row === undefined) {
    rec.injected.push({ source, name, count: 1, chars, lastChars: chars });
    return;
  }
  row.count += 1;
  row.chars += chars;
  row.lastChars = chars;
}

export function addUse(rec: SessionRecord, kind: UseKind, name: string): void {
  rec.uses[kind][name] = (rec.uses[kind][name] ?? 0) + 1;
}

/** A message with the shape `turn.complete` reads from `$.session.messages()`:
 * structural, so this file stays free of the ambient 'claude-code' module. */
export interface MessageToolUses {
  toolUses: readonly { tool: string }[];
}

/** The tool names of every `tool_use` block added since message `seen`, in order. */
export function toolUsesSince(
  messages: readonly MessageToolUses[],
  seen: number,
): readonly string[] {
  return messages.slice(seen).flatMap((m) => m.toolUses.map((t) => t.tool));
}

export function addToon(
  rec: SessionRecord,
  pattern: string,
  fromTokens: number,
  toTokens: number,
): void {
  const row = rec.toon.find((t) => t.pattern === pattern);
  if (row === undefined) {
    rec.toon.push({ pattern, count: 1, fromTokens, toTokens });
    return;
  }
  row.count += 1;
  row.fromTokens += fromTokens;
  row.toTokens += toTokens;
}

/** session.measure fires after a main-thread turn: the session's cost so far
 * lands on the turn that just ended, once, and on the session always. */
export function addCost(rec: SessionRecord, usd: number): void {
  rec.costUsd = usd;
  const last = rec.turns.toReversed().find((t) => t.agentId === null);
  if (last !== undefined && last.costUsd === null) {
    last.costUsd = usd;
  }
}

/** The index after `id` is written: newest last, the oldest dropped past the cap. */
export function nextIndex(
  index: readonly string[],
  id: string,
): { index: string[]; dropped: string[] } {
  const next = [...index.filter((i) => i !== id), id];
  const over = Math.max(0, next.length - LEDGER_SESSIONS);
  return { index: next.slice(over), dropped: next.slice(0, over) };
}
