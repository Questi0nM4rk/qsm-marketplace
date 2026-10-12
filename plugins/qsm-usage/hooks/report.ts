// What the ledger reads back as through its two tools. Pure: the caller
// fetches the breakdown and the records.
import { encode } from "../lib/toon-encode.ts";
import type { Breakdown, SessionRecord } from "./ledger.ts";

/** 1234 -> "1.2k", 800 -> "800". */
export function kTokens(n: number): string {
  return n < 1000 ? String(Math.round(n)) : `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

export function used(b: Breakdown): number {
  return (
    b.tokens ??
    b.categories.filter((c) => c.kind === "used").reduce((total, c) => total + c.tokens, 0)
  );
}

/** The `breakdown` tool's answer: the current context by category. */
export function breakdownText(b: Breakdown): string {
  return encode({
    context: { used: used(b), window: b.window },
    categories: [...b.categories].sort((x, y) => y.tokens - x.tokens),
  });
}

function counts(map: Record<string, number>): string {
  return Object.entries(map)
    .map(([name, n]) => `${name}=${n}`)
    .join(" ");
}

function sum(values: readonly number[]): number {
  return values.reduce((total, v) => total + v, 0);
}

/** The `ledger` tool's answer: one summary row per session, newest first. */
export function ledgerText(sessions: readonly SessionRecord[]): string {
  const rows = sessions.map((s) => {
    const usages = s.turns.flatMap((t) => (t.usage === null ? [] : [t.usage]));
    return {
      id: s.id,
      startedAt: new Date(s.startedAt).toISOString(),
      turns: s.turns.filter((t) => t.agentId === null).length,
      startTokens: s.start === null ? null : used(s.start),
      inputTokens: sum(usages.map((u) => u.input_tokens)),
      outputTokens: sum(usages.map((u) => u.output_tokens)),
      cacheReadTokens: sum(usages.map((u) => u.cache_read_input_tokens)),
      cacheCreationTokens: sum(usages.map((u) => u.cache_creation_input_tokens)),
      costUsd: s.costUsd,
      injectedChars: sum(s.injected.map((i) => i.chars)),
      toonSavedTokens: sum(s.toon.map((t) => t.fromTokens - t.toTokens)),
      skills: counts(s.uses.skills),
      commands: counts(s.uses.commands),
      agents: counts(s.uses.agents),
      tools: counts(s.uses.tools),
    };
  });
  return rows.length === 0 ? "no sessions recorded yet" : encode({ sessions: rows });
}
