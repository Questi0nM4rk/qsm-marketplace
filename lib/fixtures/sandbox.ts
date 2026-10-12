import { afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const sandboxes: string[] = [];
afterEach(() => {
  for (const dir of sandboxes.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A fresh temp directory that the importing test file removes after each test. */
export function sandboxDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  sandboxes.push(dir);
  return dir;
}

/** Writes `text` to `rel` under `root`, making the directories on the way. */
export function writeIn(root: string, rel: string, text: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
