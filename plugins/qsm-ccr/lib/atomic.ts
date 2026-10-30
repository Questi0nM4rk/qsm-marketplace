// A file the person owns is replaced whole or not at all: a crash or a full disk leaves the old
// file, never half of the new one.
import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  lstatSync,
  openSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/** A temp file younger than this may belong to a write that is still running. */
const STALE_MS = 60_000;
const MAX_LINK_HOPS = 40;

/** `path` with every symlink at its end followed, a dangling one included: the file a write must
 * replace to keep the links. */
function endOfLinks(path: string): string {
  let at = path;
  for (let hops = 0; hops < MAX_LINK_HOPS; hops += 1) {
    if (lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink() !== true) {
      return at;
    }
    at = resolve(dirname(at), readlinkSync(at));
  }
  throw new Error(`${path}: more than ${MAX_LINK_HOPS} symlinks in a row`);
}

/** Removes the temp files a killed write left next to `target`; returns each path removed. */
function sweepLeftovers(target: string): string[] {
  const dir = dirname(target);
  const name = basename(target).replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const leftover = new RegExp(`^\\.${name}\\.[0-9a-f]{12}\\.tmp$`);
  const swept: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const old = leftover.test(entry) && Date.now() - statSync(path).mtimeMs > STALE_MS;
    if (old) {
      rmSync(path, { force: true });
      swept.push(path);
    }
  }
  return swept;
}

/** Writes `data` to `path` through a temp file in the same directory: the file's own mode is kept
 * (a new file gets `newMode`), the data is fsynced, then renamed over the target, and the
 * directory is fsynced. A symlink, dangling or not, is followed: the link stays and its target is
 * replaced. A rename replaces the inode, so a hard link to the file keeps the old text; run as
 * root the new file is root's. Returns the stale temp files of killed writes it removed first.
 * Throws with the old file in place and no temp file left. */
export function writeFileAtomic(
  path: string,
  data: string | Uint8Array,
  newMode = 0o600,
): string[] {
  const target = endOfLinks(path);
  const swept = sweepLeftovers(target);
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : newMode;
  const tmp = join(dirname(target), `.${basename(target)}.${randomBytes(6).toString("hex")}.tmp`);
  let fd: number | undefined;
  let created = false;
  try {
    fd = openSync(tmp, "wx", mode);
    created = true;
    // the umask does not get a say
    fchmodSync(fd, mode);
    writeFileSync(fd, data);
    fsyncSync(fd);
    const open = fd;
    // closed once, whatever closeSync does
    fd = undefined;
    closeSync(open);
    renameSync(tmp, target);
  } catch (e) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // the write's own error is the one to report
      }
    }
    if (created) {
      rmSync(tmp, { force: true });
    }
    throw e;
  }
  syncDirectory(dirname(target));
  return swept;
}

/** The rename is only durable once its directory is on disk; where a directory cannot be
 * fsynced the file is still replaced whole, so that failure is not the write's. */
function syncDirectory(dir: string): void {
  try {
    const fd = openSync(dir, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    // atomic still, only not durable across power loss
  }
}
