// The one file-writing helper two plugins needed.
import { randomUUID } from "node:crypto";
import { renameSync, writeFileSync } from "node:fs";

/** Writes `text` (or bytes) to `path` through a tmp file and a rename, so a reader never sees half a file,
 * even with two runs writing the same path. */
export function writeAtomic(path: string, text: string | Uint8Array, mode?: number): void {
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmp, text, mode === undefined ? undefined : { mode });
  renameSync(tmp, path);
}
