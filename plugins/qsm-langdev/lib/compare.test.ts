// The ratchet's own rule, proved against real git trees. The checker under
// test is `grep -Hn`, so a test writes the findings it wants straight into
// the files it commits and nothing about the result depends on a linter
// being installed. Every tree is a sandbox under the system temp directory,
// removed after each test whether the test passed or failed.

import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import {
  type CompareOptions,
  compareTrees,
  doctorRows,
  headline,
  resolveBinary,
  runOutcome,
  type Verdict,
} from "./compare.ts";
import { describeSets } from "./file-sets.ts";
import type { Finding, Tally } from "./findings.ts";
import { type CheckSpec, REGISTRY } from "./registry.ts";
import { describeStore } from "./result-store.ts";
import { defined } from "./test-support.ts";

function git(root: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

/** A sandbox git repository with one commit holding `files`, and that
 * commit's id. */
function repoWith(files: Record<string, string>): { root: string; head: string } {
  const root = sandboxDir("qsm-langdev-compare-");
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "qsm test"]);
  write(root, files);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "base"]);
  return { root, head: git(root, ["rev-parse", "HEAD"]) };
}

function write(root: string, files: Record<string, string>): void {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
}

/** Everything a pre-commit run would see: the shipped side is the index, so
 * a test stages what it changed, as a commit would. */
function stage(root: string): void {
  git(root, ["add", "-A"]);
}

/** A repo whose gen.txt carries `attribute` in .gitattributes, with a marked
 * line added to gen.txt and a plain edit to a.txt staged. */
function stagedGeneratedChange(attribute: string): { root: string; head: string } {
  const { root, head } = repoWith({
    ".gitattributes": `gen.txt ${attribute}\n`,
    "a.txt": "alpha\n",
    "gen.txt": "generated\n",
  });
  write(root, { "gen.txt": `generated\n${MARKER} derived\n`, "a.txt": "alpha and more\n" });
  stage(root);
  return { root, head };
}

const MARKER = "BADLINE";

/** Every line holding the marker is one finding, identified by the text on
 * that line, never by its line number. Null on a line that is not grep's
 * `path:line:text`, so an unreadable run never reads as a clean tree. */
/** The order `Array#sort` gives lists of paths with no compare function. */
function byJoined(a: readonly string[], b: readonly string[]): number {
  const left = a.join(",");
  const right = b.join(",");
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

function countMarkers(stdout: string): Tally | null {
  const findings: Finding[] = [];
  const byPath: Record<string, number> = {};
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    const match = /^(.+?):(\d+):(.*)$/.exec(line);
    if (match === null) {
      return null;
    }
    const path = defined(match[1], "a path");
    const text = defined(match[3], "a text").trim();
    findings.push({ identity: text, locations: [{ path, line: Number(match[2]) }] });
    byPath[path] = (byPath[path] ?? 0) + 1;
  }
  return { total: findings.length, byPath, findings };
}

/** `fish` because it is declared configless: this checker's verdicts are
 * about the ratchet, not about whether a profile config is scaffolded. */
const MARKED: CheckSpec = {
  name: "marked",
  measures: { counts: "marked lines, one per line the fixture prints" },
  language: "fish",
  points: ["pre-commit", "pre-push", "ci"],
  extensions: [".txt"],
  binary: "grep",
  install: { bundled: "ships with the system" },
  fileSet: "changed",
  args: (files) => ["-Hn", MARKER, ...files],
  count: (stdout) => countMarkers(stdout),
};

/** `languages` is opt-in in production; a ratchet test is not about that
 * selection, so this always opts the registry's own languages in, the same
 * way a repository's gates.json would once it named them. */
function run(root: string, head: string | null, registry: readonly CheckSpec[] = [MARKED]) {
  return compareTrees(root, head, "worktree", {
    registry,
    at: "pre-commit",
    languages: [...new Set(registry.map((spec) => spec.language))],
  });
}

describe("compareTrees", () => {
  test("A new finding blocks", async () => {
    const { root, head } = repoWith({ "a.txt": "alpha\n" });
    write(root, { "a.txt": `alpha\n${MARKER} fresh\n` });
    stage(root);

    const { verdicts } = await run(root, head);

    expect(verdicts).toHaveLength(1);
    const only = defined(verdicts[0], "a verdict");
    expect(only.pass).toBe(false);
    expect(only.summary).toContain("marked: 0 -> 1");
    expect((only.lines ?? []).join("\n")).toContain("a.txt");
  });

  test("Moved code is not a new finding", async () => {
    const { root, head } = repoWith({
      "a.txt": `alpha\n${MARKER} one\n`,
      "b.txt": `${MARKER} two\n`,
    });
    write(root, { "a.txt": `inserted\ninserted\nalpha\n${MARKER} one\n` });
    renameSync(join(root, "b.txt"), join(root, "c.txt"));
    stage(root);

    const { verdicts } = await run(root, head);

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.pass).toBe(true);
    expect(verdicts[0]?.summary).toContain("marked: 2 -> 2");
  });

  test("A fix does not offset a new finding elsewhere", async () => {
    const { root, head } = repoWith({
      "a.txt": `${MARKER} one\n${MARKER} two\n`,
      "b.txt": "plain\n",
    });
    write(root, { "a.txt": "clean\n", "b.txt": `plain\n${MARKER} three\n` });
    stage(root);

    const { verdicts } = await run(root, head);

    expect(verdicts[0]?.pass).toBe(false);
    expect(verdicts[0]?.summary).toContain("marked: 2 -> 1");
    expect(verdicts[0]?.summary).toContain("b.txt 0 -> 1");
  });
});

