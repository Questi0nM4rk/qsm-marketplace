// qsm-usage' function hooks module: the $.usage noun, so another plugin measures and encodes
// through a typed call instead of shelling out to a path, the ledger that records every session
// into the plugin's store at no model cost, and the two tool.call hooks that shape what a Bash
// call runs and what the model reads back.
import type {
  Caught,
  EngineInterface,
  On,
  PluginOptions,
  ToolCallInput,
  ToolCallResult,
} from "claude-code";
import {
  addCost,
  addInjection,
  addToon,
  addUse,
  asSession,
  type Breakdown,
  breakdownOf,
  newSession,
  nextIndex,
  type SessionRecord,
  scanBlocks,
} from "./ledger.ts";
import { isFilterAnswer } from "../lib/filter.ts";
import { isPlainObject } from "../lib/toon-scalar.ts";
import { argvOf, registerNoun, unwrap, verbs } from "./noun.generated.ts";
import { paneMarkdown, startBeforeFirstTurn } from "./pane.ts";
import { breakdownText, ledgerText } from "./report.ts";
import { conversionOf, offerOf, WRAP_TIMEOUT_MS } from "./toon-wrap.ts";

const INDEX_KEY = "sessions";
const sessionKey = (id: string) => `session:${id}`;

let current: SessionRecord | null = null;
let hasLogged = false;

// differs: hooks sandbox, root lib's messageOf
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The first failure of the module's life is shown once; later ones are silent. */
function logOnce($: EngineInterface, event: string, error: unknown): void {
  if (hasLogged) {
    return;
  }
  hasLogged = true;
  const line = `${event} failed: ${reasonOf(error)}`;
  try {
    // The engine names the plugin before a log line; a toast carries no name, so it adds its own.
    $.ui.log(line);
    $.ui.toast(`qsm-usage ERROR: ${line}`);
  } catch {
    // Nowhere left to report to; the event still continues.
  }
}

async function load($: EngineInterface): Promise<SessionRecord> {
  const id = await $.session.id();
  if (current?.id === id) {
    return current;
  }
  const stored = asSession(await $.store.get(sessionKey(id)));
  current = stored ?? newSession(id, await $.clock.now());
  return current;
}

/** Runs `change` on the current session's record; never throws. */
async function record(
  $: EngineInterface,
  event: string,
  change: (rec: SessionRecord) => void | Promise<void>,
): Promise<void> {
  try {
    await change(await load($));
  } catch (error) {
    logOnce($, event, error);
  }
}

/** Writes the current session and trims the index to the cap; never throws. */
async function flush($: EngineInterface, event: string): Promise<void> {
  const rec = current;
  if (rec === null) {
    return;
  }
  try {
    const stored = await $.store.get(INDEX_KEY);
    const known = Array.isArray(stored)
      ? stored.filter((i): i is string => typeof i === "string")
      : [];
    const next = nextIndex(known, rec.id);
    let { index } = next;
    for (const id of next.dropped) {
      await $.store.delete(sessionKey(id));
    }
    // The store file has a size limit: when a write is over it, the oldest sessions make room.
    for (;;) {
      try {
        await $.store.set(sessionKey(rec.id), rec);
        break;
      } catch (error) {
        const oldest = index.find((i) => i !== rec.id);
        if (!String(error).includes("over the") || oldest === undefined) {
          throw error;
        }
        index = index.filter((i) => i !== oldest);
        await $.store.delete(sessionKey(oldest));
      }
    }
    await $.store.set(INDEX_KEY, index);
  } catch (error) {
    logOnce($, event, error);
  }
}

/** Ends the in-memory session after its last write (session end, /clear). */
async function close($: EngineInterface, event: string): Promise<void> {
  await flush($, event);
  current = null;
}

/** The current session's record, read without a write. */
async function currentSession($: EngineInterface): Promise<SessionRecord | null> {
  try {
    return await load($);
  } catch {
    return null;
  }
}

/** The last `n` recorded sessions, newest first; the current one as in memory. */
async function recentSessions($: EngineInterface, n: number): Promise<SessionRecord[]> {
  const stored = await $.store.get(INDEX_KEY);
  const index = Array.isArray(stored)
    ? stored.filter((i): i is string => typeof i === "string")
    : [];
  const ids = index.slice(-n).toReversed();
  const out: SessionRecord[] = [];
  for (const id of ids) {
    const rec = id === current?.id ? current : asSession(await $.store.get(sessionKey(id)));
    if (rec !== null) {
      out.push(rec);
    }
  }
  return out;
}

