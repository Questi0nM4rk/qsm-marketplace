// What the vault's own fields mean to this wrapper: which folder a call works in, which entries are
// ours, and the one value shape a verb still has to read (`<key>=<ENVVAR>`).

/** The rbw folder a call reads and writes when the caller names none. */
export const DEFAULT_NAMESPACE = "qsm";

/** rbw's username field on every entry this wrapper stored. */
export const WRAPPER_MARK = "qsm-secrets";

/** The folder this call works in: `--folder` first, then the environment, then the default. */
export function namespaceOf(
  folder: string | undefined,
  env: Record<string, string | undefined>,
): string {
  return folder ?? env.QSM_SECRETS_FOLDER ?? DEFAULT_NAMESPACE;
}

export interface EnvPair {
  readonly key: string;
  readonly variable: string;
}

const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Splits `env`'s one word, `<key>=<ENVVAR>`. Null when it is not that
 * shape. The caller turns that into a usage error naming the form. */
export function parseEnvPair(word: string): EnvPair | null {
  const at = word.indexOf("=");
  if (at <= 0) {
    return null;
  }
  const key = word.slice(0, at);
  const variable = word.slice(at + 1);
  if (!VARIABLE_NAME.test(variable)) {
    return null;
  }
  return { key, variable };
}