describe("compareTrees: scored files", () => {
  test("Nothing the change touches is covered", async () => {
    const { root, head } = repoWith({ "a.txt": "alpha\n", "notes.md": "notes\n" });
    write(root, { "notes.md": "notes and more\n" });
    stage(root);

    const { changed, verdicts } = await run(root, head);

    expect(changed).toEqual(["notes.md"]);
    expect(verdicts).toEqual([]);
  });

  test("a path marked export-ignore is not scored: it is generated, not written", async () => {
    const { root, head } = stagedGeneratedChange("export-ignore");

    const { changed, verdicts } = await run(root, head);

    expect(changed).toEqual(["a.txt"]);
    expect(verdicts[0]?.pass).toBe(true);
  });

  test("a path marked linguist-generated is not scored, unless the checker guards safety", async () => {
    const { root, head } = stagedGeneratedChange("linguist-generated=true");

    const { verdicts } = await run(root, head);
    const guarding = await run(root, head, [{ ...MARKED, guardsSafety: true }]);

    expect(verdicts[0]?.pass).toBe(true);
    expect(guarding.verdicts[0]?.pass).toBe(false);
  });

  test("A checker's binary is absent", async () => {
    const { root, head } = repoWith({ "a.txt": "alpha\n" });
    write(root, { "a.txt": "alpha and more\n" });
    stage(root);
    const absent: CheckSpec = {
      ...MARKED,
      name: "absent",
      binary: "qsm-langdev-no-such-binary",
      install: { suggest: "install it with your package manager" },
    };

    const { verdicts } = await run(root, head, [absent]);

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.pass).toBe(false);
    expect(verdicts[0]?.missing).toBe(true);
    expect(verdicts[0]?.summary).toContain("install it with your package manager");
  });
});

/** A repo whose staged edit is `edit` over a.txt, with an empty, ignored node_modules/.bin. */
function stagedWithLocalBin(edit: string): { root: string; head: string; bin: string } {
  const { root, head } = repoWith({ "a.txt": "alpha\n", ".gitignore": "node_modules/\n" });
  write(root, { "a.txt": edit });
  stage(root);
  const bin = join(root, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  return { root, head, bin };
}

/** An executable `name` in `dir` that runs `body`. */
function executable(dir: string, name: string, body: string): void {
  writeFileSync(join(dir, name), body);
  chmodSync(join(dir, name), 0o755);
}

const SLOW_PROBE: CheckSpec = { ...MARKED, name: "slow-probe", binary: "qsm-langdev-slow-version" };

describe("compareTrees: checker availability", () => {
  test("a binary whose presence probe times out is not measured, never reported as not installed", async () => {
    const { root, head, bin } = stagedWithLocalBin("alpha and more\n");
    executable(bin, "qsm-langdev-slow-version", "#!/bin/sh\nexec sleep 5\n");

    const { verdicts } = await runWith(root, head, SLOW_PROBE, { probeTimeoutMs: 200 });

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.missing).toBeUndefined();
    expect(verdicts[0]?.notMeasured).toBe(true);
    expect(verdicts[0]?.summary).toBe(
      "slow-probe: not measured: 'qsm-langdev-slow-version --version' timed out after 0.2s; retry",
    );
  });

  test("under a deadline a stuck probe gets only what is left, so the run ends by the deadline", async () => {
    const { root, head, bin } = stagedWithLocalBin("alpha and more\n");
    executable(bin, "qsm-langdev-slow-version", "#!/bin/sh\nexec sleep 5\n");
    const started = performance.now();

    const { verdicts } = await runWith(root, head, SLOW_PROBE, { deadlineMs: started + 1500 });

    expect(verdicts[0]?.notMeasured).toBe(true);
    expect(performance.now() - started).toBeLessThan(2500);
  });

  test("doctor reports a binary whose probe times out as not measured, never as missing", async () => {
    const dir = sandboxDir("qsm-langdev-doctor-");
    executable(dir, "qsm-langdev-slow-version", "#!/bin/sh\nexec sleep 5\n");
    const savedPath = process.env.PATH;
    process.env.PATH = `${dir}:${savedPath ?? ""}`;
    try {
      const rows = await doctorRows([SLOW_PROBE], 200);

      expect(rows[0]).toMatchObject({ check: "slow-probe", present: false, timedOut: true });
    } finally {
      process.env.PATH = savedPath;
    }
  });

  test("the repository's node_modules/.bin copy of a checker wins over PATH", async () => {
    const { root, head, bin } = stagedWithLocalBin("alpha and more BADLINE\n");
    // a grep that PATH does not have, so only the local copy can answer
    executable(bin, "qsm-langdev-local-grep", '#!/bin/sh\nexec grep "$@"\n');
    expect(resolveBinary(root, "qsm-langdev-local-grep")).toBe(join(bin, "qsm-langdev-local-grep"));
    expect(resolveBinary(root, "grep")).toBe("grep");
    const local: CheckSpec = { ...MARKED, name: "local", binary: "qsm-langdev-local-grep" };

    const { verdicts } = await run(root, head, [local]);

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.missing).toBeUndefined();
    expect(verdicts[0]?.summary).toContain("local: 0 -> 1");
  });

  test("A selected language has no config in the repository", async () => {
    const { root, head } = repoWith({ "a.txt": "alpha\n" });
    write(root, { "a.txt": "alpha and more\n" });
    stage(root);
    const needsConfig: CheckSpec = { ...MARKED, name: "needs-config", language: "shell" };

    const { verdicts } = await run(root, head, [needsConfig]);

    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.pass).toBe(false);
    expect(verdicts[0]?.missingConfig).toBe(true);
    expect(verdicts[0]?.summary).toContain("qsm-langdev init");
  });
});

/** A checker that scores nothing and records the files each side handed it,
 * one sorted list per spawn, so a test can say exactly what a set held. */
function recorder(fileSet: CheckSpec["fileSet"], extensions: readonly string[] = [".ts"]) {
  const handed: string[][] = [];
  const spec: CheckSpec = {
    name: "recorder",
    measures: { counts: "nothing; the recorder only records what it was handed" },
    language: "fish",
    points: ["pre-commit", "pre-push", "ci"],
    extensions,
    binary: "printf",
    install: { bundled: "ships with the system" },
    fileSet,
    args: (files) => ["%s\\n", ...files],
    count: (stdout) => {
      handed.push(
        stdout
          .split("\n")
          .filter((line) => line !== "")
          .toSorted(),
      );
      return { total: 0 };
    },
  };
  return { spec, handed };
}

/** Opts `spec`'s own language in by default, same reasoning as `run` above;
 * an `options.languages` the caller passes still wins. */
function runWith(root: string, head: string | null, spec: CheckSpec, options: CompareOptions = {}) {
  return compareTrees(root, head, "worktree", {
    registry: [spec],
    at: "pre-commit",
    languages: [spec.language],
    ...options,
  });
}