const BREAKDOWN_TOOL = "mcp__qsm-usage__breakdown";
const LEDGER_TOOL = "mcp__qsm-usage__ledger";
const DEFAULT_SESSIONS = 10;

/** The summary breakdown is estimated locally; `full` would pay one
 * token-count request per tool and memory file, so the ledger never asks for it. */
async function breakdownNow($: EngineInterface): Promise<Breakdown> {
  const usage = await $.session.usage({ breakdown: "summary" });
  return breakdownOf(usage.context, await $.clock.now());
}

/** The tools and the command register once the session is ready, so both
 * are listed by the first turn. */
async function registerSurfaces($: EngineInterface): Promise<void> {
  try {
    await $.command.register({
      name: "qsm-usage",
      description:
        "Show this session's context: used and left, by category, and the three largest items with what cutting each saves. No model call.",
    });
    await $.tool.register({
      name: "breakdown",
      description:
        "The current session's context window by category (tokens per category, used and window), from the engine's summary breakdown. Costs no model call.",
      inputSchema: { type: "object", properties: {} },
    });
    await $.tool.register({
      name: "ledger",
      description:
        "The sessions qsm-usage recorded, newest first: turns, token usage, cost, injected text size, and the skills, commands, agents and tools used by name. Names and counts only, never prompt text.",
      inputSchema: {
        type: "object",
        properties: {
          sessions: {
            type: "number",
            description: `How many recent sessions; default ${DEFAULT_SESSIONS}.`,
          },
        },
      },
    });
  } catch (error) {
    logOnce($, "session.start", error);
  }
}

function sessionsWanted(input: unknown): number {
  const n = isPlainObject(input) ? input.sessions : undefined;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : DEFAULT_SESSIONS;
}

function registerSession(on: On): void {
  on("session.start", async ($, e, next) => {
    const result = await next(e);
    await registerSurfaces($);
    await record($, "session.start", async (rec) => {
      rec.start = await breakdownNow($);
    });
    await flush($, "session.start");
    return result;
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    const isMain = e.agentId === undefined;
    await record($, "turn.complete", async (rec) => {
      rec.turns.push({
        at: await $.clock.now(),
        durationMs: e.durationMs,
        reason: e.reason,
        agentId: e.agentId ?? null,
        usage: e.usage === undefined ? null : { ...e.usage },
        costUsd: null,
      });
      // Only the main conversation: `$.session.messages` with no agent is that conversation, and a
      // subagent's turn.complete adds none of it. The hooks that would see each piece as it is
      // built (prompt.attachment, skill.prompt) are passed over for a user plugin under an
      // organization's policy module, so the blocks are read here, once per turn.
      if (isMain) {
        const scan = scanBlocks(await $.session.messages({ as: "api" }), rec.blocksSeen);
        for (const tool of scan.tools) {
          addUse(rec, "tools", tool);
        }
        for (const skill of scan.skills) {
          addUse(rec, "skills", skill);
        }
        for (const piece of scan.injections) {
          addInjection(rec, piece.source, piece.name, piece.chars);
        }
        rec.blocksSeen = scan.seen;
      }
    });
    if (isMain) {
      await flush($, "turn.complete");
    }
    return result;
  });

  on("session.measure", async ($, e, next) => {
    const result = await next(e);
    const usd = e.cost?.usd;
    if (usd !== undefined) {
      await record($, "session.measure", (rec) => {
        addCost(rec, usd);
      });
    }
    return result;
  });

  on("session.end", async ($, e, next) => {
    const result = await next(e);
    await close($, "session.end");
    return result;
  });
}

function registerToolDescriptions(on: On): void {
  on("tool.describe", async ($, e, next) => {
    const result = await next(e);
    await record($, "tool.describe", (rec) => {
      addInjection(rec, "tool.describe", e.tool, result.description.length);
    });
    return result;
  });
}

function registerUses(on: On): void {
  on("command.run", async ($, e, next) => {
    const result = await next(e);
    await record($, "command.run", (rec) => {
      addUse(rec, "commands", e.command);
    });
    return result;
  });

  on("agent.spawn", async ($, e, next) => {
    const result = await next(e);
    if (!("deny" in result)) {
      await record($, "agent.spawn", (rec) => {
        addUse(rec, "agents", e.subagentType);
      });
    }
    return result;
  });
}

function registerLedgerTools(on: On): void {
  on("tool.call", { tool: BREAKDOWN_TOOL }, async ($) => ({
    result: breakdownText(await breakdownNow($)),
  }));

  on("tool.call", { tool: LEDGER_TOOL }, async ($, e) => ({
    result: ledgerText(await recentSessions($, sessionsWanted(e))),
  }));
}

