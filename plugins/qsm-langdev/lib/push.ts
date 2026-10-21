// What git tells a pre-push hook, and what to compare each pushed ref against.

import { spawnSync } from "node:child_process";

export interface PushedRef {
  localRef: string;
  localOid: string;
  remoteRef: string;
  remoteOid: string;
}

/** The all-zero oid git writes for a ref that does not exist. */
const isZero = (oid: string): boolean => oid !== "" && oid.replaceAll("0", "") === "";

export function parsePushLines(text: string): PushedRef[] {
  const refs: PushedRef[] = [];
  for (const line of text.split("\n")) {
    const [localRef, localOid, remoteRef, remoteOid] = line.trim().split(/\s+/);
    if (
      localRef === undefined ||
      localOid === undefined ||
      remoteRef === undefined ||
      remoteOid === undefined
    ) {
      continue;
    }
    refs.push({ localRef, localOid, remoteRef, remoteOid });
  }
  return refs;
}

function git(root: string, ...args: string[]): string | null {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** The default branch of the remote being pushed to, as this clone last saw it, or null when the
 * clone holds no remote-tracking branch of that remote (an empty remote, a path or URL target). */
function remoteDefaultBranch(root: string, remote: string): string | null {
  const head = git(root, "symbolic-ref", "--short", `refs/remotes/${remote}/HEAD`);
  if (head !== null && head !== "") {
    return head;
  }
  for (const name of ["main", "master"]) {
    if (git(root, "rev-parse", "--verify", "-q", `refs/remotes/${remote}/${name}`) !== null) {
      return `${remote}/${name}`;
    }
  }
  return null;
}

/** The commit a pushed ref is compared against, or null when there is
 * nothing to compare: a deletion (local oid all zeros), a new branch on a
 * remote this clone knows no default branch of (an empty remote has nothing
 * to be worse than), or a push that adds no commit. Only `remote` counts: a
 * default branch another remote holds says nothing of what this one has. */
export function pushReference(root: string, pushed: PushedRef, remote: string): string | null {
  if (isZero(pushed.localOid)) {
    return null;
  }
  if (!isZero(pushed.remoteOid)) {
    return pushed.remoteOid;
  }
  const base = remoteDefaultBranch(root, remote);
  if (base === null) {
    return null;
  }
  const mergeBase = git(root, "merge-base", base, pushed.localOid);
  if (mergeBase === null || mergeBase === pushed.localOid) {
    return null;
  }
  return mergeBase;
}

/** Why `pushReference` has nothing to compare `pushed` against, for the line a gate prints. */
export function pushSkipReason(root: string, pushed: PushedRef, remote: string): string {
  if (isZero(pushed.localOid)) {
    return `${pushed.remoteRef}: a deletion, nothing to compare`;
  }
  if (isZero(pushed.remoteOid) && remoteDefaultBranch(root, remote) === null) {
    return `${pushed.remoteRef}: this clone knows no default branch of '${remote}' to compare a new branch against`;
  }
  return `${pushed.remoteRef}: adds no commit beyond the default branch of '${remote}'`;
}

/** The git log range holding the commits a pushed ref adds: remote..local for a ref the remote
 * has, the local commits no remote-tracking ref of `remote` reaches for a new branch, null for a
 * deletion. Only the remote being pushed to counts: a commit another remote holds is still news to
 * this one. Remote names cannot hold glob characters, so `--remotes=<name>` is refs/remotes/<name>/*. */
export function pushedRange(pushed: PushedRef, remote: string): string | null {
  if (isZero(pushed.localOid)) {
    return null;
  }
  return isZero(pushed.remoteOid)
    ? `${pushed.localOid} --not --remotes=${remote}`
    : `${pushed.remoteOid}..${pushed.localOid}`;
}

/** Whether the ref's remote tip is a commit this clone never fetched, so a range from it cannot resolve. */
export function remoteTipMissing(root: string, pushed: PushedRef): boolean {
  return (
    !isZero(pushed.remoteOid) &&
    git(root, "cat-file", "-e", `${pushed.remoteOid}^{commit}`) === null
  );
}

/** How many commits a `pushedRange` lists, or null when git cannot resolve it. */
export function commitCount(root: string, range: string): number | null {
  const out = git(root, "rev-list", "--count", ...range.split(" "));
  return out === null ? null : Number(out);
}
