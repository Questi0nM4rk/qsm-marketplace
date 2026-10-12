// What git tells a pre-push hook, and what to compare each pushed ref against.

import { spawnSync } from "node:child_process";

export interface PushedRef {
  localRef: string;
  localOid: string;
  remoteRef: string;
  remoteOid: string;
}

const ZERO = /^0+$/;

export function parsePushLines(text: string): PushedRef[] {
  const refs: PushedRef[] = [];
  for (const line of text.split("\n")) {
    const [localRef, localOid, remoteRef, remoteOid] = line.trim().split(/\s+/);
    if (!(localRef && localOid && remoteRef && remoteOid)) {
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

function defaultBranch(root: string): string | null {
  const remote = git(root, "symbolic-ref", "--short", "refs/remotes/origin/HEAD");
  if (remote) {
    return remote;
  }
  for (const name of ["main", "master"]) {
    if (git(root, "rev-parse", "--verify", "-q", `refs/heads/${name}`) !== null) {
      return name;
    }
  }
  return null;
}

/** The commit a pushed ref is compared against, or null when there is
 * nothing to compare: a deletion (local oid all zeros), a new branch with no
 * default branch to take a merge base from, or a push that adds no commit. */
export function pushReference(root: string, pushed: PushedRef): string | null {
  if (ZERO.test(pushed.localOid)) {
    return null;
  }
  if (!ZERO.test(pushed.remoteOid)) {
    return pushed.remoteOid;
  }
  const base = defaultBranch(root);
  if (base === null) {
    return null;
  }
  const mergeBase = git(root, "merge-base", base, pushed.localOid);
  if (mergeBase === null || mergeBase === pushed.localOid) {
    return null;
  }
  return mergeBase;
}
