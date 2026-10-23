// Whether a Bash command only removes things inside this session's scratchpad, so it may run without
// a permission prompt. A function of the command line and the session id alone: anything it cannot
// read for certain is left to the normal permission decision.

/** The words that remove. */
const REMOVERS: ReadonlySet<string> = new Set(["rm", "rmdir"]);

/** Anything the shell would expand, chain, quote or redirect: the line is not read for certain. */
const SHELL_SYNTAX = /[;&|<>`$(){}\\'"\n~]/;

/** A `.` or `..` segment anywhere in a path. */
const DOT_SEGMENT = /(?:^|\/)\.{1,2}(?:\/|$)/;

/** The session id as the scratchpad path names it: the transcript file's name, a UUID. */
const SESSION_ID = /^[\w-]+$/;

/** Inside this session's scratchpad, /tmp/claude-<uid>/<project>/<session id>/scratchpad/, with a
 * glob only in the last segment, so what the shell expands it to stays inside. */
function scratchpadPattern(sessionId: string): RegExp {
  return new RegExp(`^/tmp/claude-\\d+/[^/]+/${sessionId}/scratchpad/(?:[^/*?[]+/)*[^/]+$`);
}

/** True when the line is one rm or rmdir whose every target is inside the session's scratchpad. */
export function removesOnlyScratchpad(call: { command: string; sessionId: string }): boolean {
  const { command, sessionId } = call;
  if (!SESSION_ID.test(sessionId) || SHELL_SYNTAX.test(command)) {
    return false;
  }
  const [verb, ...words] = command.match(/\S+/g) ?? [];
  if (verb === undefined || !REMOVERS.has(verb)) {
    return false;
  }
  // After `--` every word is a target, a `-name` file included.
  const end = words.indexOf("--");
  const targets =
    end === -1
      ? words.filter((word) => !word.startsWith("-"))
      : [...words.slice(0, end).filter((word) => !word.startsWith("-")), ...words.slice(end + 1)];
  const inside = scratchpadPattern(sessionId);
  return (
    targets.length > 0 &&
    targets.every((target) => inside.test(target) && !DOT_SEGMENT.test(target))
  );
}
