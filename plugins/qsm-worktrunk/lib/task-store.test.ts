import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { redirectPath, type StoreIo, storePath, writeRedirect } from "./task-store.ts";

// Every sandbox this file makes is removed after the test that made it,
// passing or failing: a `finally` inside one test would leave the rest.
const sandboxes: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "qsm-worktrunk-"));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  while (sandboxes.length > 0) {
    const dir = sandboxes.pop();
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

/** The engine's file system, as a test reaches it: a write creates the
 * directories it needs, the same as `$.fs.write`. */
const io: StoreIo = {
  exists: (path) => Promise.resolve(existsSync(path)),
  write: (path, text) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    return Promise.resolve();
  },
};

describe("storePath and redirectPath", () => {
  test("the store is beside the checkout, the redirect inside the store", () => {
    expect(storePath("/repo")).toBe("/repo/.beads");
    expect(redirectPath("/workspaces/feature")).toBe("/workspaces/feature/.beads/redirect");
  });

  test("a trailing slash does not double up", () => {
    expect(storePath("/repo/")).toBe("/repo/.beads");
  });
});

describe("writeRedirect", () => {
  test("A task is created inside a workspace", async () => {
    const root = sandbox();
    const main = join(root, "main");
    const workspace = join(root, "feature");
    mkdirSync(join(main, ".beads"), { recursive: true });
    mkdirSync(workspace, { recursive: true });

    expect(await writeRedirect(io, workspace, main)).toBe(true);
    expect(readFileSync(redirectPath(workspace), "utf8")).toBe(`${join(main, ".beads")}\n`);
  });

  test("the redirect's directory is created when the workspace has none", async () => {
    const root = sandbox();
    const main = join(root, "main");
    const workspace = join(root, "feature");
    mkdirSync(join(main, ".beads"), { recursive: true });

    expect(await writeRedirect(io, workspace, main)).toBe(true);
    expect(existsSync(redirectPath(workspace))).toBe(true);
  });

  test("a main checkout with no store is not redirected to", async () => {
    const root = sandbox();
    const main = join(root, "main");
    const workspace = join(root, "feature");
    mkdirSync(main, { recursive: true });
    mkdirSync(workspace, { recursive: true });

    expect(await writeRedirect(io, workspace, main)).toBe(false);
    expect(existsSync(redirectPath(workspace))).toBe(false);
  });

  test("writing twice leaves one line, not two", async () => {
    const root = sandbox();
    const main = join(root, "main");
    const workspace = join(root, "feature");
    mkdirSync(join(main, ".beads"), { recursive: true });

    await writeRedirect(io, workspace, main);
    await writeRedirect(io, workspace, main);
    expect(readFileSync(redirectPath(workspace), "utf8").trim().split("\n")).toHaveLength(1);
  });
});
