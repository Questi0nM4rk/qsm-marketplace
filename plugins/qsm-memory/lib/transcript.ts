// A Claude Code transcript (JSONL) read down to what a person and the model said.

import { basename } from "node:path";
import { z } from "zod";

type TurnKind = "text" | "tool_use" | "tool_result";
type Role = "user" | "assistant";

export interface Turn {
  /** record uuid plus block index: one assistant record may carry two blocks */
  readonly uuid: string;
  readonly role: Role;
  readonly kind: TurnKind;
  readonly ts: string;
  readonly tool: string | null;
  readonly text: string;
}

export interface Transcript {
  readonly cwd: string | null;
  readonly title: string | null;
  /** what a person typed and what the model answered, as text; nothing else */
  readonly turns: readonly Turn[];
  /** the user turns among `turns`: a person's prompts, not a tool result, a hook or system
   * injection, or the prompt of a headless run */
  readonly humanTurns: number;
}

const resultContentSchema = z.union([
  z.string(),
  z.array(z.object({ type: z.string().optional(), text: z.string().optional() })),
]);
type ResultContent = z.infer<typeof resultContentSchema>;

const blockSchema = z.object({
  type: z.string().optional(),
  text: z.string().optional(),
  name: z.string().optional(),
  input: z.unknown().optional(),
  content: resultContentSchema.optional(),
});
type Block = z.infer<typeof blockSchema>;

const recordSchema = z.object({
  type: z.string().optional(),
  uuid: z.string().optional(),
  timestamp: z.string().optional(),
  cwd: z.string().optional(),
  isMeta: z.boolean().optional(),
  origin: z.object({ kind: z.string().optional() }).optional(),
  promptSource: z.string().optional(),
  aiTitle: z.string().optional(),
  message: z.object({ content: z.union([z.string(), z.array(blockSchema)]).optional() }).optional(),
});
type TranscriptRecord = z.infer<typeof recordSchema>;

const TITLE_MAX = 80;

function resultText(content: ResultContent | undefined): string {
  if (content === undefined) {
    return "";
  }
  if (typeof content === "string") {
    return content;
  }
  return content
    .flatMap((part) => (part.type === "text" && part.text !== undefined ? [part.text] : []))
    .join("\n");
}

type Body = Pick<Turn, "kind" | "tool" | "text">;

function toolBody(block: Block): Body | null {
  if (block.type === "tool_use" && typeof block.name === "string") {
    return { kind: "tool_use", tool: block.name, text: JSON.stringify(block.input ?? {}) };
  }
  return block.type === "tool_result"
    ? { kind: "tool_result", tool: null, text: resultText(block.content) }
    : null;
}

/** The kind, tool and text of one block, or null for a block we drop (thinking, an empty text).
 * Tool calls and results come back only for a full read. */
function blockBody(block: Block, full: boolean): Body | null {
  if (block.type === "text") {
    return typeof block.text === "string" && block.text.trim().length > 0
      ? { kind: "text", tool: null, text: block.text }
      : null;
  }
  return full ? toolBody(block) : null;
}

function isConversation(record: TranscriptRecord): record is TranscriptRecord & {
  type: Role;
  uuid: string;
} {
  return (
    (record.type === "user" || record.type === "assistant") &&
    typeof record.uuid === "string" &&
    record.isMeta !== true
  );
}

/** A prompt the person typed (or queued while the model worked). Records without `origin` are
 * older transcripts, kept when nothing marks them as injected. */
function isTyped(record: TranscriptRecord): boolean {
  return record.origin === undefined
    ? record.promptSource === undefined
    : record.origin.kind === "human";
}

const COMMAND_WRAPPER =
  /<(command-name|command-message|command-args|local-command-stdout|local-command-caveat)>[\s\S]*?<\/\1>/g;

// Text the harness writes into a user record: a background-task notice, the summary a compaction
// leaves, a `!` command's output, an interrupt marker. `<bash-input>` is not here: a person typed it.
const HARNESS_TEXT =
  /^(<task-notification>|<bash-stdout>|<bash-stderr>|\[Request interrupted by user|This session is being continued from a previous conversation)/;

/** The text of a user turn without the wrappers a local slash command (/clear, /compact, /effort)
 * leaves in the transcript; empty when nothing else was typed or when what is left is harness
 * text, which no person said. */
export function typedText(text: string): string {
  const rest = text.replace(COMMAND_WRAPPER, "").trim();
  return HARNESS_TEXT.test(rest) ? "" : rest;
}

function recordTurns(record: TranscriptRecord, full: boolean): Turn[] {
  if (!isConversation(record) || (!full && record.type === "user" && !isTyped(record))) {
    return [];
  }
  const { type: role, uuid } = record;
  const ts = record.timestamp ?? "";
  const content = record.message?.content;
  const blocks: readonly Block[] =
    typeof content === "string" ? [{ type: "text", text: content }] : (content ?? []);
  const turns: Turn[] = [];
  blocks.forEach((block, index) => {
    const raw = blockBody(block, full);
    const body =
      raw !== null && !full && role === "user" ? { ...raw, text: typedText(raw.text) } : raw;
    if (body !== null && (full || body.text.length > 0)) {
      turns.push({ uuid: `${uuid}/${index}`, role, ts, ...body });
    }
  });
  return turns;
}

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
}

/** A line that is not complete JSON (a live file's tail) is skipped, never
 * refused. */
function parseLine(line: string): TranscriptRecord | null {
  if (line.trim().length === 0) {
    return null;
  }
  try {
    const parsed = recordSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function records(text: string): TranscriptRecord[] {
  return text.split("\n").flatMap((line) => parseLine(line) ?? []);
}

export function parseTranscript(text: string): Transcript {
  const all = records(text);
  const turns = all.flatMap((record) => recordTurns(record, false));
  const human = turns.filter((turn) => turn.role === "user");
  const aiTitle = all.findLast((r) => r.type === "ai-title" && typeof r.aiTitle === "string");
  const cwd = all.find((r) => typeof r.cwd === "string")?.cwd ?? null;
  const title = aiTitle?.aiTitle ?? (human[0] === undefined ? null : firstLine(human[0].text));
  return { cwd, title, turns, humanTurns: human.length };
}

/** Every conversation turn of a transcript, tool calls and results included, in file order:
 * what `show --full` prints from the file on disk. */
export function fullTurns(text: string): Turn[] {
  return records(text).flatMap((record) => recordTurns(record, true));
}

/** The session id of a main transcript, `<projects>/<dir>/<session-id>.jsonl`. */
export function sessionIdOf(transcriptPath: string): string {
  return basename(transcriptPath, ".jsonl");
}
