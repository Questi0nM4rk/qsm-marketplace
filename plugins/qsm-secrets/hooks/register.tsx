// qsm-secrets' function-hooks module: the noun, `$.secrets`, one method per verb, and the guard that
// refuses a Bash command that would print a stored credential into the tool result (the decision is
// `qsm-secrets guard`, which reads the command's syntax tree with the WASM parser compiled into the
// binary, because this sandbox cannot load it), a Read or Grep of the files that hold credentials, and the capture of a pasted secret
// before the prompt enters the session (the decision is `qsm-secrets capture`), and the use of a
// captured id: replaced in the command by substitute, masked in the result by `qsm-secrets mask`.
import type { ApiContentBlock, On, SessionAppendInput } from "claude-code";
import { type PathEnv, protectedRoots, reaches } from "../lib/protected.ts";
import { substitute } from "../lib/substitute.ts";
import { argvOf, failure, registerNoun, unwrap, type VerbRow, verbs } from "./noun.generated.ts";

// The guard runs before every Bash call, so a parse that hangs must not hold the call for long.
const GUARD_TIMEOUT_MS = 5000;

// A backend that wants an unlock prompt must not hold the prompt for long.
const CAPTURE_TIMEOUT_MS = 10_000;

// What a person typed or pasted: the terminal, the remote bridge, the SDK host, a channel's human. Every
// other origin is text the engine, another session or a model wrote (a task notification, a subagent
// hand-back, a schedule): it holds ids and paths that look like tokens, and a capture would replace them.
const PERSON_ORIGINS: ReadonlySet<string> = new Set(["composer", "bridge", "sdk", "channel"]);

/** What a failed hook says about itself in the log: the kind and the message, which names the verb,
 * the exit code, the outcome code or stderr; never a stdout, which may hold the prompt. */
function cause(error: { readonly kind: string; readonly message?: string }): string {
  return `${error.kind}: ${(error.message ?? "no message").slice(0, 400)}`;
}

// differs: hooks sandbox, which imports no root lib
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item: unknown) => typeof item === "string");

const isBlocks = (value: unknown): value is ApiContentBlock[] =>
  Array.isArray(value) &&
  value.every((item: unknown) => isRecord(item) && typeof item.type === "string");

interface MaskData {
  readonly texts: string[];
}

interface CaptureData {
  readonly text: string;
  readonly captured: readonly { readonly id: string }[];
  readonly taken: string[];
}

const isMaskData = (value: unknown): value is MaskData => isRecord(value) && isStrings(value.texts);

const isCaptureData = (value: unknown): value is CaptureData =>
  isRecord(value) &&
  typeof value.text === "string" &&
  Array.isArray(value.captured) &&
  value.captured.every((item: unknown) => isRecord(item) && typeof item.id === "string") &&
  isStrings(value.taken);

interface Envelope {
  readonly code: string;
  readonly message: string | undefined;
  readonly reason: string | undefined;
}

/** The outcome envelope a binary printed on stdout, or undefined when stdout is not one. */
function envelopeOf(stdout: string): Envelope | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || typeof parsed.exit !== "number" || typeof parsed.code !== "string") {
    return undefined;
  }
  return {
    code: parsed.code,
    message: typeof parsed.message === "string" ? parsed.message : undefined,
    reason:
      isRecord(parsed.data) && typeof parsed.data.reason === "string"
        ? parsed.data.reason
        : undefined,
  };
}

/** A verb's data from a `process.run` result, checked by `isData`. unwrap quotes a stdout that is no
 * envelope, which for capture and mask can be the prompt or the result, so that case is rebuilt from
 * exit code and stderr. */
function dataOf<T>(
  argv: string[],
  ran: { exitCode: number; stdout: string; stderr: string },
  isData: (value: unknown) => value is T,
): T {
  if (envelopeOf(ran.stdout) === undefined) {
    const stderr = ran.stderr.trim().slice(0, 300);
    throw new Error(
      `${argv.slice(0, 2).join(" ")} printed no outcome envelope (exit ${ran.exitCode}): ${stderr.length > 0 ? stderr : "no stderr"}`,
    );
  }
  const data = unwrap(argv, ran);
  if (!isData(data)) {
    throw new Error(`${argv.slice(0, 2).join(" ")} answered data of an unexpected shape`);
  }
  return data;
}

/** The row of a verb the noun was generated with. */
function verbOf(name: string): VerbRow {
  const row = verbs[name];
  if (row === undefined) {
    throw new Error(`qsm.json has no verb ${name}`);
  }
  return row;
}

/** What `qsm-secrets guard` said: the reason to deny with, or null when the command may run. A verb
 * that did not answer is an error, and the hook's catch denies the call. */
