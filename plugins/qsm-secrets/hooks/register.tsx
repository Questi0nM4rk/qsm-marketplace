// qsm-secrets' function-hooks module: the noun, `$.secrets`, one method per verb, and the guard that
// refuses a Bash command that would print a stored credential into the tool result (the decision is
// `qsm-secrets guard`, which reads the command's syntax tree with the WASM parser compiled into the
// binary, because this sandbox cannot load it), a Read or Grep of the files that hold credentials, and the capture of a pasted secret
// before the prompt enters the session (the decision is `qsm-secrets capture`), and the use of a
// captured id: replaced in the command by substitute, masked in the result by `qsm-secrets mask`.
import type { ApiContentBlock, EngineInterface, On, SessionAppendInput } from "claude-code";
import { type PathEnv, protectedRoots, reaches } from "../lib/protected.ts";
import { MIN_MASKED, mapStrings } from "../lib/masking.ts";
import { locate, substitute } from "../lib/substitute.ts";
import { argvOf, failure, registerNoun, unwrap, type VerbRow, verbs } from "./noun.generated.ts";

// The guard runs before every Bash call, so a parse that hangs must not hold the call for long.
const GUARD_TIMEOUT_MS = 5000;

// A backend that wants an unlock prompt must not hold the prompt for long.
const CAPTURE_TIMEOUT_MS = 10_000;
// Where the hooks run the bin: it reads stdin only, and the session's directory can be gone (a
// removed worktree), which fails every spawn with ENOENT and withholds every row of the chat.
const RUN_DIR = "/";

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
  readonly captured: readonly { readonly id: string; readonly kind: string }[];
  readonly taken: string[];
}

const isMaskData = (value: unknown): value is MaskData => isRecord(value) && isStrings(value.texts);

const isCaptureData = (value: unknown): value is CaptureData =>
  isRecord(value) &&
  typeof value.text === "string" &&
  Array.isArray(value.captured) &&
  value.captured.every(
    (item: unknown) =>
      isRecord(item) && typeof item.id === "string" && typeof item.kind === "string",
  ) &&
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
    const ran = await $.process.run(argv, {
      stdin: e.command,
      timeoutMs: GUARD_TIMEOUT_MS,
      cwd: RUN_DIR,
    });
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

/**
 * Masks every text a walk visits through one `qsm-secrets mask --all`, by running the walk twice:
 * once to read the texts, once to put the masked ones back in the same order. Undefined when the
 * mask changed nothing, so the caller keeps what it had.
 */
async function maskWalk<T>(
  $: EngineInterface,
  walk: (map: (text: string) => string) => T,
): Promise<T | undefined> {
  const texts: string[] = [];
  walk((text) => {
    texts.push(text);
    return text;
  });
  // A text shorter than the shortest masked value cannot hold one.
  if (texts.every((text) => text.length < MIN_MASKED)) {
    return undefined;
  }
  const argv = argvOf(verbOf("mask"), { all: true });
  const ran = await $.process.run(argv, {
    stdin: JSON.stringify(texts),
    timeoutMs: CAPTURE_TIMEOUT_MS,
    cwd: RUN_DIR,
  });
  const done = [...dataOf(argv, ran, isMaskData).texts];
  if (done.length !== texts.length) {
    throw new Error(`the mask returned ${done.length} texts for ${texts.length}`);
  }
  if (done.every((text, i) => text === texts[i])) {
    return undefined;
  }
  return walk(() => done.shift() ?? "");
}

/** A tool's own record is stored in the transcript as made, beside the row the session.append hook
 * masks, so the record is masked here, before the engine keeps it. */
