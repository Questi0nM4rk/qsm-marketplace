// qsm-secrets' function-hooks module: the noun, `$.secrets`, one method per verb, and the guard that
// refuses a Bash command that would print a stored credential into the tool result (the decision is
// blockedCommand, a pure function of the command line in lib/), and the capture of a pasted secret
// before the prompt enters the session (the decision is `qsm-secrets capture`), and the use of a
// captured id: replaced in the command by substitute, masked in the result by `qsm-secrets mask`.
import type { ApiContentBlock, On, SessionAppendInput } from "claude-code";
import { blockedCommand } from "../lib/blocked.ts";
import { substitute } from "../lib/substitute.ts";
import { argvOf, registerNoun, unwrap, type VerbRow, verbs } from "./noun.generated.ts";

// A backend that wants an unlock prompt must not hold the prompt for long.
const CAPTURE_TIMEOUT_MS = 10_000;

// What a person typed or pasted: the terminal, the remote bridge, the SDK host, a channel's human. Every
// other origin is text the engine, another session or a model wrote (a task notification, a subagent
// hand-back, a schedule): it holds ids and paths that look like tokens, and a capture would replace them.
const PERSON_ORIGINS: readonly string[] = ["composer", "bridge", "sdk", "channel"];

/** What a failed hook says about itself in the log: the kind and the message, which names the verb,
 * the exit code, the outcome code or stderr; never a stdout, which may hold the prompt. */
function cause(error: { readonly kind: string; readonly message?: string }): string {
  return `${error.kind}: ${(error.message ?? "no message").slice(0, 400)}`;
}

function isEnvelope(stdout: string): boolean {
  try {
    return typeof (JSON.parse(stdout) as { exit?: unknown }).exit === "number";
  } catch {
    return false;
  }
}

/** A verb's data from a `process.run` result. unwrap quotes a stdout that is no envelope, which for
 * capture and mask can be the prompt or the result, so that case is rebuilt from exit code and stderr. */
function dataOf(
  argv: string[],
  ran: { exitCode: number; stdout: string; stderr: string },
): unknown {
  if (!isEnvelope(ran.stdout)) {
    const stderr = ran.stderr.trim().slice(0, 300);
    throw new Error(
      `${argv.slice(0, 2).join(" ")} printed no outcome envelope (exit ${ran.exitCode}): ${stderr.length > 0 ? stderr : "no stderr"}`,
    );
  }
  return unwrap(argv, ran);
}

/** A command naming an id runs with the value in its environment; its result is masked on the way
 * into the conversation, by the session.append hook. */
function registerSubstitution(on: On): void {
  on("tool.call", { tool: "Bash" }, (_$, e, next) => {
    const { command, ids } = substitute(e.command);
    return ids.length === 0 ? next(e) : next({ ...e, command });
  }).catch(($, _e, next) => {
    $.ui.toast(`qsm-secrets ERROR: tool.call: ${next.error.kind}`);
    $.ui.log(`the id substitution failed (${cause(next.error)}); the call was denied`);
    return {
      deny: `qsm-secrets: the id substitution failed (${cause(next.error)}); the call was not run`,
    };
  });
}

/**
 * Rewrites every text of a row's content, in a fixed order: a text block, a tool_result's string
 * content, and the text blocks inside a tool_result's content. Media and other blocks are kept.
 */
function mapTexts(content: ApiContentBlock[], map: (text: string) => string): ApiContentBlock[] {
  const mapBlock = (block: ApiContentBlock): ApiContentBlock => {
    if (block.type === "text" && typeof block.text === "string") {
      return { ...block, text: map(block.text) };
    }
    if (block.type === "tool_result" && typeof block.content === "string") {
      return { ...block, content: map(block.content) };
    }
    if (block.type === "tool_result" && Array.isArray(block.content)) {
      return { ...block, content: (block.content as ApiContentBlock[]).map(mapBlock) };
    }
    return block;
  };
  return content.map(mapBlock);
}

