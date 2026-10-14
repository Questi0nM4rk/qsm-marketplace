// Repository resolution: an explicit option when the caller gave one, the working tree's own origin
// remote otherwise.

import { UsageError } from "./errors.ts";
import type { Run } from "./exec.ts";
import { MissingError } from "./missing-error.ts";

export interface GithubRepo {
  readonly owner: string;
  readonly repo: string;
}

export interface GitlabProject {
  /** `group/subgroup/project`, as a person writes it. */
  readonly path: string;
  /** The same path as one path segment, which is what the API takes. */
  readonly encodedPath: string;
}

/** `git@host:group/project.git` and `user@host:group/project`. */
const SSH_REMOTE = /^[^@\s]+@[^:\s]+:(.+?)(?:\.git)?$/;
/** `https://host/group/project.git`, `ssh://git@host/group/project`. */
const URL_REMOTE = /^(?:ssh|git|https?):\/\/[^/\s]+\/(.+?)(?:\.git)?$/;

/** The project path inside a remote URL, or null when the URL is neither shape. */
export function remotePath(url: string): string | null {
  const trimmed = url.trim();
  const match = SSH_REMOTE.exec(trimmed) ?? URL_REMOTE.exec(trimmed);
  const path = match?.[1]?.replace(/^\/+/, "");
  return path === undefined || path.length === 0 ? null : path;
}

function segmentsOf(spec: string): string[] {
  return spec
    .trim()
    .replaceAll(/^\/+|\/+$/g, "")
    .split("/")
    .filter((part) => part.length > 0);
}

/** `owner/name` -> a repository. A path with any other number of segments
 * is not a GitHub repository. */
export function githubRepo(spec: string): GithubRepo | null {
  const parts = segmentsOf(spec);
  const owner = parts.at(0);
  const repo = parts.at(1);
  if (parts.length !== 2 || owner === undefined || repo === undefined) {
    return null;
  }
  return { owner, repo };
}

/** `group/project` or `group/subgroup/project` -> a project. GitLab nests,
 * so anything from two segments up is valid. */
export function gitlabProject(spec: string): GitlabProject | null {
  const parts = segmentsOf(spec);
  if (parts.length < 2) {
    return null;
  }
  return {
    path: parts.join("/"),
    encodedPath: parts.map((part) => encodeURIComponent(part)).join("%2F"),
  };
}

async function originRemote(run: Run): Promise<string | null> {
  try {
    return (await run("git", ["remote", "get-url", "origin"])).trim();
  } catch {
    // Outside a git checkout, or a checkout with no origin. Either way
    // there is nothing to detect, and the caller says so in its own words.
    return null;
  }
}

async function detectPath(run: Run): Promise<string | null> {
  const url = await originRemote(run);
  return url === null ? null : remotePath(url);
}

/** The repository a GitHub verb runs against. `spec` is `--repo`'s value
 * when the caller gave one. */
export async function resolveGithubRepo(run: Run, spec: string | null): Promise<GithubRepo> {
  if (spec !== null) {
    const named = githubRepo(spec);
    if (named === null) {
      throw new UsageError(`--repo ${spec} is not owner/name`);
    }
    return named;
  }
  const detected = await detectPath(run);
  const found = detected === null ? null : githubRepo(detected);
  if (found === null) {
    throw new MissingError(
      "no repository: run inside a git checkout whose origin is a GitHub repository, or name one with --repo owner/name",
    );
  }
  return found;
}

/** The project a GitLab verb runs against. `spec` is `--project`'s value
 * when the caller gave one. */
export async function resolveGitlabProject(run: Run, spec: string | null): Promise<GitlabProject> {
  if (spec !== null) {
    const named = gitlabProject(spec);
    if (named === null) {
      throw new UsageError(`--project ${spec} is not namespace/project`);
    }
    return named;
  }
  const detected = await detectPath(run);
  const found = detected === null ? null : gitlabProject(detected);
  if (found === null) {
    throw new MissingError(
      "no project: run inside a git checkout whose origin is a GitLab project, or name one with --project namespace/project",
    );
  }
  return found;
}