describe("file sets", () => {
  test("A commit that touches two files", async () => {
    const { root, head } = repoWith({ "a.ts": "1\n", "b.ts": "2\n", "c.ts": "3\n" });
    write(root, { "a.ts": "1 more\n", "b.ts": "2 more\n" });
    stage(root);
    const { spec, handed } = recorder("changed");

    const { sets } = await runWith(root, head, spec);

    expect(handed).toEqual([
      ["a.ts", "b.ts"],
      ["a.ts", "b.ts"],
    ]);
    expect(describeSets(sets)).toContain("changed: 2 files");
  });

  test("A file that another file imports", async () => {
    const { root, head } = repoWith({
      "a.ts": "export const a = 1;\n",
      "b.ts": 'import { a } from "./a";\nexport const b = a;\n',
      "c.ts": 'import { b } from "./b";\nb;\n',
    });
    write(root, { "a.ts": "export const a = 2;\n" });
    stage(root);
    const { spec, handed } = recorder({ changedPlus: 1 });

    const { sets } = await runWith(root, head, spec);

    expect(handed).toEqual([
      ["a.ts", "b.ts"],
      ["a.ts", "b.ts"],
    ]);
    expect(describeSets(sets)).toContain("changed+1: 2 files");
  });
});

describe("file sets: whole project and changes", () => {
  test("The whole project on request", async () => {
    const { root, head } = repoWith({
      ".gitignore": "ignored.ts\n",
      "a.ts": "1\n",
      "src/b.ts": "2\n",
    });
    // ignored.ts and new.ts are untracked, so neither side is handed them
    write(root, { "a.ts": "1 more\n", "ignored.ts": "x\n", "new.ts": "n\n" });
    const { spec, handed } = recorder("given");

    const { sets } = await runWith(root, head, spec);

    expect(handed.toSorted(byJoined)).toEqual([
      ["a.ts", "src/b.ts"],
      ["a.ts", "src/b.ts"],
    ]);
    expect(describeSets(sets)).toContain("given: 3 files");
  });

  test("an untracked file is not measured: not in changed, not handed to a checker", async () => {
    const { root, head } = repoWith({ "a.ts": "1\n" });
    write(root, { "fresh.ts": "new\n" });
    const { spec, handed } = recorder("changed");

    const { changed } = await runWith(root, head, spec);

    expect(changed).toEqual([]);
    expect(handed).toEqual([]);
  });

  test("a file added to the index is in changed", async () => {
    const { root, head } = repoWith({ "a.ts": "1\n" });
    write(root, { "fresh.ts": "new\n" });
    stage(root);
    const { spec, handed } = recorder("changed");

    const { changed } = await runWith(root, head, spec);

    expect(changed).toEqual(["fresh.ts"]);
    expect(handed).toEqual([["fresh.ts"]]);
  });

  test("a rename is in changed under both names, each side scoring the one it holds", async () => {
    const { root, head } = repoWith({ "a.ts": "1\n", "b.ts": "moved\n" });
    renameSync(join(root, "b.ts"), join(root, "d.ts"));
    stage(root);
    const { spec, handed } = recorder("changed");

    const { changed } = await runWith(root, head, spec);

    expect(changed).toEqual(["b.ts", "d.ts"]);
    expect(handed.toSorted(byJoined)).toEqual([["b.ts"], ["d.ts"]]);
  });
});

describe("file sets: deletions and the reference", () => {
  test("a deleted file is in changed and scored on the reference side only", async () => {
    const { root, head } = repoWith({ "a.ts": "1\n", "b.ts": "2\n" });
    unlinkSync(join(root, "a.ts"));
    const { spec, handed } = recorder("changed");

    const { changed, verdicts } = await runWith(root, head, spec);

    expect(changed).toEqual(["a.ts"]);
    expect(handed).toEqual([["a.ts"]]);
    expect(verdicts[0]?.pass).toBe(true);
  });

  test("a checker whose set holds nothing it covers does not run, and says so", async () => {
    const { root, head } = repoWith({ "a.ts": "1\n", "docs/x.md": "doc\n" });
    write(root, { "a.ts": "1 more\n" });
    const { spec, handed } = recorder("given");

    const { sets, verdicts } = await runWith(root, head, spec, { given: ["docs"] });

    expect(handed).toEqual([]);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.skipped).toBe(true);
    expect(verdicts[0]?.summary).toContain("recorder: its given set holds no file it covers");
    expect(describeSets(sets)).toContain("given: 1 file");
  });

  test("changed is measured against the run's reference, not HEAD", async () => {
    const { root, head: base } = repoWith({ "a.ts": "1\n", "b.ts": "2\n", "c.ts": "3\n" });
    write(root, { "b.ts": "2 committed\n" });
    git(root, ["commit", "-qam", "second"]);
    write(root, { "a.ts": "1 working\n" });
    const { spec, handed } = recorder("changed");

    const { changed } = await runWith(root, base, spec);

    expect(changed).toEqual(["a.ts", "b.ts"]);
    expect(handed).toEqual([
      ["a.ts", "b.ts"],
      ["a.ts", "b.ts"],
    ]);
  });
});

describe("file sets: paths and languages", () => {
  test("given with a path names only the files under it", async () => {
    const { root, head } = repoWith({ "a.ts": "1\n", "src/b.ts": "2\n", "src/c.ts": "3\n" });
    write(root, { "a.ts": "1 more\n" });
    const { spec, handed } = recorder("given");

    const { sets } = await runWith(root, head, spec, { given: ["src/"] });

    // One spawn: src/ holds the same content on both sides, and no checker
    // scores the same content twice.
    expect(handed).toEqual([["src/b.ts", "src/c.ts"]]);
    expect(describeSets(sets)).toBe("changed: 1 file, given: 2 files");
  });

  test("a language with no import extractor is named in the report", async () => {
    const { root, head } = repoWith({ "run.sh": "echo 1\n" });
    write(root, { "run.sh": "echo 2\n" });
    const { spec } = recorder({ changedPlus: 1 }, [".sh"]);

    const { sets } = await runWith(root, head, spec);

    expect(describeSets(sets)).toContain("changed+1: 1 file (no import extractor: shell)");
  });
});