function registerResultMask(on: On): void {
  on("tool.call", async ($, e, next) => {
    const out = await next(e);
    // A refusal quotes only the input the model wrote, so it holds no value the model has not
    // already sent.
    if (out.deny !== undefined) {
      return out;
    }
    if (out.isError === true) {
      // An errored call is kept as its error text in `result`, and `text` is what the model reads.
      // A hook cannot answer an error, because the engine checks its result against the tool's
      // output shape, so a masked error comes back as a refusal that carries the masked text.
      const masked = await maskWalk($, (map) => ({
        text: map(out.text ?? ""),
        result: mapStrings(out.result, map),
      }));
      if (masked === undefined) {
        return out;
      }
      const result = typeof masked.result === "string" ? masked.result : "";
      return { deny: masked.text === "" ? result : masked.text };
    }
    // The context other hooks added is passed on whole, because the engine refuses a hook that
    // rewrites an entry its next gave.
    const result = await maskWalk($, (map) => mapStrings(out.result, map));
    return result === undefined ? out : { result, context: out.context };
  }).catch(($, _e, next) => {
    // Fails closed: a record that could not be masked may hold a value, so it is withheld.
    failure($, "tool.call", next.error, "a tool result could not be masked and was withheld");
    $.ui.log("the result mask failed; the tool result was withheld");
    return { deny: withheld(cause(next.error)) };
  });
}

/** Every row the conversation keeps passes through one mask before it is stored. A tool's result is
 * made from the record the tool.call hook already masked, so its row is not masked twice. */
