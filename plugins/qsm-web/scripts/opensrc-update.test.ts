// qsm-web opensrc get against controlled git: a fake git for the exit-status
// regressions, and two real temporary local repositories for the origin
// checks. No network, and no source cache outside the test sandbox.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { envelopeOf, dataOf, isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { libDir } from "../lib/opensrc-core.ts";

const PLUGIN = resolve(import.meta.dir, "..");
const CLI = join(PLUGIN, "scripts", "cli.ts");
const TARGET = "https://example.invalid/qsm-demo.git";
/** The git a fixture repository and a CLI run share: no system or user config. */
const gitEnv = (home: string): Record<string, string> =>
  isolatedEnv(home, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" });

/** A git that records its arguments, answers the origin probe with a
 * legitimate origin (FAKE_GIT_NO_ORIGIN=1 refuses instead), and exits with
 * FAKE_GIT_EXIT (0 by default) on everything else. */
function fakeGit(): string {
  const dir = sandboxDir("qsm-web-fake-git-");
  writeFileSync(
    join(dir, "git"),
    [
      "#!/bin/sh",
      'printf "%s\\n" "$*" >> "$FAKE_GIT_LOG"',
      'case "$*" in',
      '  *"remote get-url origin"*)',
      '    [ "${FAKE_GIT_NO_ORIGIN:-0}" -eq 0 ] || exit 1',
      '    printf "%s\\n" "${FAKE_GIT_ORIGIN:-https://example.invalid/qsm-demo.git}"',
      "    exit 0",
      "    ;;",
      "esac",
      'exit "${FAKE_GIT_EXIT:-0}"',
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return dir;
}

/** A source root holding one already-cloned directory, marked so the test can prove it was kept. */
function clonedTree(): { root: string; marker: string } {
  const root = sandboxDir("qsm-web-sources-");
  const into = libDir(TARGET, root);
  mkdirSync(into, { recursive: true });
  const marker = join(into, "marker.txt");
  writeFileSync(marker, "kept\n");
  return { root, marker };
}

function run(env: Record<string, string>, root: string) {
  const home = sandboxDir("qsm-web-opensrc-home-");
  const log = join(home, "git.log");
  const r = runBin(CLI, ["opensrc", "get", TARGET, "--json"], {
    env: {
      ...gitEnv(home),
      PATH: `${fakeGit()}:${process.env.PATH ?? ""}`,
      QSM_OPENSRC_DIR: root,
      FAKE_GIT_LOG: log,
      ...env,
    },
  });
  return { ...r, log };
}

describe("qsm-web opensrc get update", () => {
  test("a successful update is ok and runs git pull --ff-only", () => {
    const tree = clonedTree();
    const r = run({}, tree.root);
    expect(r.exit).toBe(0);
    const envelope = envelopeOf(r.stdout);
    expect(envelope.code).toBe("ok");
    expect(envelope.data).toBeDefined();
    expect(r.stdout).toContain("update");
    expect(readFileSync(r.log, "utf8")).toContain("pull --ff-only");
  });

  interface FailureCase {
    readonly title: string;
    readonly env: Record<string, string>;
    readonly says: readonly string[];
    readonly silent?: readonly string[];
    /** Whether the pull itself was reached and failed, or refused before it. */
    readonly pulled: boolean;
  }
  const failures: FailureCase[] = [
    {
      title: "update exit 1 is failed with no data and the tree kept",
      env: { FAKE_GIT_EXIT: "1" },
      says: [`git update failed for ${TARGET} (exit 1)`],
      pulled: true,
    },
    {
      title: "update exit 128 is failed with no data and the tree kept",
      env: { FAKE_GIT_EXIT: "128" },
      says: [`git update failed for ${TARGET} (exit 128)`],
      pulled: true,
    },
    {
      title: "an origin that cannot be read fails before pulling",
      env: { FAKE_GIT_NO_ORIGIN: "1" },
      says: ["no readable origin", "QSM_OPENSRC_DIR"],
      pulled: false,
    },
    {
      title: "a different origin fails before pulling and is never printed",
      env: { FAKE_GIT_ORIGIN: "https://other.invalid/secret-token/x.git" },
      says: ["different repository", "QSM_OPENSRC_DIR"],
      silent: ["secret-token"],
      pulled: false,
    },
  ];
  test.each(failures)("$title", (c) => {
    const tree = clonedTree();
    const r = run(c.env, tree.root);
    expect(r.exit).toBe(1);
    const envelope = envelopeOf(r.stdout);
    expect(envelope.code).toBe("failed");
    for (const phrase of c.says) {
      expect(envelope.message).toContain(phrase);
    }
    for (const hidden of c.silent ?? []) {
      expect(r.stdout).not.toContain(hidden);
    }
    expect(dataOf(r.stdout) ?? null).toBeNull();
    if (c.pulled) {
      expect(readFileSync(r.log, "utf8")).toContain("pull --ff-only");
    } else {
      expect(readFileSync(r.log, "utf8")).not.toContain("pull --ff-only");
    }
    expect(readFileSync(tree.marker, "utf8")).toBe("kept\n");
  });
});

describe("qsm-web opensrc get against two real local repositories", () => {
  /** One committed repository under home, sharing the basename `qsm-demo` with its sibling. */
  function makeRepo(home: string, owner: string): string {
    const dir = join(home, owner, "qsm-demo");
    mkdirSync(dir, { recursive: true });
    const git = (...args: string[]): void => {
      const r = spawnSync("git", args, { cwd: dir, encoding: "utf8", env: gitEnv(home) });
      if (r.status !== 0) {
        throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
      }
    };
    git("init");
    writeFileSync(join(dir, "marker.txt"), `${owner}\n`);
    git("add", "marker.txt");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-m",
      "marker",
    );
    return dir;
  }

  function runReal(target: string, home: string, fromHome: boolean) {
    return runBin(CLI, ["opensrc", "get", target, "--json"], {
      env: { ...gitEnv(home), QSM_OPENSRC_DIR: join(home, "sources") },
      ...(fromHome ? { cwd: home } : {}),
    });
  }

  interface RepeatCase {
    readonly title: string;
    readonly address: (home: string) => string;
    readonly fromHome: boolean;
  }
  const repeats: RepeatCase[] = [
    {
      title: "cloning then repeating the same absolute address stays one parseable envelope",
      address: (home) => join(home, "a", "qsm-demo"),
      fromHome: false,
    },
    {
      title:
        "cloning then repeating the relative address ./a/qsm-demo stays one parseable envelope",
      address: () => "./a/qsm-demo",
      fromHome: true,
    },
  ];
  test.each(repeats)("$title", (c) => {
    const home = sandboxDir("qsm-web-opensrc-real-");
    makeRepo(home, "a");
    const first = runReal(c.address(home), home, c.fromHome);
    expect(first.exit).toBe(0);
    expect(envelopeOf(first.stdout).code).toBe("ok");
    // The repeat makes real git print "Already up to date"; stdout must
    // still be exactly one envelope.
    const again = runReal(c.address(home), home, c.fromHome);
    expect(again.exit).toBe(0);
    expect(envelopeOf(again.stdout).code).toBe("ok");
    expect(readFileSync(join(home, "sources", "qsm-demo", "marker.txt"), "utf8")).toBe("a\n");
  });

  test("a same-basename address from another repository fails and keeps the first", () => {
    const home = sandboxDir("qsm-web-opensrc-real-");
    const repoA = makeRepo(home, "a");
    const repoB = makeRepo(home, "b");
    expect(runReal(repoA, home, false).exit).toBe(0);
    const other = runReal(repoB, home, false);
    expect(other.exit).toBe(1);
    const envelope = envelopeOf(other.stdout);
    expect(envelope.code).toBe("failed");
    expect(envelope.message).toContain("QSM_OPENSRC_DIR");
    // The other origin is never printed, only the requested address.
    expect(other.stdout).not.toContain(repoA);
    expect(dataOf(other.stdout) ?? null).toBeNull();
    const cache = join(home, "sources", "qsm-demo");
    expect(readFileSync(join(cache, "marker.txt"), "utf8")).toBe("a\n");
    const origin = spawnSync("git", ["-C", cache, "remote", "get-url", "origin"], {
      encoding: "utf8",
      env: gitEnv(home),
    });
    expect(origin.stdout?.trim()).toBe(repoA);
  });
});