describe("the registry's file sets", () => {
  test("a whole-project tool declares given, the rest changed, semgrep's per-file engine included", () => {
    const given = REGISTRY.filter((spec) => spec.fileSet === "given").map((spec) => spec.name);
    expect(given.toSorted()).toEqual([
      "bun-check",
      "clippy",
      "depcruise",
      "dotnet",
      "dotnet-vulnerable",
      "jscpd",
      "knip",
      "pyright",
    ]);
    const rest = REGISTRY.filter((spec) => spec.fileSet !== "given");
    expect(rest.every((spec) => spec.fileSet === "changed")).toBe(true);
    const semgrep = REGISTRY.filter((spec) => spec.binary === "semgrep");
    expect(semgrep.map((spec) => spec.fileSet)).toEqual(semgrep.map(() => "changed"));
  });

  test("a checker whose answer comes over the network is never stored; semgrep's packs are fetched and keyed", () => {
    const notStored = REGISTRY.filter((spec) => spec.notStored !== undefined).map((s) => s.name);
    expect(notStored).toEqual(["dotnet-vulnerable"]);
    const semgrep = REGISTRY.filter((spec) => spec.binary === "semgrep");
    expect(semgrep.every((spec) => (spec.packs ?? []).length > 0)).toBe(true);
  });
});

// --- a checker past its time limit ---------------------------------------------

/** A checker that never answers inside a small limit: `sleep` outlives it. */
const SLOW: CheckSpec = {
  ...MARKED,
  name: "slow",
  binary: "sleep",
  args: () => ["5"],
  count: () => ({ total: 0 }),
};

test("A timeout stops the launcher's engine child", async () => {
  const { root, head } = repoWith({ "a.txt": "alpha\n" });
  write(root, { "a.txt": "alpha and more\n" });
  stage(root);

  const engines = sandboxDir("qsm-langdev-engines-");
  const checker: CheckSpec = {
    ...SLOW,
    binary: "sh",
    args: () => ["-c", `sleep 5 &\nprintf '%s' "$!" > '${engines}/engine.'$$\nwait`],
  };
  try {
    const { verdicts } = await runWith(root, head, checker, { timeoutMs: 200 });
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.notMeasured).toBe(true);
    expect(verdicts[0]?.summary).toBe("slow: not measured: timed out after 0.2s; retry");
    expect(headline(defined(verdicts[0], "a verdict"))).not.toContain("WORSE");
    const pids = readdirSync(engines).map((file) => readFileSync(join(engines, file), "utf8"));
    expect(pids).toHaveLength(2);
    for (const pid of pids) {
      const state = spawnSync("ps", ["-o", "stat=", "-p", pid], { encoding: "utf8" }).stdout.trim();
      expect(state === "" || state.startsWith("Z")).toBe(true);
    }
  } finally {
    for (const file of readdirSync(engines)) {
      const pid = Number(readFileSync(join(engines, file), "utf8"));
      try {
        process.kill(pid, "SIGKILL");
      } catch (cause) {
        expect(cause).toHaveProperty("code", "ESRCH");
      }
    }
  }
});

test("time limit: the checkers after one not measured still run, so the report is whole", async () => {
  const { root, head } = repoWith({ "a.txt": "alpha\n" });
  write(root, { "a.txt": `alpha\n${MARKER} fresh\n` });
  stage(root);

  const { verdicts } = await compareTrees(root, head, "worktree", {
    registry: [SLOW, MARKED],
    languages: ["fish"],
    at: "pre-commit",
    timeoutMs: 200,
    jobs: 1,
  });

  expect(verdicts.map((v) => [v.check, v.notMeasured === true, v.pass])).toEqual([
    ["slow", true, false],
    ["marked", false, false],
  ]);
});

test("time limit: a run with a checker not measured is blocked, and a worse one still worse", () => {
  const unmeasured: Verdict = { check: "slow", pass: false, notMeasured: true, summary: "slow: …" };
  const worse: Verdict = { check: "marked", pass: false, summary: "marked: 0 -> 1" };
  const fine: Verdict = { check: "fine", pass: true, summary: "fine: 0 -> 0" };

  expect(runOutcome([unmeasured, fine], true)).toEqual({ code: "blocked", deciding: [unmeasured] });
  expect(runOutcome([unmeasured, worse], true)).toEqual({ code: "worse", deciding: [worse] });
  expect(runOutcome([unmeasured], false).code).toBe("blocked");
  expect(runOutcome([worse], false).code).toBe("ok");
  expect(runOutcome([fine], true)).toEqual({ code: "ok", deciding: [] });
});

// --- the result store ---------------------------------------------------------

const RESULTS = join(".qsm-langdev", "results");

/** The entry files the store holds for `checker` at `point`, sorted. */
function entries(root: string, checker = "recorder", point = "pre-commit"): string[] {
  const dir = join(root, RESULTS, checker, point);
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .toSorted()
    : [];
}

/** A checker binary in the sandbox's node_modules/.bin that answers
 * `--version` with the content of `version` next to it (or refuses when
 * that file is absent) and otherwise prints its file arguments, one a line. */
function localPrinter(root: string, name: string): string {
  const bin = join(root, "node_modules", ".bin");
  mkdirSync(bin, { recursive: true });
  const script = join(bin, name);
  writeFileSync(
    script,
    [
      "#!/bin/sh",
      'if [ "$1" = --version ]; then',
      '  [ -f "$(dirname "$0")/version" ] || exit 3',
      '  cat "$(dirname "$0")/version"; exit 0',
      "fi",
      'shift; printf "%s\\n" "$@"',
      "",
    ].join("\n"),
  );
  chmodSync(script, 0o755);
  return bin;
}

