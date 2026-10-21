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

/** Where the last read of the main conversation ended: the hash of its last block with the two
 * before it, and which occurrence of that hash among the conversation's blocks it was. */
export interface BlockAnchor {
  hash: string;
  nth: number;
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
  /** The end of the last read of the main conversation: `scanBlocks` reads what follows it, or the whole conversation when it is `null` or no longer there (a compaction). */
  anchor: BlockAnchor | null;
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
    anchor: null,
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

const isBreakdownOrNull = (value: unknown): boolean => value === null || isBreakdown(value);

function isTurnUsage(usage: unknown): boolean {
  return (
    isPlainObject(usage) &&
    isStr(usage.model) &&
    isNum(usage.input_tokens) &&
    isNum(usage.output_tokens) &&
    isNum(usage.cache_read_input_tokens) &&
    isNum(usage.cache_creation_input_tokens)
  );
}

function isAnchorOrNull(value: unknown): boolean {
  return value === null || (isPlainObject(value) && isStr(value.hash) && isNum(value.nth));
}

function isTurn(turn: Record<string, unknown>): boolean {
  return (
    isNum(turn.at) &&
    isNum(turn.durationMs) &&
    isStr(turn.reason) &&
    isStrOrNull(turn.agentId) &&
    isNumOrNull(turn.costUsd) &&
    (turn.usage === null || isTurnUsage(turn.usage))
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

/** The use counts, one count map per kind. */
function isUses(uses: unknown): boolean {
  return (
    isPlainObject(uses) &&
    isCounts(uses.skills) &&
    isCounts(uses.commands) &&
    isCounts(uses.agents) &&
    isCounts(uses.tools)
  );
}

/** Checks every field the ledger reads from a stored record, down to the rows. */
function isSessionRecord(value: unknown): value is SessionRecord {
  return (
    isPlainObject(value) &&
    isStr(value.id) &&
    isNum(value.startedAt) &&
    isBreakdownOrNull(value.start) &&
    everyRow(value.turns, isTurn) &&
    isNumOrNull(value.costUsd) &&
    everyRow(value.injected, isInjection) &&
    isUses(value.uses) &&
    everyRow(value.toon, isSaving) &&
    isAnchorOrNull(value.anchor)
  );
}

/** A stored value read back: null when nothing is stored, the record when it is one this module
 * wrote. Anything else throws: a record in an older shape is a store to migrate, not to guess at. */
export function asSession(value: unknown): SessionRecord | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isSessionRecord(value)) {
    const id = isPlainObject(value) ? String(value.id) : typeof value;
    throw new TypeError(`the stored session record ${id} is not in the ledger's shape`);
  }
  return value;
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

/** A message with the shape `turn.complete` reads from `$.session.messages({ as: "api" })`:
 * structural, so this file stays free of the ambient 'claude-code' module. */
export interface ApiMessageLike {
  role: string;
  content: readonly { type: string; [field: string]: unknown }[];
}

/** What one read of the conversation added: tool uses, skill uses, injected text, and the anchor. */
export interface BlockScan {
  tools: string[];
  skills: string[];
  injections: { source: InjectionSource; name: string; chars: number }[];
  anchor: BlockAnchor | null;
}

/** How many blocks, the last one included, a block's hash covers: one block alone can repeat after a
 * compaction ("Done."), three in a row almost never do. */
const ANCHOR_BLOCKS = 3;

const REMINDER = "<system-reminder>";
const SKILL_TEXT = "Base directory for this skill:";
const NAME_CHARS = 48;

/** A reminder's name: its first line up to the first colon, digits folded so a counter is one row. */
function reminderName(text: string): string {
  const line =
    text
      .slice(REMINDER.length)
      .split("\n")
      .find((l) => l.trim() !== "") ?? "";
  return (line.split(":")[0] ?? "").trim().replaceAll(/\d+/g, "#").slice(0, NAME_CHARS);
}

function skillDir(text: string): string {
  const line = text.slice(SKILL_TEXT.length).split("\n")[0] ?? "";
  return (
    line
      .trim()
      .split("/")
      .findLast((part) => part !== "") ?? ""
  );
}

type Block = ApiMessageLike["content"][number];

/** An assistant's tool_use block: a use of that tool, and of the skill it names for `Skill`. */
function scanToolUse(scan: BlockScan, asked: string[], { name, input }: Block): void {
  if (typeof name !== "string") {
    return;
  }
  scan.tools.push(name);
  if (name === "Skill" && isPlainObject(input) && typeof input.skill === "string") {
    scan.skills.push(input.skill);
    asked.push(input.skill);
  }
}

/** A user's text block: a reminder is an attachment, the skill's loaded text is the skill's prompt. */
function scanText(scan: BlockScan, asked: string[], text: string): void {
  if (text.startsWith(REMINDER)) {
    const name = reminderName(text);
    scan.injections.push({ source: "prompt.attachment", name, chars: text.length });
  } else if (text.startsWith(SKILL_TEXT)) {
    const name = asked.shift() ?? skillDir(text);
    scan.injections.push({ source: "skill.prompt", name, chars: text.length });
  }
}

/** What identifies a block between two reads: its text, or the id the API gave it. A tool result's
 * content is left out, because it can be large and its id already tells it apart. */
function blockIdentity(role: string, block: Block): string {
  switch (block.type) {
    case "text":
      return `${role}:text:${String(block.text)}`;
    case "tool_use":
      return `${role}:tool_use:${String(block.id)}:${String(block.name)}`;
    case "tool_result":
      return `${role}:tool_result:${String(block.tool_use_id)}`;
    default:
      return `${role}:${block.type}:${JSON.stringify(block)}`;
  }
}

/** cyrb53: a 53-bit string hash, synchronous (the module has no Node, and `crypto.subtle` is async).
 * It only tells blocks apart, so it needs no strength. */
function hashOf(text: string): string {
  let h1 = 0xde_ad_be_ef;
  let h2 = 0x41_c6_ce_57;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    h1 = Math.imul(h1 ^ code, 2_654_435_761);
    h2 = Math.imul(h2 ^ code, 1_597_334_677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2_246_822_507) ^ Math.imul(h2 ^ (h2 >>> 13), 3_266_489_909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2_246_822_507) ^ Math.imul(h1 ^ (h1 >>> 13), 3_266_489_909);
  return (4_294_967_296 * (2_097_151 & h2) + (h1 >>> 0)).toString(36);
}

/** The tool uses, skill uses and injected text in the blocks after `anchor`, in order. An anchor
 * that is `null`, or not in the conversation (it was compacted or rewritten), reads it whole. */
export function scanBlocks(
  messages: readonly ApiMessageLike[],
  anchor: BlockAnchor | null,
): BlockScan {
  const blocks = messages.flatMap((m) => m.content.map((block) => ({ role: m.role, block })));
  const identities = blocks.map(({ role, block }) => blockIdentity(role, block));
  const hashes = identities.map((_, i) =>
    hashOf(identities.slice(Math.max(0, i + 1 - ANCHOR_BLOCKS), i + 1).join("\0")),
  );
  // Each block's anchor key is its hash and which occurrence of that hash it is.
  const seen = new Map<string, number>();
  const keys = hashes.map((hash) => {
    const nth = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, nth);
    return `${hash}#${nth}`;
  });
  const start = anchor === null ? 0 : keys.indexOf(`${anchor.hash}#${anchor.nth}`) + 1;
  const last = hashes.at(-1);
  const scan: BlockScan = {
    tools: [],
    skills: [],
    injections: [],
    anchor: last === undefined ? null : { hash: last, nth: seen.get(last) ?? 1 },
  };
  const asked: string[] = [];
  for (const { role, block } of blocks.slice(start)) {
    if (role === "assistant" && block.type === "tool_use") {
      scanToolUse(scan, asked, block);
    } else if (role === "user" && block.type === "text" && typeof block.text === "string") {
      scanText(scan, asked, block.text);
    }
  }
  return scan;
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