function refusalOf(ran: { exitCode: number; stdout: string; stderr: string }): string | null {
  const envelope = envelopeOf(ran.stdout);
  if (envelope === undefined) {
    const stderr = ran.stderr.trim().slice(0, 300);
    throw new Error(
      `qsm-secrets guard printed no outcome envelope (exit ${ran.exitCode}): ${stderr.length > 0 ? stderr : "no stderr"}`,
    );
  }
  if (envelope.code === "ok") {
    return null;
  }
  if (envelope.code === "blocked" && envelope.reason !== undefined) {
    return envelope.reason;
  }
  throw new Error(
    `qsm-secrets guard answered ${envelope.code}: ${(envelope.message ?? "").slice(0, 200)}`,
  );
}

// The one command a broken guard lets through, so the cause can be read: it changes nothing and
// reads no value. Reinstalling is the person's step in their own terminal, never the agent's: an
// allowed path to an install script is a path the agent could write its own script to.
const RECOVERY = /^\s*qsm-secrets doctor\s*$/;

/** The guard runs first, on the command as written, so it sees a placeholder before the substitution
 * rewrites it. */
function registerGuard(on: On): void {
  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    const argv = argvOf(verbOf("guard"));
    const ran = await $.process.run(argv, { stdin: e.command, timeoutMs: GUARD_TIMEOUT_MS });
    const reason = refusalOf(ran);
    if (reason === null) {
      return next(e);
    }
    $.ui.log(`refused a Bash command: ${reason.slice(0, 80)}`);
    return { deny: reason };
  }).catch(($, e, next) => {
    failure($, "tool.call", next.error);
    const reason = cause(next.error);
    if (RECOVERY.test((e as { command?: string }).command ?? "")) {
      $.ui.log("the credential guard failed; a recovery command was let through");
      return next(e);
    }
    $.ui.log("the credential guard failed; the call was denied");
    return { deny: `qsm-secrets: the credential guard failed (${reason}); the call was not run` };
  });
}

/** Read and Grep put a file's lines into the tool result as surely as `cat` does, and a Glob names
 * the files of the store. A Grep also walks everything under its path, so a path above a
 * protected directory is refused too; a Glob lists names only, like `ls`, so only a path inside one is. */