function commitAll(root: string, message: string): string {
  stage(root);
  git(root, ["commit", "-q", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

/** A sandbox whose only commit holds `files`, with `a.ts` then changed to
 * `2` and staged: the one change every store test starts from. */
function changedRepo(files?: Record<string, string>) {
  const { root, head } = repoWith(files ?? { "a.ts": "1\n" });
  write(root, { "a.ts": "2\n" });
  stage(root);
  return { root, head };
}

// Each store test is its own behaviour, at the top level.

test("The first run in a fresh worktree", async () => {
  const { root, head } = changedRepo();
  const { spec, handed } = recorder("changed");

  const { store } = await runWith(root, head, spec);

  expect(handed).toEqual([["a.ts"], ["a.ts"]]);
  expect(entries(root)).toHaveLength(2);
  expect(describeStore(store)).toEqual([
    "store: recorder: reference scored, shipped scored",
    "store: 0 hits, 2 scored",
  ]);
});

test("store: the same content again is a hit on both sides: nothing scores", async () => {
  const { root, head } = changedRepo();
  const { spec, handed } = recorder("changed");
  await runWith(root, head, spec);

  const { store, verdicts } = await runWith(root, head, spec);

  expect(handed).toHaveLength(2);
  expect(verdicts[0]?.pass).toBe(true);
  expect(describeStore(store)).toEqual([
    "store: recorder: reference hit, shipped hit",
    "store: 2 hits, 0 scored",
  ]);
});

test("The next commit", async () => {
  const { root, head: base } = changedRepo();
  const { spec, handed } = recorder("changed");
  await runWith(root, base, spec);
  const head = commitAll(root, "second");
  write(root, { "a.ts": "3\n" });
  stage(root);

  const { store } = await runWith(root, head, spec);

  expect(handed).toEqual([["a.ts"], ["a.ts"], ["a.ts"]]);
  expect(describeStore(store)[0]).toBe("store: recorder: reference hit, shipped scored");
});

test("store: only b.ts changed after a.ts was stored: a.ts is not scored, the store keeps this run's entries", async () => {
  const { root, head: base } = changedRepo({ "a.ts": "1\n", "b.ts": "1\n" });
  const { spec, handed } = recorder("changed");
  await runWith(root, base, spec);
  const first = entries(root);
  const head = commitAll(root, "second");
  write(root, { "b.ts": "2\n" });
  stage(root);

  await runWith(root, head, spec);

  expect(handed.slice(2)).toEqual([["b.ts"], ["b.ts"]]);
  const second = entries(root);
  expect(second).toHaveLength(2);
  expect(second.filter((entry) => first.includes(entry))).toEqual([]);
});

/** The recorder over `changed` at pre-commit and over `given`, the whole
 * tree, at pre-push: one checker name, two argv-alike runs over two sets. */
function twoPointRecorder() {
  const { spec: plain, handed } = recorder("changed");
  const spec: CheckSpec = { ...plain, prePush: { fileSet: "given" } };
  return { spec, handed };
}

const PUSH: CompareOptions = { at: "pre-push" };

test("A commit between two pushes", async () => {
  const { root, head } = changedRepo({ "a.ts": "1\n", "b.ts": "1\n" });
  const { spec, handed } = twoPointRecorder();
  await runWith(root, head, spec, { ...RULES, ...PUSH });
  await runWith(root, head, spec);

  const { store } = await runWith(root, head, spec, { ...RULES, ...PUSH });

  expect(handed).toHaveLength(4);
  expect(describeStore(store)[0]).toBe("store: recorder: reference hit, shipped hit");
});

test("store: a commit prunes its own unused entries and leaves the push's alone", async () => {
  const { root, head } = changedRepo({ "a.ts": "1\n", "b.ts": "1\n" });
  const { spec } = twoPointRecorder();
  await runWith(root, head, spec, { ...RULES, ...PUSH });
  const pushed = entries(root, "recorder", "pre-push");
  await runWith(root, head, spec);
  const committed = entries(root);
  write(root, { "a.ts": "3\n" });
  stage(root);

  await runWith(root, head, spec);

  expect(pushed).toHaveLength(2);
  expect(entries(root, "recorder", "pre-push")).toEqual(pushed);
  const now = entries(root);
  expect(now).toHaveLength(2);
  expect(now.filter((entry) => committed.includes(entry))).toHaveLength(1);
});

test("store: an entry from before the store kept points apart is removed by the next run", async () => {
  const { root, head } = changedRepo();
  const { spec } = recorder("changed");
  const flat = join(root, RESULTS, "recorder", `${"0".repeat(64)}.json`);
  mkdirSync(dirname(flat), { recursive: true });
  writeFileSync(flat, "{}");

  await runWith(root, head, spec);

  expect(existsSync(flat)).toBe(false);
  expect(entries(root)).toHaveLength(2);
});

test("A new ruleset", async () => {
  const { root, head: base } = changedRepo({ "a.ts": "1\n", "rules.cfg": "strict = false\n" });
  const { spec: plain, handed } = recorder("changed");
  const spec: CheckSpec = { ...plain, configFiles: ["rules.cfg"] };
  await runWith(root, base, spec);
  const before = entries(root);
  write(root, { "rules.cfg": "strict = true\n" });
  git(root, ["commit", "-q", "-m", "rules", "rules.cfg"]);

  await runWith(root, git(root, ["rev-parse", "HEAD"]), spec);

  expect(handed).toHaveLength(4);
  const after = entries(root);
  expect(after).toHaveLength(2);
  expect(after.filter((entry) => before.includes(entry))).toEqual([]);
});

test("store: a per-file checker scores only the file whose content it has not seen", async () => {
  const { root, head } = repoWith({ "a.ts": "1\n", "b.ts": "1\n" });
  write(root, { "a.ts": "2\n", "b.ts": "2\n" });
  stage(root);
  const { spec: plain, handed } = recorder("changed");
  const spec: CheckSpec = { ...plain, eachFile: true };
  await runWith(root, head, spec);
  expect(handed).toHaveLength(4);
  write(root, { "b.ts": "3\n" });
  stage(root);

  const { store } = await runWith(root, head, spec);

  expect(handed.slice(4)).toEqual([["b.ts"]]);
  expect(describeStore(store)[0]).toBe(
    "store: recorder: reference 2 hits, shipped 1 hit, 1 scored",
  );
});

test("store: a per-set checker scores its whole set again when any file in it changed", async () => {
  const { root, head } = repoWith({ "a.ts": "1\n", "b.ts": "1\n" });
  write(root, { "a.ts": "2\n", "b.ts": "2\n" });
  stage(root);
  const { spec, handed } = recorder("changed");
  await runWith(root, head, spec);
  write(root, { "b.ts": "3\n" });
  stage(root);

  await runWith(root, head, spec);

  expect(handed.slice(2)).toEqual([["a.ts", "b.ts"]]);
});

test("store: a new tool version misses the store", async () => {
  const { root, head } = changedRepo({ ".gitignore": "node_modules/\n", "a.ts": "1\n" });
  const bin = localPrinter(root, "qsm-langdev-versioned");
  writeFileSync(join(bin, "version"), "1.0.0\n");
  const { spec: plain, handed } = recorder("changed");
  const spec: CheckSpec = { ...plain, binary: "qsm-langdev-versioned" };
  await runWith(root, head, spec);
  writeFileSync(join(bin, "version"), "1.0.1\n");

  await runWith(root, head, spec);

  expect(handed).toHaveLength(4);
});

test("store: a config file changed in the working tree misses on the shipped side only", async () => {
  const { root, head } = changedRepo({ "a.ts": "1\n", "rules.cfg": "strict = false\n" });
  const { spec: plain, handed } = recorder("changed");
  const spec: CheckSpec = { ...plain, configFiles: ["rules.cfg"] };
  await runWith(root, head, spec);
  write(root, { "rules.cfg": "strict = true\n" });
  stage(root);

  const { store } = await runWith(root, head, spec);

  expect(handed).toHaveLength(3);
  expect(describeStore(store)[0]).toBe("store: recorder: reference hit, shipped scored");
});

test("store: a checker whose version cannot be read is never stored, and the report says so", async () => {
  const { root, head } = changedRepo({ ".gitignore": "node_modules/\n", "a.ts": "1\n" });
  localPrinter(root, "qsm-langdev-unversioned");
  const { spec: plain, handed } = recorder("changed");
  const spec: CheckSpec = { ...plain, binary: "qsm-langdev-unversioned" };
  await runWith(root, head, spec);

  const { store, verdicts } = await runWith(root, head, spec);

  expect(verdicts[0]?.pass).toBe(true);
  expect(handed).toHaveLength(4);
  expect(entries(root)).toEqual([]);
  expect(describeStore(store)[0]).toBe(
    "store: recorder: not stored (qsm-langdev-unversioned --version gave no version): reference scored, shipped scored",
  );
});

test("store: a checker that declares it is not stored always scores, and the report names why", async () => {
  const { root, head } = changedRepo();
  const { spec: plain, handed } = recorder("changed");
  const spec: CheckSpec = { ...plain, notStored: "its rules come from the network" };
  await runWith(root, head, spec);

  const { store } = await runWith(root, head, spec);

  expect(handed).toHaveLength(4);
  expect(entries(root)).toEqual([]);
  expect(describeStore(store)[0]).toContain("not stored (its rules come from the network)");
});

test("store: an unreadable or wrong-shaped entry is a miss, never a crash", async () => {
  const { root, head } = changedRepo();
  const { spec, handed } = recorder("changed");
  await runWith(root, head, spec);
  const [one, two] = entries(root);
  writeFileSync(
    join(root, RESULTS, "recorder", "pre-commit", defined(one, "an entry")),
    "{not json",
  );
  writeFileSync(
    join(root, RESULTS, "recorder", "pre-commit", defined(two, "a second entry")),
    JSON.stringify({ shape: 1, tally: { total: "many" }, output: "" }),
  );

  const { verdicts } = await runWith(root, head, spec);

  expect(verdicts[0]?.pass).toBe(true);
  expect(handed).toHaveLength(4);
});

test("store: a failed run is not stored", async () => {
  const { root, head } = changedRepo();
  const { spec: plain } = recorder("changed");
  const spec: CheckSpec = { ...plain, count: () => null };

  const { verdicts } = await runWith(root, head, spec);

  expect(verdicts[0]?.pass).toBe(false);
  expect(entries(root)).toEqual([]);
});

test("store: the store ignores itself: git sees nothing new after a run", async () => {
  const { root, head } = changedRepo();
  const { spec } = recorder("changed");

  await runWith(root, head, spec);

  expect(readFileSync(join(root, RESULTS, ".gitignore"), "utf8")).toBe("*\n");
  const status = git(root, ["status", "--porcelain", "--untracked-files=all"]);
  expect(status).not.toContain(".qsm-langdev");
});

// --- rule packs fetched once per run ---------------------------------------------

/** A recorder that names a rule pack, and what its args were handed for
 * the pack each spawn: the local rules file's content, or the pack's own
 * name when the run had none. */
function packed(pack = "p/x") {
  const { spec: plain, handed } = recorder("changed");
  const configs: string[] = [];
  const spec: CheckSpec = {
    ...plain,
    packs: [pack],
    args: (files, _root, _reportDir, rules) => {
      const local = rules?.get(pack);
      if (rules !== undefined) {
        configs.push(local === undefined ? pack : readFileSync(local, "utf8"));
      }
      return ["%s\\n", ...files];
    },
  };
  return { spec, handed, configs };
}

/** A pack source that answers each fetch with the next of `texts`. */
function packSource(...texts: string[]) {
  const fetched: string[] = [];
  const fetchPack = (pack: string): Promise<string> => {
    fetched.push(pack);
    return Promise.resolve(
      defined(texts[Math.min(fetched.length, texts.length) - 1], "a pack text"),
    );
  };
  return { fetchPack, fetched };
}

test("packs: each pack is fetched once per run, and the checker runs the local copy", async () => {
  const { root, head } = changedRepo();
  const { spec, configs } = packed();
  const source = packSource("rules: [one]\n");

  const { verdicts } = await runWith(root, head, spec, { fetchPack: source.fetchPack });

  expect(verdicts[0]?.pass).toBe(true);
  expect(source.fetched).toEqual(["p/x"]);
  expect(configs).toEqual(["rules: [one]\n", "rules: [one]\n"]);
});

test("packs: the same pack content again is a hit; a changed pack misses on both sides", async () => {
  const { root, head } = changedRepo();
  const { spec, handed } = packed();
  const source = packSource("rules: [one]\n", "rules: [one]\n", "rules: [two]\n");

  await runWith(root, head, spec, { fetchPack: source.fetchPack });
  const { store } = await runWith(root, head, spec, { fetchPack: source.fetchPack });
  expect(handed).toHaveLength(2);
  expect(describeStore(store)[0]).toBe("store: recorder: reference hit, shipped hit");

  await runWith(root, head, spec, { fetchPack: source.fetchPack });

  expect(handed).toHaveLength(4);
});

test("packs: a single rule r/<id> is fetched once, run from its local copy, and stored like a pack", async () => {
  const { root, head } = changedRepo();
  const { spec, handed, configs } = packed("r/bash.x.y");
  const source = packSource("rules: [one]\n");

  await runWith(root, head, spec, { fetchPack: source.fetchPack });
  const { store } = await runWith(root, head, spec, { fetchPack: source.fetchPack });

  expect(source.fetched).toEqual(["r/bash.x.y", "r/bash.x.y"]);
  expect(configs).toEqual(["rules: [one]\n", "rules: [one]\n"]);
  expect(handed).toHaveLength(2);
  expect(describeStore(store)[0]).toBe("store: recorder: reference hit, shipped hit");
});

test("packs: a pack that cannot be fetched runs from the registry, unstored, and the report says so", async () => {
  const { root, head } = changedRepo();
  const { spec, handed, configs } = packed();
  const fetchPack = () => Promise.reject(new Error("offline"));
  await runWith(root, head, spec, { fetchPack });

  const { store } = await runWith(root, head, spec, { fetchPack });

  expect(handed).toHaveLength(4);
  expect(configs).toEqual(["p/x", "p/x", "p/x", "p/x"]);
  expect(entries(root)).toEqual([]);
  expect(describeStore(store)[0]).toContain("not stored (p/x could not be fetched: offline");
});

test("packs: an empty answer is not a pack: the checker is unstored, never run with no rules", async () => {
  const { root, head } = changedRepo();
  const { spec, configs } = packed();

  const { store } = await runWith(root, head, spec, { fetchPack: () => Promise.resolve("\n") });

  expect(configs).toEqual(["p/x", "p/x"]);
  expect(describeStore(store)[0]).toContain("p/x could not be fetched: the answer was empty");
});

// --- the semgrep engine -------------------------------------------------------

/** How the stand-in answers under one engine: `ok` reports one finding per
 * scored file holding the marker, exiting 1 when there is one, as semgrep
 * does under `--error`-like flags; `fail` is semgrep failing the way a
 * rejected token does under `--json --quiet` (measured on 1.153.1): the cause
 * in the JSON errors, no results, nothing on stderr, exit 7; `timeout` is semgrep
 * hitting its native rule timeout, which it labels a warning, while it still
 * holds findings in the JSON results. */
type FakeEngine = "ok" | "fail" | "timeout";

const REJECTED = "Failed to download configuration from https://semgrep.dev/c/p/x HTTP 401.";

/** A stand-in semgrep: answers `--version`, writes every other argv to its
 * own file, one argument per line, and answers as `engines` says for the
 * engine the argv asks for. A directory target is searched through, as
 * semgrep scans one. */
function fakeSemgrep(engines: { pro?: FakeEngine; community?: FakeEngine } = {}) {
  const dir = sandboxDir("qsm-langdev-fake-semgrep-");
  const binary = join(dir, "semgrep");
  const failure = JSON.stringify({
    results: [],
    errors: [{ code: 2, level: "error", type: "SemgrepError", message: REJECTED }],
  });
  const finding = String.raw`{\"check_id\":\"r\",\"path\":\"$1\",\"start\":{\"line\":1,\"col\":1}}`;
  writeFileSync(
    binary,
    [
      "#!/bin/sh",
      'if [ "$1" = "--version" ]; then echo 1.153.1; exit 0; fi',
      `printf '%s\\n' "$@" > '${dir}'/call.$$`,
      `mode=${engines.community ?? "ok"}`,
      `if [ "$1" = "--pro" ]; then mode=${engines.pro ?? "ok"}; fi`,
      `if [ "$mode" = fail ]; then echo '${failure}'; exit 7; fi`,
      'found=""',
      `hit() { found="\${found:+$found,}${finding}"; }`,
      'for f in "$@"; do',
      `  if [ -f "$f" ] && grep -q ${MARKER} "$f"; then hit "$f"`,
      `  elif [ -d "$f" ]; then for g in $(grep -rl ${MARKER} "$f"); do hit "$g"; done; fi`,
      "done",
      String.raw`if [ "$mode" = timeout ]; then echo "{\"results\":[$found],\"errors\":[{\"code\":4,\"level\":\"warn\",\"type\":\"Timeout\",\"message\":\"semgrep timed out\"}]}"; else echo "{\"results\":[$found],\"errors\":[]}"; fi`,
      'if [ -n "$found" ]; then exit 1; fi',
      "",
    ].join("\n"),
  );
  chmodSync(binary, 0o755);
  const calls = (): string[][] =>
    readdirSync(dir)
      .filter((f) => f.startsWith("call."))
      .map((f) => readFileSync(join(dir, f), "utf8").trimEnd().split("\n"));
  return { binary, calls };
}

/** A registry semgrep checker run by the stand-in, under a configless
 * language so no profile config is asked for. */
function semgrepSpec(name: string, binary: string): CheckSpec {
  const spec = REGISTRY.find((one) => one.name === name);
  if (spec === undefined) {
    throw new Error(`${name} is registered`);
  }
  return { ...spec, language: "fish", binary };
}

/** a.ts changed; b.ts imports it, c.ts imports b.ts, d.ts imports c.ts. */
function importChain() {
  const { root, head } = repoWith({
    "a.ts": "export const a = 1;\n",
    "b.ts": 'import { a } from "./a";\nexport const b = a;\n',
    "c.ts": 'import { b } from "./b";\nexport const c = b;\n',
    "d.ts": 'import { c } from "./c";\nc;\n',
  });
  write(root, { "a.ts": "export const a = 2;\n" });
  stage(root);
  return { root, head };
}

const RULES: CompareOptions = { fetchPack: () => Promise.resolve("rules: []\n") };

/** The files each call scored: its arguments that are paths in the tree. */
const scored = (calls: string[][]): string[][] =>
  calls
    .map((call) => call.filter((arg) => /^[a-z]\.(ts|py|cs|sh)$/.test(arg)))
    .toSorted((x, y) => x.join().localeCompare(y.join()));

test.each(["pre-commit", "pre-push"] as const)(
  "semgrep scans the changed files with the community engine at %s, whatever the login",
  async (at) => {
    const { root, head } = importChain();
    const semgrep = fakeSemgrep();

    const { warnings } = await runWith(root, head, semgrepSpec("semgrep-ts", semgrep.binary), {
      ...RULES,
      at,
    });

    expect(semgrep.calls().some((call) => call.includes("--pro"))).toBe(false);
    expect(scored(semgrep.calls())).toEqual([["a.ts"], ["a.ts"]]);
    expect(warnings).toEqual([]);
  },
);

// --- a checker run that failed ------------------------------------------------

test("failed run: a checker whose output cannot be read is not measured, its stderr the cause", async () => {
  const { root, head } = repoWith({ "a.txt": "alpha\n" });
  write(root, { "a.txt": `alpha\n${MARKER} fresh\n` });
  stage(root);
  const broken: CheckSpec = {
    ...MARKED,
    name: "broken",
    binary: "sh",
    args: () => [
      "-c",
      "echo 'not a finding'; printf '\\n ── \\n  boom: config broken  \\nmore\\n' >&2; exit 2",
    ],
  };

  const { verdicts } = await runWith(root, head, broken);

  expect(verdicts.map((v) => [v.notMeasured === true, v.summary])).toEqual([
    [true, "broken: not measured: boom: config broken; retry"],
  ]);
  expect(runOutcome(verdicts, true).code).toBe("blocked");
});

test("failed run: a Python crash is named by its exception, not by the Traceback line", async () => {
  const { root, head } = repoWith({ "a.txt": "alpha\n" });
  write(root, { "a.txt": `alpha\n${MARKER} fresh\n` });
  stage(root);
  const crashed: CheckSpec = {
    ...MARKED,
    name: "crashed",
    binary: "sh",
    args: () => [
      "-c",
      "echo 'not a finding'; printf 'Traceback (most recent call last):\\n  File \"x.py\", line 1\\nModuleNotFoundError: No module named y\\n' >&2; exit 2",
    ],
  };

  const { verdicts } = await runWith(root, head, crashed);

  expect(verdicts.map((v) => v.summary)).toEqual([
    "crashed: not measured: ModuleNotFoundError: No module named y; retry",
  ]);
});

test("failed run: a checker killed by a signal is not measured, never worse", async () => {
  const { root, head } = repoWith({ "a.txt": "alpha\n" });
  write(root, { "a.txt": `alpha\n${MARKER} fresh\n` });
  stage(root);
  const killed: CheckSpec = {
    ...MARKED,
    name: "killed",
    binary: "sh",
    args: () => ["-c", "kill -KILL $$"],
  };

  const { verdicts } = await runWith(root, head, killed);

  expect(verdicts.map((v) => [v.notMeasured === true, v.summary])).toEqual([
    [true, "killed: not measured: sh killed by SIGKILL; retry"],
  ]);
  expect(runOutcome(verdicts, true).code).toBe("blocked");
});

test.each(["ok", "timeout"] as const)("Semgrep findings at a non-zero exit: %s", async (mode) => {
  const { root, head } = importChain();
  write(root, { "a.ts": `export const a = 2; // ${MARKER}\n` });
  stage(root);
  const semgrep = fakeSemgrep({ community: mode });
  const spec = semgrepSpec("semgrep-ts", semgrep.binary);
  const { verdicts, warnings } = await runWith(root, head, spec, { ...RULES, ...PUSH });

  if (mode === "ok") {
    expect(verdicts.map((v) => [v.pass, v.notMeasured === true, v.summary])).toEqual([
      [false, false, "semgrep-ts: 0 -> 1; worse: a.ts 0 -> 1; 1 new"],
    ]);
    expect(warnings).toEqual([]);
    expect(runOutcome(verdicts, true).code).toBe("worse");
    return;
  }

  const again = await runWith(root, head, spec, { ...RULES, ...PUSH });

  expect(verdicts.map((v) => [v.pass, v.notMeasured === true, v.summary])).toEqual([
    [false, true, "semgrep-ts: not measured: semgrep timed out; retry"],
  ]);
  expect(runOutcome(verdicts, true).code).toBe("blocked");
  expect(headline(defined(verdicts[0], "a verdict"))).not.toContain("WORSE");
  expect(describeStore(again.store).at(-1)).toStartWith("store: 0 hits,");
  expect(entries(root, "semgrep-ts", "pre-push")).toEqual([]);
});

describe("compareTrees: run times", () => {
  const timingLines = (root: string): string[] =>
    readFileSync(join(root, ".qsm-langdev", "timings", "pre-commit.jsonl"), "utf8")
      .trim()
      .split("\n");

  test("a run over its target is reported slow and still passes; a store hit is no run", async () => {
    const { root, head } = repoWith({ "a.txt": "alpha\n" });
    write(root, { "a.txt": "alpha and more\n" });
    stage(root);

    const first = await runWith(root, head, MARKED, { targetMs: 0 });
    const again = await runWith(root, head, MARKED, { targetMs: 0 });

    expect(first.verdicts.map((v) => v.pass)).toEqual([true]);
    const slow = first.warnings.filter((w) => w.startsWith("slow: "));
    expect(slow).toHaveLength(1);
    expect(slow[0]).toMatch(/^slow: marked \d+\.\d s at pre-commit, target 0\.0 s$/);
    expect(again.warnings.filter((w) => w.startsWith("slow: "))).toEqual([]);
    expect(timingLines(root)).toHaveLength(1);
  });

  test("the timings keep the last ten runs of a checker", async () => {
    const { root, head } = repoWith({ "a.txt": "alpha\n" });
    for (let attempt = 0; attempt < 12; attempt += 1) {
      write(root, { "a.txt": `alpha ${attempt}\n` });
      stage(root);
      await runWith(root, head, MARKED);
    }

    const lines = timingLines(root);
    expect(lines).toHaveLength(10);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({ checker: "marked" });
  });
});
