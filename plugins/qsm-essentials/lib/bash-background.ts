// Whether one Bash call sends a command to the background with `&`: the call returns, its shell
// exits, and the children are orphaned. A function of the command line alone.

const BACKGROUND_DENIAL =
  "qsm-essentials: `&` inside one Bash call is blocked, because the call returns and its children are orphaned. Run the command with run_in_background on the Bash call, or as separate agent calls. For more, load the qsm-essentials:subagents skill.";

/** Quoted text and comments, removed so an `&` inside them is not read as a job. */
function unquoted(command: string): string {
  return command
    .replaceAll(/'[^']*'/g, "''")
    .replaceAll(/"(?:\\.|[^"\\])*"/g, '""')
    .replaceAll(/(^|\s)#[^\n]*/g, "$1");
}

/** A lone `&`: not `&&`, not a redirection such as `2>&1`, `&>` or `>&2`, not `|&`. */
const LONE_AMPERSAND = /(?<![&<>|\\])&(?![&>])/;

/** The denial for a command that backgrounds a job, or null. */
export function backgroundDenial(command: string): string | null {
  return LONE_AMPERSAND.test(unquoted(command)) ? BACKGROUND_DENIAL : null;
}
