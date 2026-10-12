import { describe, expect, test } from "bun:test";
import { TranscriptBuilder } from "./fixtures/transcript.ts";
import { fullTurns, parseTranscript } from "./transcript.ts";

describe("parseTranscript", () => {
  test("only what a person and the model said is kept, as text", () => {
    const text = new TranscriptBuilder()
      .human("fix the gate")
      .thinking()
      .assistant("on it")
      .toolUse("Bash", { command: "bun test" })
      .toolResult("3 pass")
      .title("Fix the gate")
      .junk()
      .meta("Base directory for this skill: ...")
      .notification("task finished")
      .text();

    const t = parseTranscript(text);

    expect(t.turns.map((turn) => [turn.role, turn.kind, turn.text])).toEqual([
      ["user", "text", "fix the gate"],
      ["assistant", "text", "on it"],
    ]);
    expect(t.humanTurns).toBe(1);
    expect(t.cwd).toBe("/work/repo");
  });

  test("a session with no human turn has none", () => {
    const t = parseTranscript(new TranscriptBuilder().assistant("hello").toolResult("x").text());
    expect(t.humanTurns).toBe(0);
  });

  test("only a prompt a person typed counts: not a headless prompt, a notice or a hook injection", () => {
    const t = parseTranscript(
      new TranscriptBuilder()
        .headless("run the eval")
        .notification("task finished")
        .meta("Base directory for this skill: ...")
        .assistant("ok")
        .toolResult("x")
        .junk()
        .text(),
    );
    expect(t.humanTurns).toBe(0);
  });
});

describe("parseTranscript, local slash commands", () => {
  test("a turn that is only command wrappers is not a prompt, and wrappers are stripped from a typed one", () => {
    const only = parseTranscript(
      new TranscriptBuilder()
        .human("<command-name>/clear</command-name>\n<command-message>clear</command-message>")
        .human("<local-command-stdout></local-command-stdout>")
        .assistant("ok")
        .text(),
    );
    const mixed = parseTranscript(
      new TranscriptBuilder()
        .human("<command-name>/effort</command-name>\nnow fix the gate")
        .text(),
    );

    expect(only.humanTurns).toBe(0);
    expect(mixed.turns.map((t) => t.text)).toEqual(["now fix the gate"]);
  });
});

describe("parseTranscript, harness text typed as a user record", () => {
  test("notifications, compaction summaries, bash output and interrupts are not prompts; bash input is", () => {
    const t = parseTranscript(
      new TranscriptBuilder()
        .human("<task-notification>\n<task-id>a1</task-id></task-notification>")
        .human("This session is being continued from a previous conversation that ran out")
        .human("<bash-stdout>ok</bash-stdout><bash-stderr></bash-stderr>")
        .human("[Request interrupted by user for tool use]")
        .human("<local-command-caveat>Caveat: ...</local-command-caveat>")
        .assistant("ok")
        .text(),
    );
    expect(t.humanTurns).toBe(0);

    const typed = parseTranscript(
      new TranscriptBuilder().human("<bash-input>ls</bash-input>").text(),
    );
    expect(typed.humanTurns).toBe(1);
  });
});

describe("parseTranscript, the title", () => {
  test("the title comes from the transcript's own ai-title record", () => {
    const t = parseTranscript(new TranscriptBuilder().human("hi").title("Fix the gate").text());
    expect(t.title).toBe("Fix the gate");
  });

  test("without an ai-title the first human line becomes the title, cut to 80", () => {
    const long = `${"x".repeat(100)}\nsecond line`;
    const t = parseTranscript(new TranscriptBuilder().human(long).text());
    expect(t.title).toHaveLength(80);
    expect(t.title?.endsWith("…")).toBe(true);
  });

  test("a half-written last line is skipped, never refused", () => {
    const t = parseTranscript(new TranscriptBuilder().human("hi").truncatedTail().text());
    expect(t.turns).toHaveLength(1);
  });
});

describe("fullTurns", () => {
  test("tool calls and results come back in file order", () => {
    const turns = fullTurns(
      new TranscriptBuilder()
        .human("fix the gate")
        .toolUse("Bash", { command: "bun test" })
        .toolResult("3 pass")
        .junk()
        .text(),
    );

    expect(turns.map((turn) => [turn.kind, turn.tool, turn.text])).toEqual([
      ["text", null, "fix the gate"],
      ["tool_use", "Bash", '{"command":"bun test"}'],
      ["tool_result", null, "3 pass"],
    ]);
  });
});
