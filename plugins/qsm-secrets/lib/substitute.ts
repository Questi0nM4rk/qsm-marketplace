// The command a hook runs in place of one that names a stored secret by id. Pure and import-free,
// because hooks/register.tsx imports it inside the engine sandbox.

/** Where captured pastes are stored, apart from the keys a person set. */
export const CAPTURE_NAMESPACE = "capture";

// A placeholder is `{{secret:<id>}}`, and for a long secret the last four characters follow as `…abcd`.
const PLACEHOLDER = /\{\{secret:(\w+)\}\}(?:…[\w-]{4})?/g;

/** Each distinct id a text holds a placeholder for, in order of appearance. */
export function placeholderIds(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1] as string))];
}

export interface Substitution {
  /** The command to run; the input unchanged when it names no id. */
  readonly command: string;
  /** Each distinct id the command names, in order of appearance. */
  readonly ids: string[];
}

const variableOf = (id: string): string => `QSM_SECRET_${id.toUpperCase()}`;

const quoted = (text: string): string => `'${text.replaceAll("'", "'\\''")}'`;

/**
 * `qsm-secrets env <id>=QSM_SECRET_<ID> --folder capture -- sh -c '<command>'`, one `env` per id, so
 * the value reaches that one command through its environment and is never in the command text.
 */
export function substitute(command: string): Substitution {
  const ids = placeholderIds(command);
  if (ids.length === 0) {
    return { command, ids };
  }
  const body = command.replace(PLACEHOLDER, (_, id: string) => `"$${variableOf(id)}"`);
  const envs = ids.map(
    (id) => `qsm-secrets env ${id}=${variableOf(id)} --folder ${CAPTURE_NAMESPACE} --`,
  );
  return { command: `${envs.join(" ")} sh -c ${quoted(body)}`, ids };
}
