// The places a stored credential lives on disk, as a pure function of the environment. Import-free,
// because hooks/register.tsx imports it inside the engine sandbox and the guard verb imports it too.

export interface PathEnv {
  readonly home?: string | undefined;
  /** `XDG_DATA_HOME` */
  readonly dataHome?: string | undefined;
  /** `XDG_RUNTIME_DIR` */
  readonly runtimeDir?: string | undefined;
  /** `PASSWORD_STORE_DIR`, where `pass` keeps its gpg files when that is not `~/.password-store` */
  readonly passwordStore?: string | undefined;
}

export interface Root {
  readonly path: string;
  /** `store` holds credentials themselves; `rendered` holds config files with values filled in,
   * which a command may be handed by path but never read; `askpass` holds the reply sockets of the
   * askpass pane, which no command may name. */
  readonly kind: "store" | "rendered" | "askpass";
}

/** The keyring files, the rbw data directory, the pass store and the rendered config directory. */
export function protectedRoots(env: PathEnv): Root[] {
  const roots: Root[] = [];
  const data = env.dataHome ?? (env.home === undefined ? undefined : `${env.home}/.local/share`);
  if (data !== undefined) {
    roots.push({ path: `${data}/keyrings`, kind: "store" }, { path: `${data}/rbw`, kind: "store" });
  }
  if (env.home !== undefined) {
    roots.push({ path: `${env.home}/.password-store`, kind: "store" });
  }
  if (env.passwordStore !== undefined && env.passwordStore !== "") {
    roots.push({ path: normalizePath(expand(env.passwordStore, env)), kind: "store" });
  }
  if (env.runtimeDir !== undefined && env.runtimeDir !== "") {
    roots.push({ path: `${env.runtimeDir}/qsm-secrets`, kind: "rendered" });
  }
  return roots;
}

/** `~`, `$HOME`, `${HOME}` and the two XDG variables as the shell would expand them; a variable
 * that is not set stays as written. */
export function expand(text: string, env: PathEnv): string {
  let out = env.home === undefined ? text : text.replace(/^~(?=\/|$)/, env.home);
  const variables: [string, string | undefined][] = [
    ["HOME", env.home],
    ["XDG_DATA_HOME", env.dataHome],
    ["XDG_RUNTIME_DIR", env.runtimeDir],
    ["PASSWORD_STORE_DIR", env.passwordStore],
  ];
  for (const [name, value] of variables) {
    if (value !== undefined) {
      out = out
        .replaceAll(`\${${name}}`, value)
        .replaceAll(new RegExp(`\\$${name}\\b`, "g"), value);
    }
  }
  return out;
}

/** `a//b`, `a/./b` and `a/x/../b` folded, so a spelling cannot hide a path. */
export function normalizePath(path: string): string {
  const absolute = path.startsWith("/");
  const kept: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === ".." && kept.length > 0 && kept.at(-1) !== "..") {
      kept.pop();
    } else if (part !== ".." || !absolute) {
      kept.push(part);
    }
  }
  return `${absolute ? "/" : ""}${kept.join("/")}`;
}

/** The root a text mentions, in the spelling it was written or folded. For a word of a command, so a
 * root may sit anywhere in it (`open('<root>/x')` in a `python -c` body). */
export function mentioned(text: string, roots: readonly Root[], env: PathEnv): Root | undefined {
  const spelled = expand(text, env);
  const folded = normalizePath(spelled);
  return roots.find((root) => spelled.includes(root.path) || folded.includes(root.path));
}

/** The root a path lies inside, or, with `ancestors`, the root a search from that path would walk into. */
export function reaches(
  path: string,
  roots: readonly Root[],
  env: PathEnv,
  ancestors: boolean,
): Root | undefined {
  const folded = normalizePath(expand(path, env));
  return roots.find(
    (root) =>
      folded === root.path ||
      folded.startsWith(`${root.path}/`) ||
      (ancestors && (folded === "/" || root.path.startsWith(`${folded}/`))),
  );
}

/** A glob word as a pattern over one path part: `*`, `?` and `[...]` as the shell reads them. */
function partPattern(part: string): RegExp {
  const source = Array.from(part)
    .map((char) => {
      if (char === "*") {
        return "[^/]*";
      }
      if (char === "?") {
        return "[^/]";
      }
      return /[A-Za-z0-9_\-[\]]/.test(char) ? char : `\\${char}`;
    })
    .join("");
  try {
    return new RegExp(`^${source}$`);
  } catch {
    return /^$/;
  }
}

/** The root a glob word could expand to: `~/.local/share/keyr*\/login.keyring` reaches the keyring
 * directory, because each leading part of the pattern may match the root's part at that depth. */
export function globMentioned(
  text: string,
  roots: readonly Root[],
  env: PathEnv,
): Root | undefined {
  if (!/[*?[]/.test(text)) {
    return undefined;
  }
  const parts = normalizePath(expand(text, env)).split("/");
  return roots.find((root) => {
    const rootParts = root.path.split("/");
    return (
      parts.length >= rootParts.length &&
      rootParts.every((rootPart, at) => {
        const part = parts[at];
        return part !== undefined && partPattern(part).test(rootPart);
      })
    );
  });
}
