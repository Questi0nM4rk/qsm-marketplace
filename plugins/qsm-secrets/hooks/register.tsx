// qsm-secrets' function-hooks module: the noun, `$.secrets`, one method per verb, and the guard that
// refuses a Bash command that would print a stored credential into the tool result (the decision is
// `qsm-secrets guard`, which reads the command's syntax tree and needs the WASM parser this sandbox
// cannot load), a Read or Grep of the files that hold credentials, and the capture of a pasted secret
// before the prompt enters the session (the decision is `qsm-secrets capture`), and the use of a
// captured id: replaced in the command by substitute, masked in the result by `qsm-secrets mask`.
import type { ApiContentBlock, On, SessionAppendInput } from "claude-code";
import { type PathEnv, protectedRoots, reaches } from "../lib/protected.ts";
import { substitute } from "../lib/substitute.ts";
import { argvOf, registerNoun, unwrap, type VerbRow, verbs } from "./noun.generated.ts";

// The guard runs before every Bash call, so a parse that hangs must not hold the call for long.
const GUARD_TIMEOUT_MS = 5000;

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

/** What `qsm-secrets guard` said: the reason to deny with, or null when the command may run. A verb
 * that did not answer is an error, and the hook's catch denies the call. */
function refusalOf(ran: { exitCode: number; stdout: string; stderr: string }): string | null {
  if (!isEnvelope(ran.stdout)) {
    const stderr = ran.stderr.trim().slice(0, 300);
    throw new Error(
      `qsm-secrets guard printed no outcome envelope (exit ${ran.exitCode}): ${stderr.length > 0 ? stderr : "no stderr"}`,
    );
  }
  const envelope = JSON.parse(ran.stdout) as {
    code: string;
    message?: string;
    data?: { reason?: string };
  };
  if (envelope.code === "ok") {
    return null;
  }
  if (envelope.code === "blocked" && typeof envelope.data?.reason === "string") {
    return envelope.data.reason;
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
    const argv = argvOf(verbs.guard as VerbRow);
    const ran = await $.process.run(argv, { stdin: e.command, timeoutMs: GUARD_TIMEOUT_MS });
    const reason = refusalOf(ran);
    if (reason === null) {
      return next(e);
    }
    $.ui.log(`refused a Bash command: ${reason.slice(0, 80)}`);
    return { deny: reason };
  }).catch(($, e, next) => {
    const reason = cause(next.error);
    $.ui.toast(`qsm-secrets ERROR: tool.call: ${reason}`);
    if (RECOVERY.test((e as { command?: string }).command ?? "")) {
      $.ui.log(`the credential guard failed (${reason}); a recovery command was let through`);
      return next(e);
    }
    $.ui.log(`the credential guard failed (${reason}); the call was denied`);
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
    { tool: "Grep" as "Read", ancestors: true, globs: false },
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
      const reason = cause(next.error);
      $.ui.toast(`qsm-secrets ERROR: tool.call: ${reason}`);
      $.ui.log(`the file guard failed (${reason}); the call was denied`);
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
        failed.push(cause({ kind: "failed", message: String((error as Error).message) }));
      }
    }
    if (failed.length > 0) {
      $.ui.toast("qsm-secrets ERROR: session.end: the cleanup or the scrub did not finish");
      $.ui.log(`the session-end cleanup failed (${failed.join("; ")}); the session ended`);
    }
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
  registerGuard(on);
  registerFileGuard(on);
  registerSubstitution(on);
  registerMask(on);
  registerScrub(on);

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
      taken: string[];
    };
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
    const reason = cause(next.error);
    $.ui.toast("qsm-secrets ERROR: prompt.submit: capture failed, the prompt was not sent");
    $.ui.log(`capture failed (${reason}); the prompt was dropped`);
    return next.called
      ? next(e)
      : {
          drop: `qsm-secrets: capture failed (${reason}); the prompt was not sent. Fix the cause (qsm-secrets doctor names it), then send the prompt again`,
        };
  });
}
