// Builds transcript text the way Claude Code writes it, one record per line, so tests cover every
// record type seen on a real machine (2026-09-30) without shipping a real transcript.

import { join } from "node:path";
import { sandboxDir } from "../../../../lib/fixtures/sandbox.ts";

/** An environment whose archive, and so whose blob store, is a sandbox directory. */
export function testEnv(): Record<string, string> {
  return { QSM_MEMORY_DB: join(sandboxDir("qsm-memory-env-"), "memory.db") };
}

interface Opts {
  readonly cwd?: string;
  readonly sessionId?: string;
}

export class TranscriptBuilder {
  private readonly lines: string[] = [];
  private n = 0;
  private readonly cwd: string;
  private readonly sessionId: string;
  private clock = Date.parse("2026-09-30T10:00:00.000Z");

  constructor(opts: Opts = {}) {
    this.cwd = opts.cwd ?? "/work/repo";
    this.sessionId = opts.sessionId ?? "11111111-2222-3333-4444-555555555555";
  }

  private next(): { uuid: string; timestamp: string } {
    this.n += 1;
    this.clock += 1000;
    return {
      uuid: `${this.sessionId.slice(0, 8)}-${String(this.n).padStart(4, "0")}`,
      timestamp: new Date(this.clock).toISOString(),
    };
  }

  private push(record: Record<string, unknown>): this {
    this.lines.push(JSON.stringify(record));
    return this;
  }

  private conversation(type: "user" | "assistant", content: unknown, extra = {}): this {
    return this.push({
      parentUuid: null,
      isSidechain: false,
      cwd: this.cwd,
      sessionId: this.sessionId,
      version: "2.1.280",
      type,
      message: { role: type, content },
      ...this.next(),
      ...extra,
    });
  }

  human(text: string): this {
    return this.conversation("user", text, { origin: { kind: "human" }, promptSource: "typed" });
  }

  /** A typed prompt that pastes an image, as base64, beside its text. */
  humanWithImage(text: string, base64: string, mediaType = "image/png"): this {
    return this.conversation(
      "user",
      [
        { type: "text", text },
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
      ],
      { origin: { kind: "human" }, promptSource: "typed" },
    );
  }

  /** The prompt of a headless `claude -p` run: a user record nobody typed. */
  headless(text: string): this {
    return this.conversation("user", text, { promptSource: "sdk" });
  }

  /** A background-task notice the harness injects as a user record. */
  notification(text: string): this {
    return this.conversation("user", text, {
      origin: { kind: "task-notification" },
      promptSource: "system",
    });
  }

  /** A skill body or system reminder the harness injects as a user record. */
  meta(text: string): this {
    return this.conversation("user", [{ type: "text", text }], { isMeta: true });
  }

  assistant(text: string): this {
    return this.conversation("assistant", [{ type: "text", text }]);
  }

  thinking(): this {
    return this.conversation("assistant", [{ type: "thinking", thinking: "..." }]);
  }

  toolUse(name: string, input: Record<string, unknown>, id = "toolu_1"): this {
    return this.conversation("assistant", [{ type: "tool_use", id, name, input }]);
  }

  toolResult(text: string, id = "toolu_1"): this {
    return this.conversation("user", [{ type: "tool_result", tool_use_id: id, content: text }]);
  }

  title(aiTitle: string): this {
    return this.push({ type: "ai-title", aiTitle, sessionId: this.sessionId });
  }

  /** The record types that carry no conversation. */
  junk(): this {
    this.push({ type: "last-prompt", leafUuid: "x", sessionId: this.sessionId });
    this.push({ type: "mode", mode: "normal", sessionId: this.sessionId });
    this.push({ type: "queue-operation", operation: "enqueue", content: "queued text" });
    this.push({ type: "file-history-snapshot", messageId: "m", snapshot: {} });
    return this.push({
      parentUuid: null,
      type: "attachment",
      attachment: { type: "hook_success", stdout: "hook output text" },
      ...this.next(),
    });
  }

  /** A half-written last line, as a live transcript has. */
  truncatedTail(): this {
    this.lines.push('{"type":"assistant","message":{"role":"assis');
    return this;
  }

  text(): string {
    return `${this.lines.join("\n")}\n`;
  }
}
