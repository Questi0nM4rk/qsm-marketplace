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

/** The variables a path is resolved through; the same set `expand` substitutes and the guard watches. */
export const PATH_VARIABLES: ReadonlySet<string> = new Set([
  "HOME",
  "XDG_DATA_HOME",
  "XDG_RUNTIME_DIR",
  "PASSWORD_STORE_DIR",
]);

/** The path variables of a process environment, as a `PathEnv`. */
export function pathEnvOf(env: Readonly<Record<string, string | undefined>>): PathEnv {
  return {
    home: env.HOME,
    dataHome: env.XDG_DATA_HOME,
    runtimeDir: env.XDG_RUNTIME_DIR,
    passwordStore: env.PASSWORD_STORE_DIR,
  };
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

interface GlobAtom {
  readonly pattern: RegExp;
  readonly repeated: boolean;
}

/** Compile the component spelling into single-character atoms. Only an atom, never its repetition,
 * becomes a regex, so character classes keep their meaning without backtracking over wildcards. */
function partAtoms(part: string): GlobAtom[] | null {
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
  const atoms: GlobAtom[] = [];
  for (let at = 0; at < source.length;) {
    let end = at + 1;
    if (source[at] === "\\") {
      end += 1;
    } else if (source[at] === "[") {
      while (end < source.length && source[end] !== "]") {
        end += source[end] === "\\" ? 2 : 1;
      }
      if (end === source.length) return null;
      end += 1;
    }
    try {
      const pattern = new RegExp(`^(?:${source.slice(at, end)})$`);
      const repeated = source[end] === "*";
      atoms.push({ pattern, repeated });
      at = repeated ? end + 1 : end;
    } catch {
      return null;
    }
  }
  return atoms;
}

/** Each table cell is visited once. A repeated atom consumes nothing or extends its own row by one
 * character, rather than trying every split of the input among the wildcards. */
function matchesGlobPart(part: string, text: string): boolean {
  const atoms = partAtoms(part);
  // Invalid components match only the empty component.
  if (atoms === null) return text === "";
  let row = Array.from({ length: text.length + 1 }, (_, at) => at === 0);
  for (const atom of atoms) {
    const next = row.map((matched) => atom.repeated && matched);
    for (let at = 1; at <= text.length; at += 1) {
      if (atom.pattern.test(text[at - 1] ?? "")) {
        const prefix = atom.repeated ? next[at - 1] : row[at - 1];
        next[at] = next[at] === true || prefix === true;
      }
    }
    row = next;
  }
  return row[text.length] === true;
}

/** The root a glob word could expand to: `~/.local/share/keyr*\/login.keyring` reaches the keyring
 * directory, because each leading part of the pattern may match the root's part at that depth. */
export function globMentioned(
  text: string,
  roots: readonly Root[],
  env: PathEnv,
): Root | undefined {
  if (!["*", "?", "["].some((char) => text.includes(char))) {
    return undefined;
  }
  const parts = normalizePath(expand(text, env)).split("/");
  return roots.find((root) => {
    const rootParts = root.path.split("/");
    return (
      parts.length >= rootParts.length &&
      rootParts.every((rootPart, at) => {
        const part = parts[at];
        return part !== undefined && matchesGlobPart(part, rootPart);
      })
    );
  });
}
