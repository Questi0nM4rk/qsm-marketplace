#!/usr/bin/env bun
// Builds the qsm-patched sentrux from upstream at one pinned commit and the two things this plugin
// adds to it.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { errorMessage } from "../lib/errors.ts";

export const UPSTREAM_REPO = "https://github.com/sentrux/sentrux";
// pragma: allowlist nextline secret
export const UPSTREAM_COMMIT = "f36da08a53e7f06c5b6aec33eb05816b371000ea";
export const PATCH = resolve(import.meta.dir, "..", "sentrux", "wiring.patch");

/** Every file this plugin owns outright, and where upstream's tree wants it.
 * `wiring.patch` carries the `mod` declaration for each. */
const OWNED_SOURCES = ["cross_module.rs", "json.rs"] as const;
const OWNED_DEST = join("sentrux-core", "src", "metrics");
const OWNED_DIR = resolve(import.meta.dir, "..", "sentrux", "src");

function step(cwd: string, cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, { cwd, stdio: ["ignore", "inherit", "inherit"] });
  if (result.status !== 0) {
    throw new Error(
      `\`${cmd} ${args.join(" ")}\` exited ${result.status ?? "by signal"} in ${cwd}`,
    );
  }
}

/** Copies the files this plugin owns into the checkout at `dir`. */
function copyOwnedSources(dir: string): void {
  const dest = join(dir, OWNED_DEST);
  mkdirSync(dest, { recursive: true });
  for (const name of OWNED_SOURCES) {
    const target = join(dest, name);
    if (existsSync(target)) {
      throw new Error(
        `upstream already ships ${join(OWNED_DEST, name)} — rename this plugin's ${basename(name)}`,
      );
    }
    copyFileSync(join(OWNED_DIR, name), target);
  }
}

/**
 * Clones upstream at `UPSTREAM_COMMIT` into the empty directory `dir`, adds the files this plugin
 * owns, and applies the wiring patch.
 */
export function preparePatchedSource(dir: string): void {
  mkdirSync(dir, { recursive: true });
  if (readdirSync(dir).length > 0) {
    throw new Error(`${dir} is not empty`);
  }
  step(dir, "git", ["init", "-q"]);
  step(dir, "git", ["fetch", "-q", "--depth", "1", UPSTREAM_REPO, UPSTREAM_COMMIT]);
  step(dir, "git", ["checkout", "-q", UPSTREAM_COMMIT]);
  const head = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: dir,
    encoding: "utf8",
  }).stdout.trim();
  if (head !== UPSTREAM_COMMIT) {
    throw new Error(`checked out ${head}, wanted ${UPSTREAM_COMMIT}`);
  }
  copyOwnedSources(dir);
  step(dir, "git", ["apply", "--check", PATCH]);
  step(dir, "git", ["apply", PATCH]);
}

/**
 * Scratch space for the clone and the build, not the system temp directory: /tmp is tmpfs on some
 * machines, and a release build is about 4 GB.
 */
function cacheDir(): string {
  const dir = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * One fixed path rather than a fresh mkdtemp: a run killed mid-build runs no finally, and the next
 * run needs to know where to find what to clean up.
 */
export function installDir(): string {
  return join(cacheDir(), "qsm-sentrux-build");
}

/** Patched source built in `installDir()` and installed with cargo.
 * Whatever an earlier run left there is removed first and after. */
export function installPatched(): void {
  const dir = installDir();
  rmSync(dir, { recursive: true, force: true });
  try {
    preparePatchedSource(dir);
    const target = join(dir, "target");
    step(dir, "cargo", [
      "install",
      "--path",
      join(dir, "sentrux-bin"),
      "--locked",
      "--target-dir",
      target,
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Patched source in `dir`, built in place; returns the binary path. */
export function buildPatched(dir: string): string {
  preparePatchedSource(dir);
  step(dir, "cargo", ["build", "--release", "--locked"]);
  return join(dir, "target", "release", "sentrux");
}

if (import.meta.main) {
  const [, , target] = process.argv;
  try {
    if (target === "install") {
      installPatched();
    } else if (target !== undefined && target !== "") {
      console.log(buildPatched(resolve(target)));
    } else {
      throw new Error("usage: build-sentrux.ts install | build-sentrux.ts <empty dir>");
    }
  } catch (e) {
    console.error(`qsm-langdev build-sentrux: ${errorMessage(e)}`);
    process.exit(1);
  }
}
