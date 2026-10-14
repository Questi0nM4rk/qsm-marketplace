// The command a hook runs in place of one that names a stored secret by id. Pure and import-free,
// because hooks/register.tsx imports it inside the engine sandbox.

/** Where captured pastes are stored, apart from the keys a person set. */
export const CAPTURE_NAMESPACE = "capture";

// A placeholder is `{{secret:<id>}}` or, for a key the person named, `{{secret:<namespace>/<key>}}`;
// for a long secret the last four characters follow as `…abcd`.
const PLACEHOLDER = /\{\{secret:((?:[\w-]+\/)?[\w-]+)\}\}(?:…[\w-]{4})?/g;

/** Each distinct id a text holds a placeholder for, in order of appearance. */
export function placeholderIds(text: string): string[] {
  return [
    ...new Set([...text.matchAll(PLACEHOLDER)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))),
  ];
}

export interface Substitution {
  /** The command to run; the input unchanged when it names no id. */
  readonly command: string;
  /** Each distinct id the command names, in order of appearance. */
  readonly ids: string[];
}

const variableOf = (id: string): string =>
  `QSM_SECRET_${id.toUpperCase().replaceAll(/[^A-Z0-9]/g, "_")}`;

/** The namespace and key an id stands for: `<namespace>/<key>` as written, else a captured paste. */
export function locate(id: string): { namespace: string; key: string } {
  const slash = id.indexOf("/");
  return slash === -1
    ? { namespace: CAPTURE_NAMESPACE, key: id }
    : { namespace: id.slice(0, slash), key: id.slice(slash + 1) };
}

const quoted = (text: string): string => `'${text.replaceAll("'", "'\\''")}'`;

/**
 * `qsm-secrets env <key>=QSM_SECRET_<ID> --folder <namespace> -- sh -c '<command>'`, one `env` per id, so
 * the value reaches that one command through its environment and is never in the command text.
 */
export function substitute(command: string): Substitution {
  const ids = placeholderIds(command);
  if (ids.length === 0) {
    return { command, ids };
  }
  const owners = new Map<string, string>();
  for (const id of ids) {
    const taken = owners.get(variableOf(id));
    if (taken !== undefined) {
      throw new Error(`${taken} and ${id} would share ${variableOf(id)}; rename one of them`);
    }
    owners.set(variableOf(id), id);
  }
  const body = command.replace(PLACEHOLDER, (_, id: string) => `"$${variableOf(id)}"`);
  const envs = ids.map((id) => {
    const { namespace, key } = locate(id);
    return `qsm-secrets env ${key}=${variableOf(id)} --folder ${namespace} --`;
  });
  return { command: `${envs.join(" ")} sh -c ${quoted(body)}`, ids };
}
