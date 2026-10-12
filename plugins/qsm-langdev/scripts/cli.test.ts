// qsm-langdev through its real surface: the binary's argv, stdout, stderr,
// exit. Every outcome code the plugin uses appears once here.
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "cli.ts");
const sandboxes: string[] = [];

/** A home under the system temp directory, removed after each test whether
 * the test passed or failed. */
function sandbox(): string {
  const home = mkdtempSync(join(tmpdir(), "qsm-langdev-cli-"));
  sandboxes.push(home);
  mkdirSync(join(home, "work"), { recursive: true });
  return home;
}

afterEach(() => {
  while (sandboxes.length > 0) {
    rmSync(sandboxes.pop() ?? "", { recursive: true, force: true });
  }
});

function run(
  argv: readonly string[],
  opts: { cwd?: string; home?: string; pathFirst?: string } = {},
) {
  const home = opts.home ?? sandbox();
  const path = process.env.PATH ?? "";
  const r = spawnSync("bun", [CLI, ...argv], {
    encoding: "utf8",
    cwd: opts.cwd ?? join(home, "work"),
    env: {
      PATH: opts.pathFirst === undefined ? path : `${opts.pathFirst}:${path}`,
      HOME: home,
      XDG_CONFIG_HOME: join(home, "c"),
      // the run's own temp root, so a temp dir the binary leaves is counted
      ...(process.env.TMPDIR === undefined ? {} : { TMPDIR: process.env.TMPDIR }),
    },
  });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** A git repository with one committed shell file, opted into `shell` in its
 * own gates.json, but no scaffolded profile config: every selected checker
 * is then either missing or without its config, so `check` has something to
 * report as worse. */
function repoWithShellFile(): string {
  const home = sandbox();
  const root = join(home, "work");
  const git = (...args: string[]) =>
    spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, HOME: home } });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  mkdirSync(join(root, ".qsm-langdev"), { recursive: true });
  writeFileSync(
    join(root, ".qsm-langdev", "gates.json"),
    `${JSON.stringify({ hooks: { "pre-commit": [], "pre-push": [] }, languages: ["shell"] })}\n`,
  );
  writeFileSync(join(root, "a.sh"), "#!/bin/sh\necho hi\n");
  git("add", "-A");
  git("commit", "-qm", "first");
  writeFileSync(join(root, "a.sh"), "#!/bin/sh\necho hi\necho there\n");
  return home;
}

/** A git repository with one commit and no .qsm-langdev/gates.json: it has
 * never run `qsm-langdev init`. */
function plainRepo(): string {
  const home = sandbox();
  const root = join(home, "work");
  const git = (...args: string[]) =>
    spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, HOME: home } });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(root, "a.ts"), "const a = 1;\n");
  git("add", "-A");
  git("commit", "-qm", "first");
  return home;
}

/** A stand-in semgrep in `<home>/bin` whose `show identity` exits `identity`,
 * so doctor's login probe needs no real semgrep and no login. */
function fakeSemgrep(home: string, identity: number): string {
  const bin = join(home, "bin");
  mkdirSync(bin, { recursive: true });
  const path = join(bin, "semgrep");
  writeFileSync(path, `#!/bin/sh\nif [ "$1" = show ]; then exit ${identity}; fi\necho 1.153.1\n`);
  chmodSync(path, 0o755);
  return bin;
}