function registerMask(on: On): void {
  on("session.append", async ($, e, next) => {
    if (e.door === "tool-result") {
      return next(e);
    }
    const content = await maskWalk($, (map) => mapTexts(e.message.content, map));
    return next(content === undefined ? e : rewritten(e, content));
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
            // differs: hooks sandbox, root lib's messageOf
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

const REVIEW_PANE = "qsm-secrets-review";

/** One row of `qsm-secrets captures --json`. */
interface Listed {
  readonly namespace: string;
  readonly key: string;
  readonly kind: string;
  readonly capturedAt: string;
  readonly session: string | null;
  readonly cwd: string | null;
}

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const isListed = (value: unknown): value is Listed =>
  isRecord(value) &&
  typeof value.namespace === "string" &&
  typeof value.key === "string" &&
  typeof value.kind === "string" &&
  typeof value.capturedAt === "string" &&
  isNullableString(value.session) &&
  isNullableString(value.cwd);

const isCapturesData = (value: unknown): value is { rows: Listed[] } =>
  isRecord(value) && Array.isArray(value.rows) && value.rows.every(isListed);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number): string => String(n).padStart(2, "0");

/** `31 Oct 14:02` in the local time this sandbox knows; the stored text when it is no date. */
function localTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return iso;
  }
  return `${at.getDate()} ${MONTHS[at.getMonth()] ?? "?"} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** The delete outcomes of this module's life, by id: a failed row keeps its code until it goes. */
const failedDeletes = new Map<string, string>();

/** The body rows the pane last had, so a list handed back after a delete fits the same room. */
let paneRoom = 0;

/** The rows the review list shows: kind, local time, the cwd's last segment, the session's first
 * eight characters; never a value. */
function reviewRows(
  listed: readonly Listed[],
): { id: string; label: string; failed: string | null }[] {
  const width = Math.max(0, ...listed.map((row) => row.kind.length));
  return listed.map((row) => {
    const id = `${row.namespace}/${row.key}`;
    const project =
      row.cwd === null ? "-" : (row.cwd.split("/").findLast((part) => part !== "") ?? "/");
    const label = [
      row.kind.padEnd(width),
      localTime(row.capturedAt).padEnd(12),
      project,
      row.session === null ? "-" : row.session.slice(0, 8),
    ].join("  ");
    return { id, label, failed: failedDeletes.get(id) ?? null };
  });
}

/** What the pane lists: `qsm-secrets captures`, the one reader of the index. */
async function listCaptures($: EngineInterface): Promise<Listed[]> {
  const argv = argvOf(verbOf("captures"));
  const ran = await $.process.run(argv, { timeoutMs: CAPTURE_TIMEOUT_MS, cwd: RUN_DIR });
  return dataOf(argv, ran, isCapturesData).rows;
}

/** `qsm-secrets rm` for one capture; its outcome code, `ok` when the entry and its row are gone. */
async function removeCapture($: EngineInterface, id: string): Promise<string> {
  const { namespace, key } = locate(id);
  const argv = argvOf(verbOf("rm"), { key, folder: namespace });
  const ran = await $.process.run(argv, { timeoutMs: CAPTURE_TIMEOUT_MS, cwd: RUN_DIR });
  const envelope = envelopeOf(ran.stdout);
  if (envelope === undefined) {
    throw new Error(`qsm-secrets rm printed no outcome envelope (exit ${ran.exitCode})`);
  }
  return envelope.code;
}

/** The id a review list's post asks to delete, or undefined when the post is not that shape. */
const deleteRequestOf = (data: unknown): string | undefined =>
  isRecord(data) && typeof data.delete === "string" ? data.delete : undefined;

/**
 * `/qsm-secrets review`: a pane listing what the capture stored, where `d` or DEL then `y` deletes
 * one from the vault. The list is a `Client` (review.tsx); this module reads `qsm-secrets captures`
 * and deletes through `qsm-secrets rm`, so a shell and the pane run the same verbs.
 */
function registerReview(on: On): void {
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "qsm-secrets",
      description: "Review what the capture stored and delete an entry: /qsm-secrets review",
      argumentHint: "review",
    });
    return next(e);
  }).catch(($, e, next) => {
    failure($, "session.start", next.error);
    return next(e);
  });

  on("command.run", { command: "qsm-secrets" }, async ($, e) => {
    if (e.args.trim() !== "review") {
      return { text: "qsm-secrets: the command takes one word, review: /qsm-secrets review" };
    }
    await $.ui.open({ id: REVIEW_PANE, title: "qsm-secrets review", focus: true });
    return {};
  }).catch(($, _e, next) => {
    const reason = failure($, "command.run", next.error);
    return { text: `qsm-secrets: the review pane did not open (${reason.slice(0, 200)})` };
  });

  on("ui.render", { component: "Pane", requestId: REVIEW_PANE }, async ($, e) => {
    const elements = $.ui.resolve(e);
    const rows = reviewRows(await listCaptures($));
    paneRoom = e.props.scroll.bodyRows;
    if (!("Client" in elements)) {
      const { Text } = elements;
      return <Text>The review list needs the terminal or the desktop app.</Text>;
    }
    const { Client } = elements;
    return <Client key="review" module="./review.tsx" props={{ rows, room: paneRoom }} />;
  }).catch(($, e, next) => {
    const reason = failure($, "ui.render", next.error);
    const { Text } = $.ui.resolve(e);
    return <Text>{`qsm-secrets: the captures could not be listed (${reason.slice(0, 300)})`}</Text>;
  });

  on("ui.message", { requestId: REVIEW_PANE }, async ($, e) => {
    const id = deleteRequestOf(e.data);
    const listed = await listCaptures($);
    // The post is code's word, not a fact: only an id the list holds is deleted.
    if (id === undefined || !listed.some((row) => `${row.namespace}/${row.key}` === id)) {
      $.ui.log(`the review list asked for a delete of no listed capture; nothing was deleted`);
      return { props: { rows: reviewRows(listed), room: paneRoom } };
    }
    const code = await removeCapture($, id);
    if (code === "ok") {
      failedDeletes.delete(id);
    } else {
      failedDeletes.set(id, code);
      $.ui.toast(`qsm-secrets: could not delete ${id}: ${code}`);
    }
    return { props: { rows: reviewRows(await listCaptures($)), room: paneRoom } };
  }).catch(($, _e, next) => {
    failure($, "ui.message", next.error);
    return {};
  });
}

export function register(on: On): void {
  // Adds $.secrets: one method per qsm-secrets verb, generated by lib/generate-noun.ts. Never
  // hand-edit noun.generated.ts or types/index.d.ts.
  registerNoun(on);
  registerGuard(on);
  registerFileGuard(on);
  registerSubstitution(on);
  registerResultMask(on);
  registerMask(on);
  registerScrub(on);
  registerReview(on);

  on("prompt.submit", async ($, e, next) => {
    if (!PERSON_ORIGINS.has(e.origin.kind)) {
      $.ui.log(`a ${e.origin.kind} prompt is not the person's own; it was not captured`, {
        to: "debug",
      });
      return next(e);
    }
    const [session, cwd] = await Promise.all([$.session.id(), $.session.cwd()]);
    const argv = argvOf(verbOf("capture"), { session, cwd });
    const ran = await $.process.run(argv, {
      stdin: e.text,
      timeoutMs: CAPTURE_TIMEOUT_MS,
      cwd: RUN_DIR,
    });
    const done = dataOf(argv, ran, isCaptureData);
    if (done.captured.length === 0) {
      return next(e);
    }
    const ids = done.captured.map((c) => `${c.id} (${c.kind})`).join(", ");
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