function registerFileGuard(on: On): void {
  // The shipped types list no Grep or Glob (a build without the tool has nothing to guard), so their
  // names are cast; a build that has the tool routes its calls here.
  const guarded = [
    { tool: "Read" as const, ancestors: false, globs: false },
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the engine's declared tool names list no Grep
    { tool: "Grep" as "Read", ancestors: true, globs: false },
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the engine's declared tool names list no Glob
    { tool: "Glob" as "Read", ancestors: false, globs: true },
  ];
  for (const { tool, ancestors, globs } of guarded) {
    on("tool.call", { tool }, async ($, e, next) => {
      const input = e as { file_path?: string; path?: string; pattern?: string };
      // A Grep or a Glob with no path searches the working directory, so that is its path.
      const target =
        input.file_path ?? input.path ?? (ancestors || globs ? await $.session.cwd() : undefined);
      if (target === undefined) {
        return next(e);
      }
      const [home, dataHome, runtimeDir, passwordStore] = await Promise.all([
        $.env.get("HOME"),
        $.env.get("XDG_DATA_HOME"),
        $.env.get("XDG_RUNTIME_DIR"),
        $.env.get("PASSWORD_STORE_DIR"),
      ]);
      const env: PathEnv = { home, dataHome, runtimeDir, passwordStore };
      const roots = protectedRoots(env);
      let real: string | undefined;
      try {
        real = (await $.fs.stat(target, { resolve: true })).realPath;
      } catch {
        // a path that is not there is judged by its spelling
      }
      // A Glob's own pattern may start at a protected directory (`~/.password-store/**`): its part
      // before the first wildcard is a path too.
      const written = globs ? input.pattern?.split(/[*?[{]/)[0] : undefined;
      const lead =
        written !== undefined && written !== "" && !/^[/~$]/.test(written)
          ? `${target}/${written}`
          : written;
      const spellings = [target, real, lead].filter(
        (path): path is string => path !== undefined && path !== "",
      );
      if (!spellings.some((path) => reaches(path, roots, env, ancestors) !== undefined)) {
        return next(e);
      }
      $.ui.log(`refused a ${tool} of ${target}`);
      return {
        deny: `[qsm-secrets keyring-files] ${tool} of ${target} would put stored credentials, or the names of the store's files, in this tool result. Use \`qsm-secrets pipe <key> -- <cmd>\` or \`qsm-secrets env <key>=<VAR> -- <cmd>\`; for a rendered config, read its template, which holds placeholders.`,
      };
    }).catch(($, _e, next) => {
      failure($, "tool.call", next.error);
      const reason = cause(next.error);
      $.ui.log("the file guard failed; the call was denied");
      return { deny: `qsm-secrets: the file guard failed (${reason}); the call was not run` };
    });
  }
}

/** A command naming an id runs with the value in its environment; its result is masked on the way
 * into the conversation, by the session.append hook. */
function registerSubstitution(on: On): void {
  on("tool.call", { tool: "Bash" }, (_$, e, next) => {
    const { command, ids } = substitute(e.command);
    return ids.length === 0 ? next(e) : next({ ...e, command });
  }).catch(($, _e, next) => {
    failure($, "tool.call", next.error, next.error.kind);
    $.ui.log("the id substitution failed; the call was denied");
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
    if (block.type === "tool_result" && isBlocks(block.content)) {
      return { ...block, content: block.content.map(mapBlock) };
    }
    return block;
  };
  return content.map(mapBlock);
}

function withheld(reason: string): string {
  return `qsm-secrets: this text could not be masked and was withheld (${reason.slice(0, 300)})`;
}

function rewritten(e: SessionAppendInput, content: ApiContentBlock[]): SessionAppendInput {
  return { ...e, message: { ...e.message, content } };
}

/** Every row the conversation keeps, whatever its door, passes through one mask before it is stored. */
function registerMask(on: On): void {
  on("session.append", async ($, e, next) => {
    const texts: string[] = [];
    mapTexts(e.message.content, (text) => {
      texts.push(text);
      return text;
    });
    if (texts.every((text) => text === "")) {
      return next(e);
    }
    const argv = argvOf(verbOf("mask"), { all: true });
    const ran = await $.process.run(argv, {
      stdin: JSON.stringify(texts),
      timeoutMs: CAPTURE_TIMEOUT_MS,
    });
    const done = [...dataOf(argv, ran, isMaskData).texts];
    if (done.length !== texts.length) {
      throw new Error(`the mask returned ${done.length} texts for ${texts.length}`);
    }

    return next(
      rewritten(
        e,
        mapTexts(e.message.content, () => {
          const text = done.shift();
          if (text === undefined) {
            throw new Error("the mask returned too few texts");
          }
          return text;
        }),
      ),
    );
  }).catch(($, e, next) => {
    // Fails closed: a row that could not be masked may hold a value, so its text is replaced.
    failure($, "session.append", next.error, "a row could not be masked and was withheld");
    $.ui.log("the mask failed; the row's text was withheld");
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
    // The scrub first: a failed clean must not leave the transcript holding a pasted value. A failed
    // scrub must not leave the rendered files behind either, so each step runs and reports alone.
    const failed: string[] = [];
    for (const step of [
      () => $.secrets.scrub({ transcript: session, detach: true }),
      () => $.secrets.clean({ session }),
    ]) {
      try {
        await step();
      } catch (error) {
        failed.push(
          cause({
            kind: "failed",
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
    if (failed.length > 0) {
      throw new Error(failed.join("; "));
    }
    return next(e);
  }).catch(($, e, next) => {
    failure($, "session.end", next.error, "the cleanup or the scrub did not finish");
    $.ui.log("the session-end cleanup failed; the session ended");
    return next(e);
  });
}

export function register(on: On): void {
  // Adds $.secrets: one method per qsm-secrets verb, generated by lib/generate-noun.ts. Never
  // hand-edit noun.generated.ts or types/index.d.ts.
  registerNoun(on);
  registerGuard(on);
  registerFileGuard(on);
  registerSubstitution(on);
  registerMask(on);
  registerScrub(on);

  on("prompt.submit", async ($, e, next) => {
    if (!PERSON_ORIGINS.has(e.origin.kind)) {
      $.ui.log(`a ${e.origin.kind} prompt is not the person's own; it was not captured`);
      return next(e);
    }
    const argv = argvOf(verbOf("capture"));
    const ran = await $.process.run(argv, { stdin: e.text, timeoutMs: CAPTURE_TIMEOUT_MS });
    const done = dataOf(argv, ran, isCaptureData);
    if (done.captured.length === 0) {
      return next(e);
    }
    const ids = done.captured.map((c) => c.id).join(", ");
    const why = done.taken.map((name) => `; ${name} is already stored, so it got a generated id`);
    $.ui.toast(`qsm-secrets: captured ${done.captured.length} secret(s) as ${ids}${why.join("")}`);
    return next({ ...e, text: done.text });
  }).catch(($, e, next) => {
    // Fails closed: a prompt that could not be checked may hold a value, so it is not sent. The
    // log names the cause, never the text.
    failure($, "prompt.submit", next.error, "capture failed, the prompt was not sent");
    const reason = cause(next.error);
    $.ui.log("capture failed; the prompt was dropped");
    return next.called
      ? next(e)
      : {
          drop: `qsm-secrets: capture failed (${reason}); the prompt was not sent. Fix the cause (qsm-secrets doctor names it), then send the prompt again`,
        };
  });
}