describe("qsm-langdev cli", () => {
  test("--help lists every verb qsm.json declares", () => {
    const r = run(["--help"]);
    expect(r.exit).toBe(0);
    for (const verb of [
      "check",
      "list",
      "doctor",
      "languages",
      "init",
      "structure",
      "install",
      "uninstall",
      "hook",
    ]) {
      expect(r.stdout).toContain(`  ${verb}`);
    }
  });

  test("an action outside choices is usage, exit 2", () => {
    const r = run(["languages", "drop"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("action must be one of list, add, remove");
  });

  test("list --json is an envelope carrying the registry", () => {
    const r = run(["list", "--json"]);
    expect(r.exit).toBe(0);
    const envelope = JSON.parse(r.stdout);
    expect(envelope).toMatchObject({ code: "ok", exit: 0 });
    expect(envelope.data.some((row: { name: string }) => row.name === "shellcheck")).toBe(true);
  });

  test("outside a git repository is missing, exit 4", () => {
    const r = run(["doctor", "--json"]);
    expect(r.exit).toBe(4);
    expect(JSON.parse(r.stdout)).toMatchObject({ code: "missing", exit: 4 });
  });
});

describe("qsm-langdev cli: repository state", () => {
  test("`check` in an un-init'd repository", () => {
    const home = plainRepo();
    const r = run(["check", "--json"], { home });
    const root = join(home, "work");
    expect(r.exit).toBe(4);
    const envelope = JSON.parse(r.stdout);
    expect(envelope).toMatchObject({ code: "missing", exit: 4 });
    expect(envelope.message).toBe(`qsm-langdev is not set up in ${root}: run qsm-langdev init`);
  });

  test("A comparison blocks", () => {
    const home = repoWithShellFile();
    const r = run(["check", "--json"], { home });
    expect(r.exit).toBe(3);
    const envelope = JSON.parse(r.stdout);
    expect(envelope).toMatchObject({ code: "worse", exit: 3 });
    expect(envelope.data.verdicts.some((v: { pass: boolean }) => !v.pass)).toBe(true);
  }, 60_000);

  test("check hands the paths it is given to the given set and reports each set's size", () => {
    const home = repoWithShellFile();
    const r = run(["check", ".", "nowhere", "--json"], { home });
    const envelope = JSON.parse(r.stdout);
    expect(envelope.data.sets).toEqual([
      { set: "changed", files: 1 },
      { set: "given", files: 0 },
    ]);
    expect(r.stderr).toContain("file sets: changed: 1 file, given: 0 files");
  }, 60_000);
});

describe("qsm-langdev cli: gates", () => {
  test("the langdev gate reports each set's size", () => {
    const home = repoWithShellFile();
    const root = join(home, "work");
    mkdirSync(join(root, ".qsm-langdev"), { recursive: true });
    writeFileSync(
      join(root, ".qsm-langdev", "gates.json"),
      `${JSON.stringify({ hooks: { "pre-commit": ["langdev"], "pre-push": [] } })}\n`,
    );
    const r = run(["hook", "pre-commit"], { home });
    // the edited a.sh and the untracked gates.json
    expect(r.stderr).toContain("file sets: changed: 2 files, given: 2 files");
  }, 60_000);

  test("A gate blocks the hook", () => {
    const home = repoWithShellFile();
    const root = join(home, "work");
    mkdirSync(join(root, ".qsm-langdev"), { recursive: true });
    writeFileSync(
      join(root, ".qsm-langdev", "gates.json"),
      `${JSON.stringify({ hooks: { "pre-commit": ["nonsense"], "pre-push": [] } })}\n`,
    );
    const r = run(["hook", "pre-commit"], { home });
    expect(r.exit).toBe(1);
    expect(r.stderr).toContain("unknown gate 'nonsense'");
  }, 60_000);

  test("The installed git hook in an un-init'd repository", () => {
    const home = plainRepo();
    const r = run(["hook", "pre-commit"], { home });
    expect(r.exit).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("");
  });
});

describe("qsm-langdev doctor and the semgrep login", () => {
  test("Not logged in", () => {
    const loggedOut = repoWithShellFile();
    const loggedIn = repoWithShellFile();
    const out = run(["doctor"], { home: loggedOut, pathFirst: fakeSemgrep(loggedOut, 2) });
    const inn = run(["doctor"], { home: loggedIn, pathFirst: fakeSemgrep(loggedIn, 0) });
    expect(out.stderr).toContain(
      "warning: semgrep is not logged in: run semgrep login to use qsm-langdev at its fullest",
    );
    expect(inn.stderr).not.toContain("semgrep is not logged in");
    expect(out.exit).toBe(inn.exit);
  }, 60_000);
});

describe("qsm-langdev list", () => {
  test("a checker that covers files by name shows the names, not an empty extension list", () => {
    const home = sandbox();
    const r = run(["list"], { home });
    const row = r.stdout.split("\n").find((line) => line.startsWith("semgrep-dockerfile\t"));

    expect(row?.split("\t")[3]).toBe("^(Dockerfile|.+\\.Dockerfile|Dockerfile\\..+)$");
  });
});

// --- languages: opt-in, never "whatever this tree contains" ------------------

/** A repository with both a .ts and a .py file changed, gates.json naming
 * exactly `languages`. */
function repoWithTsAndPy(languages: readonly string[]): string {
  const home = sandbox();
  const root = join(home, "work");
  const git = (...args: string[]) =>
    spawnSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, HOME: home } });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  mkdirSync(join(root, ".qsm-langdev"), { recursive: true });
  writeFileSync(
    join(root, ".qsm-langdev", "gates.json"),
    `${JSON.stringify({ hooks: { "pre-commit": [], "pre-push": [] }, languages })}\n`,
  );
  writeFileSync(join(root, "a.ts"), "const a = 1;\n");
  writeFileSync(join(root, "a.py"), "a = 1\n");
  git("add", "-A");
  git("commit", "-qm", "first");
  writeFileSync(join(root, "a.ts"), "const a = 2;\n");
  writeFileSync(join(root, "a.py"), "a = 2\n");
  return home;
}

describe("qsm-langdev languages: opt-in", () => {
  test("`init` records what it scaffolded", () => {
    const home = plainRepo();
    const root = join(home, "work");

    const r = run(["init"], { home });

    expect(r.exit).toBe(0);
    const gates = JSON.parse(readFileSync(join(root, ".qsm-langdev", "gates.json"), "utf8"));
    expect(gates.languages).toEqual(["ts"]);
  });

  test("an explicit languages list gates only the languages it names", () => {
    const home = repoWithTsAndPy(["ts"]);

    const r = run(["check", "--json"], { home });

    const checks = (JSON.parse(r.stdout).data.verdicts as { check: string }[]).map((v) => v.check);
    expect(checks).toContain("ts config");
    expect(checks).not.toContain("py config");
  }, 60_000);

  test("an explicit empty languages list gates no language checker at all", () => {
    const home = repoWithTsAndPy([]);

    const r = run(["check", "--json"], { home });

    const checks = (JSON.parse(r.stdout).data.verdicts as { check: string }[]).map((v) => v.check);
    expect(checks).not.toContain("ts config");
    expect(checks).not.toContain("py config");
  }, 60_000);
});
