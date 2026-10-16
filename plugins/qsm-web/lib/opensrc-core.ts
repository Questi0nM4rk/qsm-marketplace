// Pure classification and result assembly for qsm-web's `opensrc get` verb.
import { resolve as resolvePath } from "node:path";

export type TargetKind = "address" | "spec";

/** A package spec or a raw repository address. */
export function classifyTarget(s: string): TargetKind {
  const t = s.trim();
  if (/^https?:\/\//.test(t)) {
    return "address";
  }
  if (t.startsWith("ssh://")) {
    return "address";
  }
  if (/^git@[^:]+:/.test(t)) {
    return "address";
  }
  if (t.endsWith(".git")) {
    return "address";
  }
  return "spec";
}

/** Best-effort version from a path the resolver produced. */
export function resolvedVersionFromPath(p: string): string | null {
  if (!p) {
    return null;
  }
  const seg = p.replace(/\/+$/, "").split("/").pop() ?? "";
  if (/^v?\d+\.\d+/.test(seg)) {
    return seg.replace(/^v/, "");
  }
  const at = seg.match(/@(v?\d+\.\d+[^@/\s]*)$/);
  const version = at?.[1];
  if (version !== undefined) {
    return version.replace(/^v/, "");
  }
  return null;
}

const REGISTRIES = ["pypi", "crates", "gitlab", "bitbucket"];

/** A spec or address reduced to one lowercase library name: registry
 * prefix, scheme, `.git` suffix, `@version` tail and scope all dropped. */
export function libName(spec: string): string {
  const s = withoutVersion(
    stripLocator(spec.trim().replace(/^(?:pypi|crates|gitlab|bitbucket):(.+)$/, "$1")),
  );
  const last = s.split("/").findLast(Boolean) ?? s;
  return last.toLowerCase();
}

/** Scheme, ssh user and `.git` suffix dropped. */
function stripLocator(s: string): string {
  return s
    .replace(/^(http|https|ssh):\/\//, "")
    .replace(/^git@[^:]+:/, "")
    .replace(/\.git$/, "");
}

/** A scope leads with @, so only an @ past index 0 delimits a version. */
function withoutVersion(s: string): string {
  const at = s.lastIndexOf("@");
  return at > 0 ? s.slice(0, at) : s;
}

/** Whether the resolved version is exact rather than "whatever is latest". */
export function versionMatched(
  spec: string,
  projectDeps: Readonly<Record<string, string>> | null,
): boolean {
  const s = spec.trim();
  if (s.lastIndexOf("@") > 0) {
    return true;
  }
  if (projectDeps === null) {
    return false;
  }
  const isRegistryPrefixed = REGISTRIES.some((r) => s.startsWith(`${r}:`));
  const isOwnerRepo = !isRegistryPrefixed && s.includes("/") && !s.startsWith("@");
  return !(isRegistryPrefixed || isOwnerRepo) && Object.hasOwn(projectDeps, s);
}

/** The directory this library's source is reused from, across calls. */
export function libDir(spec: string, root: string): string {
  return resolvePath(root, libName(spec));
}

/** Where sources land: `QSM_OPENSRC_DIR`, else `<home>/Clonned`. */
export function sourceRoot(env: Record<string, string | undefined>, home: string): string {
  const override = env.QSM_OPENSRC_DIR;
  return override !== undefined && override.length > 0 ? override : resolvePath(home, "Clonned");
}

export interface ProjectPackage {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

/** Everything a project declares, runtime and development together: both
 * are a pin a fetch can be exact against. */
export function declaredDeps(pkg: ProjectPackage | null | undefined): Record<string, string> {
  return { ...pkg?.dependencies, ...pkg?.devDependencies };
}

/**
 * Whether a library directory already holds a real tree, which an earlier fetch by address left
 * there.
 */
export function linkWouldNest(exists: boolean, isSymlink: boolean): boolean {
  return exists && !isSymlink;
}

/** The scoped dependency a bare name really meant, or null when the bare name is unambiguous. */
export function ambiguousBareName(
  spec: string,
  projectPkgJson: ProjectPackage | null | undefined,
): string | null {
  if (!projectPkgJson) {
    return null;
  }
  if (spec.startsWith("@")) {
    return null;
  }
  const deps = declaredDeps(projectPkgJson);
  if (Object.hasOwn(deps, spec)) {
    return null;
  }
  for (const key of Object.keys(deps)) {
    const base = key.startsWith("@") ? (key.split("/")[1] ?? key) : key;
    if (base === spec && key !== spec) {
      return key;
    }
  }
  return null;
}

export type FetchMode = "resolver" | "clone" | "update";

export interface FetchResult {
  readonly lib: string;
  readonly libPath: string;
  readonly sourceSpec: string;
  readonly resolvedVersion: string | null;
  readonly versionMatched: boolean;
  readonly mode: FetchMode;
}

export interface FetchResultInput {
  readonly target: string;
  /** What the project declares, or null when no project was given. */
  readonly projectDeps: Readonly<Record<string, string>> | null;
  readonly libPath: string;
  readonly resolvedVersion: string | null;
  readonly mode: FetchMode;
}

/** The one JSON object a successful run prints: six fields, always. */
export function buildFetchResult(input: FetchResultInput): FetchResult {
  return {
    lib: libName(input.target),
    libPath: input.libPath,
    sourceSpec: input.target,
    resolvedVersion: input.resolvedVersion,
    versionMatched:
      input.mode === "resolver" ? versionMatched(input.target, input.projectDeps) : false,
    mode: input.mode,
  };
}