/** Every row the conversation keeps, whatever its door, passes through one mask before it is stored. */
function registerMask(on: On): void {
  const withheld = (reason: string): string =>
    `qsm-secrets: this text could not be masked and was withheld (${reason.slice(0, 300)})`;
  const rewritten = (e: SessionAppendInput, content: ApiContentBlock[]): SessionAppendInput => ({
    ...e,
    message: { ...e.message, content },
  });
  on("session.append", async ($, e, next) => {
    const texts: string[] = [];
    mapTexts(e.message.content, (text) => {
      texts.push(text);
      return text;
    });
    if (texts.every((text) => text === "")) {
      return next(e);
    }
    const argv = argvOf(verbs.mask as VerbRow, { all: true });
    const ran = await $.process.run(argv, {
      stdin: JSON.stringify(texts),
      timeoutMs: CAPTURE_TIMEOUT_MS,
    });
    const done = (dataOf(argv, ran) as { texts: string[] }).texts;
    if (done.length !== texts.length) {
      throw new Error(`the mask returned ${done.length} texts for ${texts.length}`);
    }

    return next(
      rewritten(
        e,
        mapTexts(e.message.content, () => done.shift() as string),
      ),
    );
  }).catch(($, e, next) => {
    // Fails closed: a row that could not be masked may hold a value, so its text is replaced.
    $.ui.toast("qsm-secrets ERROR: session.append: a row could not be masked and was withheld");
    $.ui.log(`the mask failed (${cause(next.error)}); the row's text was withheld`);
    const notice = withheld(cause(next.error));
    return next(
      rewritten(
        e,
        mapTexts(e.message.content, (text) => (text === "" ? text : notice)),
      ),
    );
  });
}

/** The session is over: its rendered files go, and a transcript holds the pasted prompt raw (the
 * engine writes it before the capture runs), so the value in it is swapped for its placeholder. */
function registerScrub(on: On): void {
  on("session.end", async ($, e, next) => {
    const session = await $.session.id();
    // The scrub first: a failed clean must not leave the transcript holding a pasted value.
    await $.secrets.scrub({ transcript: session, detach: true });
    await $.secrets.clean({ session });
    return next(e);
  }).catch(($, e, next) => {
    $.ui.toast("qsm-secrets ERROR: session.end: the cleanup or the scrub did not finish");
    $.ui.log(`the session-end cleanup failed (${cause(next.error)}); the session ended`);
    return next(e);
  });
}

export function register(on: On): void {
  // Adds $.secrets: one method per qsm-secrets verb, generated by lib/generate-noun.ts. Never
  // hand-edit noun.generated.ts or types/index.d.ts.
  registerNoun(on);
  registerSubstitution(on);
  registerMask(on);
  registerScrub(on);

  on("tool.call", { tool: "Bash" }, ($, e, next) => {
    const refusal = blockedCommand(e.command);
    if (refusal === null) {
      return next(e);
    }
    $.ui.log(`refused ${refusal.command}`);
    return { deny: refusal.reason };
  }).catch(($, _e, next) => {
    const reason = `${next.error.kind}${next.error.message === undefined ? "" : `: ${next.error.message.slice(0, 120)}`}`;
    $.ui.toast(`qsm-secrets ERROR: tool.call: ${reason}`);
    $.ui.log(`the credential guard failed (${cause(next.error)}); the call was denied`);
    return { deny: `qsm-secrets: the credential guard failed (${reason}); the call was not run` };
  });

  on("prompt.submit", async ($, e, next) => {
    if (!PERSON_ORIGINS.includes(e.origin.kind)) {
      $.ui.log(`a ${e.origin.kind} prompt is not the person's own; it was not captured`);
      return next(e);
    }
    const argv = argvOf(verbs.capture as VerbRow);
    const ran = await $.process.run(argv, { stdin: e.text, timeoutMs: CAPTURE_TIMEOUT_MS });
    const done = dataOf(argv, ran) as {
      text: string;
      captured: { id: string }[];
    };
    if (done.captured.length === 0) {
      return next(e);
    }
    const ids = done.captured.map((c) => c.id).join(", ");
    $.ui.toast(`qsm-secrets: captured ${done.captured.length} secret(s) as ${ids}`);
    return next({ ...e, text: done.text });
  }).catch(($, e, next) => {
    // Fails open on purpose: dropping the prompt is harsher than a loud toast. The log names the
    // cause, never the text.
    $.ui.toast("qsm-secrets ERROR: prompt.submit: capture failed, the prompt went in unchanged");
    $.ui.log(`capture failed (${cause(next.error)}); the prompt was not changed`);
    return next(e);
  });
}