/** Everything the ledger records, and the two tools that read it. */
function registerLedger(on: On): void {
  registerSession(on);
  registerToolDescriptions(on);
  registerUses(on);
  registerLedgerTools(on);
}

/** What every tool.call hook here does when it throws: the failure is shown once, and the call
 * carries on as it was. */
function carryOn<E, R>($: EngineInterface, e: E, next: ((e: E) => R) & Caught): R {
  logOnce($, "tool.call", next.error.message ?? next.error.kind);
  return next(e);
}

/** The command output filter may rewrite a Bash command or refuse it; the verb holds the rules. */
function registerFilter(on: On): void {
  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const answer = await $.usage.filter({
      command: e.command,
      subagent: e.agentId !== undefined,
    });
    if (!isFilterAnswer(answer)) {
      throw new TypeError("qsm-usage filter answered with something other than { command, deny }");
    }
    if (answer.deny !== null) {
      return { deny: answer.deny };
    }
    return next(answer.command === null ? e : { ...e, command: answer.command });
  }).catch(carryOn);
}

function stdoutOf(result: unknown): unknown {
  return isPlainObject(result) ? result.stdout : undefined;
}

/** The text a call printed and the command that printed it (null for an MCP tool): Bash's stdout,
 * or an MCP tool's result. Null when the call is no Bash or MCP call, failed, or printed none. */
function printed(e: ToolCallInput, ran: ToolCallResult) {
  if (ran.deny !== undefined || ran.isError === true) {
    return null;
  }
  const isBash = e.tool === "Bash";
  const out = isBash ? stdoutOf(ran.result) : ran.result;
  const isWrappable = isBash || e.tool.startsWith("mcp__");
  return isWrappable && typeof out === "string"
    ? { tool: e.tool, command: isBash ? e.command : null, raw: out }
    : null;
}

/** `qsm-usage toon wrap` decides on the text; the hook only offers it and swaps in the answer. */
async function toonOf($: EngineInterface, raw: string, hint: string) {
  const row = verbs.toonWrap;
  if (row === undefined) {
    throw new Error("the generated noun has no toonWrap verb; regenerate noun.generated.ts");
  }
  const argv = argvOf(row, { stdin: true });
  const ran = await $.process.run(argv, { stdin: raw, timeoutMs: WRAP_TIMEOUT_MS });
  return conversionOf(unwrap(argv, ran), hint);
}

/** A wrapped tool's structured result reaches the model as TOON when that is smaller. An errored
 * call and a call outside the list pass untouched. */
function registerToon(on: On, patterns: readonly string[]): void {
  on("tool.call", async ($, e, next) => {
    const ran = await next(e);
    const call = printed(e, ran);
    const offer = call === null ? null : offerOf(patterns, call);
    const conversion = offer === null ? null : await toonOf($, offer.raw, offer.hint);
    if (offer === null || conversion === null) {
      return ran;
    }
    await record($, "tool.call", (rec) => {
      addToon(rec, offer.pattern, conversion.fromTokens, conversion.toTokens);
    });
    const result =
      e.tool === "Bash" && isPlainObject(ran.result)
        ? { ...ran.result, stdout: conversion.text }
        : conversion.text;
    return { result, context: ran.context };
  }).catch(carryOn);
}

const PANE_ID = "qsm-usage";

/** Before the first main-thread turn the pane shows the recorded start
 * breakdown; after it, the breakdown as it is now. */
async function paneText($: EngineInterface): Promise<string> {
  try {
    const rec = await currentSession($);
    return paneMarkdown(startBeforeFirstTurn(rec) ?? (await breakdownNow($)), rec);
  } catch (error) {
    return `qsm-usage ERROR: ui.render: the breakdown is unavailable: ${reasonOf(error)}`;
  }
}

/** /qsm-usage: a pane over the session, drawn with no model call and no turn.
 * The command answers itself (no `next`), so nothing beneath runs. */
function registerPane(on: On): void {
  on("command.run", { command: "qsm-usage" }, async ($) => {
    await $.ui.open({ id: PANE_ID, title: "qsm-usage" });
    return {};
  });

  on("ui.render", { component: "Pane", requestId: PANE_ID }, async ($, e) => {
    const { Markdown } = $.ui.resolve(e);
    return <Markdown text={await paneText($)} />;
  });
}

export function register(on: On, options: PluginOptions): void {
  registerNoun(on);
  registerToon(on, [options.toonWrap ?? []].flat().map(String));
  registerFilter(on);
  registerLedger(on);
  registerPane(on);
}
