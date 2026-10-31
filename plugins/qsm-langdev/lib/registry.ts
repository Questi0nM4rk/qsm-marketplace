// The check registry: one data table, language -> binary -> invocation -> parser -> install hint.

import { existsSync, readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import {
  countBanditJson,
  countClippy,
  countDepcruise,
  countDevskim,
  countDiagnosticLines,
  countDotnetDiagnostics,
  countDotnetFormatReport,
  countFileList,
  countJscpd,
  countKnip,
  countLizard,
  countMarkdownlint,
  countOxlint,
  countNonZeroExits,
  countPyright,
  countRuff,
  countRuffFormat,
  countSarif,
  countSemgrep,
  countShellcheck,
  countShellMetrics,
  countTaplo,
  countTsc,
  countVulnerable,
  countVulture,
  countYamllint,
  semgrepFailure,
  type Tally,
} from "./findings.ts";

/** Spawns run at once, one per core: two sides of every checker are
 * independent work. */
export const JOBS = Math.max(1, availableParallelism());

/** clippy's rule set, passed on the command line because clippy has nowhere
 * else to read it: clippy.toml carries thresholds, not lint levels, and the
 * `[lints]` table belongs to the repository's Cargo.toml, which is not ours to
 * rewrite. Deny, never warn — a warning is a finding nobody decided about.
 *
 * Every lint clippy ships is denied except the two groups and the two lints
 * named here, and each carries why.
 *
 * `all` is correctness, suspicious, style, complexity and perf. `pedantic` is
 * the smell tier. `cargo` reads the manifest. The general and strict profiles
 * deny the same set: rust strictness is the two thresholds in clippy.toml,
 * cognitive complexity and argument count, which is where that axis already
 * lives.
 *
 * `nursery` is off because clippy itself calls it unstable, the argument that
 * keeps oxlint's nursery off. `restriction` is off because it is not a quality
 * set: it holds lints that contradict each other, and clippy ships
 * `blanket_clippy_restriction_lints` to say so. */
const CLIPPY_LINTS: readonly string[] = [
  "-D",
  "clippy::all",
  "-D",
  "clippy::pedantic",
  "-D",
  "clippy::cargo",
  // A transitive dependency's version, decided by the dependency, not by the
  // code under review.
  "-A",
  "clippy::multiple_crate_versions",
  // Publishing metadata: description, license, repository. A crate that never
  // goes to crates.io owes none of it.
  "-A",
  "clippy::cargo_common_metadata",
];

/** `multi` and `docs` are always enabled; the rest toggle via the languages
 * selection in gates.json. */
export interface LanguageInfo {
  /** Enabled regardless of selection — nobody picks a language in order to
   * stop linting their YAML. */
  alwaysOn?: true;
  /** What people type for the language; `languages add` and `--lang` both
   * resolve through this list. */
  aliases?: readonly string[];
  /** adapters/claude/modules/<module> carrying this language's dev skill.
   * null = deliberately module-less. */
  module: string | null;
  /** A tracked file with one of these extensions means the tree holds this
   * language, so `init` scaffolds its configs. Source extensions only. */
  detects?: readonly string[];
  /** Every checker of this language reads no configuration file, so a
   * profile shipping nothing for it is complete rather than incomplete. */
  configless?: true;
}

const LANGUAGE_NAMES = [
  "docs",
  "multi",
  "ts",
  "py",
  "dotnet",
  "shell",
  "zsh",
  "fish",
  "rust",
] as const;

export type Language = (typeof LANGUAGE_NAMES)[number];
export const LANGUAGES: readonly Language[] = LANGUAGE_NAMES;

export const LANGUAGE_TABLE = {
  docs: { alwaysOn: true, module: null },
  multi: { alwaysOn: true, module: null },
  ts: {
    aliases: ["typescript", "javascript", "js"],
    module: "qsm-langdev-ts",
    detects: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
  },
  py: { aliases: ["python"], module: "qsm-langdev-py", detects: [".py", ".pyi"] },
  dotnet: { aliases: ["csharp", "cs"], module: "qsm-langdev-dotnet", detects: [".cs"] },
  shell: { aliases: ["sh", "bash"], module: "qsm-langdev-shell", detects: [".sh", ".bash"] },
  zsh: { module: "qsm-langdev-zsh", detects: [".zsh"] },
  fish: { configless: true, module: "qsm-langdev-fish", detects: [".fish"] },
  rust: { module: null, detects: [".rs"] },
} as const satisfies Record<Language, LanguageInfo>;

export function isLanguage(name: unknown): name is Language {
  return LANGUAGES.some((language) => language === name);
}

export function isConfigless(language: Language): boolean {
  const info: LanguageInfo = LANGUAGE_TABLE[language];
  return info.configless === true;
}

/** The language a user-typed name means: the name itself or one of its
 * aliases; null when it is neither. */
export function resolveLanguage(name: string): Language | null {
  if (isLanguage(name)) {
    return name;
  }
  for (const language of LANGUAGES) {
    const info: LanguageInfo = LANGUAGE_TABLE[language];
    if (info.aliases?.includes(name) === true) {
      return language;
    }
  }
  return null;
}

/** The git hooks langdev installs and runs gates at. */
export type EnforcementPoint = "pre-commit" | "pre-push";
export const ENFORCEMENT_POINTS: readonly EnforcementPoint[] = ["pre-commit", "pre-push"];

/** Where a checker runs: the edit hook, the two git hooks, and CI. */
export type Point = "edit" | EnforcementPoint | "ci";
export const POINT_NAMES: readonly Point[] = ["edit", "pre-commit", "pre-push", "ci"];

/**
 * Per point, the time one checker is meant to finish under (a run over it is reported slow and
 * goes on) and the time after which a run is taken for stuck. The edit hook is a function hook, and
 * the engine gives every hook 10 s that no plugin can raise, so the edit checkers share what is left
 * of 7.5 s from the binary's start, the rest going to the start and the fixers.
 */
export const POINTS = {
  edit: { targetMs: 5_000, timeoutMs: 7_500 },
  "pre-commit": { targetMs: 30_000, timeoutMs: 300_000 },
  "pre-push": { targetMs: 60_000, timeoutMs: 300_000 },
  ci: { targetMs: 600_000, timeoutMs: 1_200_000 },
} as const satisfies Record<Point, { targetMs: number; timeoutMs: number }>;

/** A point that compares two trees and stores results; the edit point checks in place. */
export type ComparedPoint = Exclude<Point, "edit">;

const FROM_COMMIT: readonly Point[] = ["pre-commit", "pre-push", "ci"];
const FROM_PUSH: readonly Point[] = ["pre-push", "ci"];

/**
 * How a checker's binary gets onto a machine: `run` executes a portable
 * install command itself; `suggest` prints one that needs sudo or an SDK and
 * never runs it; `bundled` means nothing to do, it arrives with something
 * already required.
 */
export type Install =
  | {
      readonly run: {
        readonly command: string;
        readonly args: readonly string[];
        /** Probed before running; its absence is missing-prereq. */
        readonly prereq?: string;
      };
    }
  | {
      readonly suggest: string;
      readonly pms?: readonly { readonly pm: string; readonly command: string }[];
    }
  | { readonly bundled: string };

/**
 * The one line a human can act on: what doctor prints and what a failing checker prints when its
 * binary is absent.
 */
export function installLine(install: Install): string {
  if ("run" in install) {
    const argv = [install.run.command, ...install.run.args.map(shellQuote)];
    return argv.join(" ");
  }
  return "suggest" in install ? install.suggest : install.bundled;
}

function shellQuote(arg: string): string {
  if (!/[\s"'$`\\]/.test(arg)) {
    return arg;
  }
  return `'${arg.replaceAll("'", `'\\''`)}'`;
}

const bunGlobal = (...pkgs: string[]): Install => ({
  run: { command: "bun", args: ["add", "-g", ...pkgs], prereq: "bun" },
});
const uvTool = (pkg: string): Install => ({
  run: { command: "uv", args: ["tool", "install", pkg], prereq: "uv" },
});
const goInstall = (url: string): Install => ({
  run: { command: "go", args: ["install", url], prereq: "go" },
});
const rustupComponent = (component: string): Install => ({
  run: { command: "rustup", args: ["component", "add", component], prereq: "rustup" },
});
const dotnetTool = (pkg: string): Install => ({
  run: { command: "dotnet", args: ["tool", "install", "-g", pkg], prereq: "dotnet" },
});
/** shellmetrics ships nowhere packaged; upstream's own install is this curl. */
const SHELLMETRICS_INSTALL: Install = {
  run: {
    command: "sh",
    args: [
      "-c",
      "curl -fsSL https://github.com/shellspec/shellmetrics/raw/master/shellmetrics -o ~/.local/bin/shellmetrics && chmod +x ~/.local/bin/shellmetrics",
    ],
    prereq: "curl",
  },
};
const systemPackage = (pkg: string): Install => ({ suggest: `your package manager: ${pkg}` });
const shipsWith = (what: string): Install => ({ bundled: `ships with ${what}` });

/** A shell's own parser as a checker: run the interpreter over each file and
 * count the ones it refused. */
const syntaxProbe = (flags: readonly string[]): Scoring => ({
  args: (files) => [...flags, ...files],
  eachFile: true,
  count: countNonZeroExits,
});

const RUFF = {
  language: "py",
  extensions: [".py", ".pyi"],
  binary: "ruff",
  install: uvTool("ruff"),
  fileSet: "changed",
  configFiles: ["**/ruff.toml", "**/.ruff.toml", "**/pyproject.toml"],
} as const;

/** What a TypeScript project's whole-program tools resolve through. */
const TS_PROJECT = ["tsconfig*.json", "package.json"];

/** The .csproj that owns a .cs file: the nearest one up its directories, else the root, where
 * `dotnet format` then takes the solution. One project is one load of its analyzers, measured at
 * 24 s whatever the file count, against 109 s for the solution at the root. */
function nearestProject(root: string, file: string): string {
  let dir = dirname(join(root, file));
  while (dir.startsWith(root)) {
    const project = readdirSync(dir).find((name) => name.endsWith(".csproj"));
    if (project !== undefined) {
      return relative(root, join(dir, project));
    }
    if (dir === root) {
      break;
    }
    dir = dirname(dir);
  }
  return ".";
}

/** What a dotnet build reads besides the .cs files. */
const DOTNET_PROJECT = [
  "**/*.csproj",
  "**/*.sln",
  "**/*.slnx",
  "**/Directory.Build.props",
  "**/Directory.Build.targets",
  "**/Directory.Packages.props",
  "**/.editorconfig",
  "global.json",
  "nuget.config",
  "NuGet.config",
];

/** semgrep's community engine analyses each file on its own: a flow from one
 * file into another is not found even when both files are scanned together
 * (measured 2026-09-26), so the files that changed are all it needs. */
const SEMGREP_ENGINE_SET = "changed";

/** A checker that writes a report is always built with the directory the run made for it. */
function reportDirOf(reportDir: string | undefined): string {
  if (reportDir === undefined) {
    throw new Error("a report-writing checker was built without a report directory");
  }
  return reportDir;
}

/** Each rule pack a run fetched, by name, to the local file holding it. */
export type LocalRules = ReadonlyMap<string, string>;

/** What a checker's args builder is handed: the files it covers under
 * `root` (also the cwd), plus a fresh temp dir when `reportFile` is set,
 * plus the local copy of each of its `packs` the run could fetch. A tool
 * that scores its cwd ignores `files`. */
interface Scoring {
  args: (
    files: readonly string[],
    root: string,
    reportDir?: string,
    rules?: LocalRules,
  ) => string[];
  /** Rule packs the tool would otherwise pull over the network on every run. */
  packs?: readonly string[];
  count: (stdout: string, stderr: string, exitCode: number) => number | Tally | null;
  /** Why a run `count` could not read failed, for a tool that names the
   * cause somewhere other than its stderr; undefined falls back to stderr. */
  failure?: (stdout: string) => string | undefined;
  /** One spawn per file, counts summed. */
  eachFile?: true;
  /** One spawn per group of files, counts summed: the key is what the tool takes as its one
   * target, such as the .csproj that owns a .cs file, and `args` gets one group at a time. */
  groupBy?: (root: string, file: string) => string;
  /** Only writes a report file: its content, read from the temp report dir,
   * replaces stdout for `count`. */
  reportFile?: string;
  /**
   * Extra applicability probe beyond extension match, with the condition in words: a probe that
   * answers no in silence reads the same as a checker that found nothing.
   */
  appliesWhen?: { needs: string; probe: (root: string) => boolean };
}

/** The files a checker is handed, computed once per run (lib/compare.ts):
 * `changed` for a tool that judges each file on its own, `given` for one
 * that needs the whole project (the caller's paths, the root by default),
 * `changedPlus` for one whose finding in a file can come from a file within
 * that many import edges of it. */
export type FileSet = "changed" | "given" | { changedPlus: number };

/** What a check's number is a count of. Beside the parser that produces it,
 * so it cannot drift from the code: `list --json` is the audit table. */
interface Measures {
  /** The quantity, in the tool's own terms, ending in the unit it counts. */
  counts: string;
  /** Other checks in this registry counting the same quantity over an
   * intersecting file set. Absent means none this registry can prove. */
  overlaps?: readonly string[];
}

export type CheckSpec = {
  /** Unique, stable — gates.json and reports refer to it. */
  name: string;
  measures: Measures;
  language: Language;
  /** Required, so no checker runs at a point nobody chose for it. */
  points: readonly Point[];
  extensions: readonly string[];
  /** Base names it covers besides its extensions, for a file type named by
   * convention rather than by suffix: `Dockerfile.prod`. */
  names?: RegExp;
  /** Binary on PATH; doctor probes it. */
  binary: string;
  install: Install;
  /** A checker whose job is vulnerabilities: it scores generated files too, where a quality
   * checker leaves them out. */
  guardsSafety?: true;
  /** Required, so no checker inherits a set nobody chose for it. */
  fileSet: FileSet;
  /** Tunable numbers the check runs with, single-sourced so `list --json`
   * shows the number the check actually runs with. */
  thresholds?: Record<string, number>;
  /** Globs over repository-relative paths naming the files the tool reads for its configuration. */
  configFiles?: readonly string[];
  /** The tool resolves imports through the installed dependencies, so what is installed is part of
   * what it scored: a result scored before `bun install` is not the result after it. */
  resolvesInstalled?: true;
  /** Why this checker's results are never stored: its answer depends on
   * something no key can hold, such as rules fetched over the network. */
  notStored?: string;
  /** How the checker runs at pre-push and ci where that differs from pre-commit.
   * Absent: the same way at every point. */
  prePush?: PrePush;
} & Scoring;

/** A checker's pre-push run: the set it scores. Its limit is the point's (POINTS). */
interface PrePush {
  fileSet: FileSet;
}

/** `spec` as it runs at `point`: at pre-push and ci its `prePush` declaration, elsewhere itself. */
export function asRunAt(spec: CheckSpec, point: Point): CheckSpec {
  const push = spec.prePush;
  if (point === "edit" || point === "pre-commit" || push === undefined) {
    return spec;
  }
  return { ...spec, fileSet: push.fileSet };
}

/** Whether a checker belongs to the set a point runs: the points it declares. */
export function selectedAt(spec: CheckSpec, point: Point): boolean {
  return spec.points.includes(point);
}

/** One line per language with no checker at some point. Empty when the registry is whole. */
export function registryGaps(specs: readonly CheckSpec[] = REGISTRY): string[] {
  const gaps: string[] = [];
  for (const language of LANGUAGES) {
    const own = specs.filter((spec) => spec.language === language);
    for (const point of POINT_NAMES) {
      if (!own.some((spec) => selectedAt(spec, point))) {
        gaps.push(`${language}: no ${point} checker`);
      }
    }
  }
  return gaps;
}

const SHELLMETRICS = { ccn: 10 };
const LIZARD = { ccn: 10 };
const VULTURE = { minConfidence: 80 };
// rustfmt on a standalone file needs the edition, or 2015 parsing rejects
// current syntax; Cargo.toml would know, but the file is scored without it.
export const RUSTFMT = { edition: 2021 };

/** shfmt's style, named here rather than left to the tool's defaults or to .editorconfig. */
export const SHFMT_STYLE = ["-i", "2", "-ci", "-bn"];

const SHELLMETRICS_SPEC = {
  points: POINT_NAMES,
  binary: "shellmetrics",
  install: SHELLMETRICS_INSTALL,
  fileSet: "changed",
  thresholds: SHELLMETRICS,
  args: (files: readonly string[]) => [...files],
  count: (stdout: string, stderr: string) =>
    countShellMetrics(`${stdout}\n${stderr}`, SHELLMETRICS.ccn),
} as const;

/** Dockerfile, api.Dockerfile, Dockerfile.prod: the names docker itself and
 * its tooling look for. */
const DOCKERFILE_NAMES = /^(Dockerfile|.+\.Dockerfile|Dockerfile\..+)$/;

const SPECS: readonly CheckSpec[] = [
  {
    name: "yamllint",
    measures: { counts: "yamllint rule violations, one per `file:line:col` diagnostic on stdout" },
    language: "docs",
    points: POINT_NAMES,
    extensions: [".yml", ".yaml"],
    binary: "yamllint",
    install: systemPackage("yamllint"),
    fileSet: "changed",
    configFiles: [".yamllint", ".yamllint.yaml", ".yamllint.yml"],
    args: (files) => ["-f", "parsable", ...files],
    count: countYamllint,
  },
  {
    name: "taplo",
    measures: { counts: "TOML lint errors, one per `error:` line taplo prints on stderr" },
    language: "docs",
    points: POINT_NAMES,
    extensions: [".toml"],
    binary: "taplo",
    install: systemPackage("taplo-cli"),
    fileSet: "changed",
    configFiles: ["taplo.toml", ".taplo.toml"],
    args: (files) => ["lint", ...files],
    count: countTaplo,
  },
  {
    name: "markdownlint-cli2",
    measures: {
      counts:
        "markdown rule violations, the number in markdownlint's own `Summary: N issues` (or `N error(s)`) line",
    },
    language: "docs",
    points: POINT_NAMES,
    extensions: [".md", ".markdown"],
    binary: "markdownlint-cli2",
    install: bunGlobal("markdownlint-cli2"),
    fileSet: "changed",
    configFiles: ["**/.markdownlint-cli2.*", "**/.markdownlint.*", "package.json"],
    args: (files) => [...files],
    count: countMarkdownlint,
  },
  {
    name: "oxlint",
    measures: {
      counts: "oxlint diagnostics about the code, type-aware rules included, one per diagnostic",
    },
    language: "ts",
    points: POINT_NAMES,
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    binary: "oxlint",
    // tsgolint runs the type-aware rules; oxlint finds it beside itself.
    install: bunGlobal("oxlint", "oxlint-tsgolint"),
    fileSet: "changed",
    configFiles: ["**/.oxlintrc.json", "**/.oxlintrc.jsonc", "**/oxlint.config.ts", ...TS_PROJECT],
    args: (files) => ["--format", "json", ...files],
    count: (stdout) => countOxlint(stdout),
  },
  {
    name: "oxfmt",
    measures: { counts: "files whose formatting differs from oxfmt's, one per file" },
    language: "ts",
    points: FROM_COMMIT,
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".jsonc"],
    binary: "oxfmt",
    install: bunGlobal("oxfmt"),
    fileSet: "changed",
    // .gitignore: oxfmt skips what it names.
    configFiles: ["**/.oxfmtrc.json", "**/.oxfmtrc.jsonc", "**/oxfmt.config.ts", ".gitignore"],
    args: (files) => ["--list-different", ...files],
    count: countFileList,
  },
  {
    name: "bun-check",
    measures: { counts: "type errors, one per `error TSxxxx` diagnostic" },
    language: "ts",
    points: FROM_PUSH,
    extensions: [".ts", ".tsx"],
    binary: "bun",
    // `bun check` reports the same errors as tsc, about 2.5 times faster
    // (measured on qsm-marketplace with Bun 1.4.3; older Bun has no `check`).
    install: { suggest: "bun upgrade" },
    fileSet: "given",
    configFiles: TS_PROJECT,
    resolvesInstalled: true,
    args: () => ["check", "--no-pretty"],
    count: countTsc,
    appliesWhen: {
      needs: "a tsconfig.json at the repository root",
      probe: (root) => existsSync(join(root, "tsconfig.json")),
    },
  },
  {
    name: "knip",
    measures: { counts: "unused files, exports, types and dependencies, one per reported item" },
    language: "ts",
    points: FROM_PUSH,
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    binary: "knip",
    install: bunGlobal("knip"),
    fileSet: "given",
    configFiles: ["knip.json", "knip.jsonc", ".knip.json", ".knip.jsonc", "knip.ts", ...TS_PROJECT],
    resolvesInstalled: true,
    args: () => ["--reporter", "json", "--no-exit-code"],
    count: countKnip,
  },
  {
    name: "depcruise",
    measures: {
      counts:
        "dependency rule breaches at error or warn severity, from the repository's own .dependency-cruiser config",
    },
    language: "ts",
    points: FROM_PUSH,
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    binary: "depcruise",
    install: bunGlobal("dependency-cruiser"),
    fileSet: "given",
    configFiles: [".dependency-cruiser.*", ...TS_PROJECT],
    resolvesInstalled: true,
    args: (files) => ["--config", "--output-type", "json", ...files],
    count: countDepcruise,
    appliesWhen: {
      needs: "a .dependency-cruiser config at the repository root",
      probe: (root) =>
        [".dependency-cruiser.js", ".dependency-cruiser.cjs", ".dependency-cruiser.json"].some(
          (config) => existsSync(join(root, config)),
        ),
    },
  },
  {
    name: "jscpd",
    measures: {
      counts: "clone pairs, the number in jscpd's own report at statistics.total.clones",
    },
    language: "ts",
    points: POINT_NAMES,
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    binary: "jscpd",
    install: bunGlobal("jscpd"),
    fileSet: "given",
    // The scored files are named, not `.`, so a generated file the set left out is not scanned.
    configFiles: [".jscpd.json", "package.json"],
    reportFile: "jscpd-report.json",
    args: (files, _root, reportDir) => [
      ...files,
      "--reporters",
      "json",
      "--silent",
      "--output",
      reportDirOf(reportDir),
    ],
    count: countJscpd,
  },
  {
    name: "semgrep-ts",
    measures: {
      counts: "rule matches from p/typescript and p/nodejsscan",
    },
    language: "ts",
    points: FROM_COMMIT,
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    binary: "semgrep",
    install: uvTool("semgrep"),
    fileSet: SEMGREP_ENGINE_SET,
    // p/typescript is semgrep's pack for the language (the same 74 rules as p/javascript);
    // p/nodejsscan adds 114 Node.js rules, none of them in it. Measured on one changed .ts file:
    // 3.3s alone, 5.3s with p/nodejsscan.
    ...semgrepRules(["p/typescript", "p/nodejsscan"]),
    count: countSemgrep,
  },
  {
    name: "ruff",
    measures: { counts: "ruff lint rule violations, one per JSON diagnostic" },
    ...RUFF,
    points: POINT_NAMES,
    args: (files) => ["check", "--output-format=json", "--exit-zero", ...files],
    count: (stdout) => countRuff(stdout),
  },
  {
    name: "ruff-format",
    measures: { counts: "files whose formatting differs from ruff's, one per file" },
    ...RUFF,
    points: FROM_COMMIT,
    args: (files) => ["format", "--check", ...files],
    count: countRuffFormat,
  },
  {
    name: "vulture",
    measures: {
      counts: "unused names at or above the confidence threshold, one per reported name",
    },
    language: "py",
    points: FROM_COMMIT,
    extensions: [".py"],
    binary: "vulture",
    install: uvTool("vulture"),
    fileSet: "changed",
    thresholds: VULTURE,
    configFiles: ["pyproject.toml"],
    args: (files) => [...files, "--min-confidence", String(VULTURE.minConfidence)],
    count: countVulture,
  },
  {
    name: "pyright",
    measures: { counts: "type diagnostics, one per generalDiagnostics entry" },
    language: "py",
    points: FROM_PUSH,
    extensions: [".py", ".pyi"],
    binary: "pyright",
    install: uvTool("pyright"),
    fileSet: "given",
    configFiles: ["pyrightconfig.json", "pyproject.toml"],
    args: () => ["--outputjson"],
    count: countPyright,
  },
  {
    name: "bandit",
    guardsSafety: true,
    measures: { counts: "security issues, one per result" },
    language: "py",
    points: POINT_NAMES,
    extensions: [".py"],
    binary: "bandit",
    install: uvTool("bandit"),
    fileSet: "changed",
    configFiles: ["bandit.yaml"],
    args: (files, root) =>
      existsSync(join(root, "bandit.yaml"))
        ? ["-c", "bandit.yaml", "-f", "json", "-q", ...files]
        : ["-f", "json", "-q", ...files],
    count: countBanditJson,
  },
  {
    name: "semgrep-py",
    measures: {
      counts: "rule matches from p/python",
    },
    language: "py",
    points: FROM_COMMIT,
    extensions: [".py"],
    binary: "semgrep",
    install: uvTool("semgrep"),
    fileSet: SEMGREP_ENGINE_SET,
    ...semgrepRules(["p/python"]),
    count: countSemgrep,
  },
  {
    name: "shellcheck",
    measures: {
      counts: "shellcheck diagnostics, one per SC-coded finding",
      overlaps: ["bash-syntax"],
      // a #!/bin/sh script gets the SC3xxx "In POSIX sh, X is undefined" checks, so no
      // separate bashism checker runs
    },
    language: "shell",
    points: POINT_NAMES,
    extensions: [".sh", ".bash"],
    binary: "shellcheck",
    install: systemPackage("shellcheck"),
    fileSet: "changed",
    configFiles: ["**/.shellcheckrc"],
    args: (files) => ["-f", "json", ...files],
    count: (stdout) => countShellcheck(stdout),
  },
  {
    name: "shellmetrics",
    measures: {
      counts:
        "functions whose cyclomatic complexity exceeds the threshold, one per function; the table read names no file per row, so this is a bare total",
    },
    language: "shell",
    extensions: [".sh", ".bash"],
    ...SHELLMETRICS_SPEC,
  },
  {
    name: "bash-syntax",
    measures: { counts: "files bash's own parser refuses, one per file", overlaps: ["shellcheck"] },
    language: "shell",
    points: FROM_COMMIT,
    extensions: [".sh", ".bash"],
    binary: "bash",
    install: shipsWith("the OS"),
    fileSet: "changed",
    ...syntaxProbe(["-n"]),
  },
  {
    name: "shfmt",
    measures: { counts: "files whose formatting differs from shfmt's, one per file" },
    language: "shell",
    points: FROM_COMMIT,
    extensions: [".sh", ".bash"],
    binary: "shfmt",
    install: systemPackage("shfmt"),
    fileSet: "changed",
    args: (files) => [...SHFMT_STYLE, "-l", ...files],
    count: countFileList,
  },
  {
    name: "semgrep-bash",
    measures: {
      counts:
        "rule matches from semgrep's three bash rules (curl-eval, curl-pipe-bash, ifs-tampering) and the registry's own qsm/bash rules; semgrep publishes no bash pack",
    },
    language: "shell",
    points: FROM_COMMIT,
    extensions: [".sh", ".bash"],
    binary: "semgrep",
    install: uvTool("semgrep"),
    fileSet: SEMGREP_ENGINE_SET,
    // semgrep publishes no bash pack (p/bash is a 404) and its broad packs are not one:
    // p/security-audit holds 225 rules, none of them bash.
    ...semgrepRules([
      "r/bash.curl.security.curl-eval",
      "r/bash.curl.security.curl-pipe-bash",
      "r/bash.lang.security.ifs-tampering",
      "qsm/bash",
    ]),
    count: countSemgrep,
  },
  {
    name: "lizard",
    measures: {
      counts: "functions whose cyclomatic complexity exceeds the threshold, one per function",
    },
    language: "multi",
    points: POINT_NAMES,
    extensions: [".ts", ".tsx", ".js", ".py", ".cs", ".rs", ".go"],
    binary: "lizard",
    install: uvTool("lizard"),
    fileSet: "changed",
    thresholds: LIZARD,
    args: (files) => ["-C", String(LIZARD.ccn), ...files],
    count: (stdout, stderr, exitCode) => countLizard(`${stdout}\n${stderr}`, exitCode),
  },
  {
    // Under multi, not a language of its own: nobody selects Dockerfiles to gate, and a language
    // row would ask for a profile and a module that would both be empty.
    name: "semgrep-dockerfile",
    measures: { counts: "rule matches from p/dockerfile" },
    language: "multi",
    points: FROM_COMMIT,
    extensions: [],
    names: DOCKERFILE_NAMES,
    binary: "semgrep",
    install: uvTool("semgrep"),
    fileSet: SEMGREP_ENGINE_SET,
    ...semgrepRules(["p/dockerfile"]),
    count: countSemgrep,
  },
  {
    name: "zsh-syntax",
    measures: { counts: "files zsh's own parser refuses, one per file" },
    language: "zsh",
    points: POINT_NAMES,
    extensions: [".zsh"],
    binary: "zsh",
    install: systemPackage("zsh"),
    fileSet: "changed",
    ...syntaxProbe(["-n"]),
  },
  {
    name: "zsh-lint",
    measures: { counts: "zsh-lint diagnostics, one per `path:line` line" },
    language: "zsh",
    points: FROM_COMMIT,
    extensions: [".zsh"],
    binary: "zsh-lint",
    install: goInstall("github.com/z-shell/zsh-lint/cmd/zsh-lint@latest"),
    fileSet: "changed",
    args: (files) => [...files],
    eachFile: true,
    count: (stdout, _stderr, exitCode) => countDiagnosticLines(stdout, exitCode),
  },
  {
    name: "zshellcheck",
    measures: { counts: "zshellcheck rule matches, one per SARIF result" },
    language: "zsh",
    points: FROM_COMMIT,
    extensions: [".zsh"],
    binary: "zshellcheck",
    install: goInstall("github.com/afadesigns/zshellcheck/cmd/zshellcheck@latest"),
    fileSet: "changed",
    configFiles: [".zshellcheckrc"],
    args: (files) => ["-format", "sarif", ...files],
    count: countSarif,
  },
  {
    name: "shellmetrics-zsh",
    measures: {
      counts:
        "functions whose cyclomatic complexity exceeds the threshold over zsh files, one per function; a bare total, as shellmetrics",
    },
    language: "zsh",
    extensions: [".zsh"],
    ...SHELLMETRICS_SPEC,
  },
  {
    name: "shfmt-zsh",
    measures: { counts: "files whose zsh formatting differs from shfmt's, one per file" },
    language: "zsh",
    points: FROM_COMMIT,
    extensions: [".zsh"],
    binary: "shfmt",
    install: systemPackage("shfmt"),
    fileSet: "changed",
    args: (files) => ["-ln=zsh", ...SHFMT_STYLE, "-l", ...files],
    count: countFileList,
  },
  {
    name: "fish-syntax",
    measures: { counts: "files fish's own parser refuses, one per file" },
    language: "fish",
    points: POINT_NAMES,
    extensions: [".fish"],
    binary: "fish",
    install: systemPackage("fish"),
    fileSet: "changed",
    // -N: fish -n alone still runs config.fish/conf.d as a real startup.
    ...syntaxProbe(["-N", "-n"]),
  },
  {
    name: "fish-indent",
    measures: { counts: "files whose formatting differs from fish_indent's, one per file" },
    language: "fish",
    points: FROM_COMMIT,
    extensions: [".fish"],
    binary: "fish_indent",
    install: shipsWith("fish"),
    fileSet: "changed",
    args: (files) => ["--check", ...files],
    eachFile: true,
    count: countNonZeroExits,
  },
  {
    name: "clippy",
    measures: {
      counts:
        "clippy and rustc warnings plus clippy-coded errors, one per compiler message; an E-coded compile error is a broken build rather than a finding",
    },
    language: "rust",
    points: FROM_PUSH,
    extensions: [".rs"],
    binary: "cargo",
    install: rustupComponent("clippy"),
    fileSet: "given",
    configFiles: [
      "**/Cargo.toml",
      "Cargo.lock",
      "clippy.toml",
      ".clippy.toml",
      "rust-toolchain",
      "rust-toolchain.toml",
    ],
    // clippy lints a cargo project, not loose files.
    appliesWhen: {
      needs: "a Cargo.toml at the repository root",
      probe: (root) => existsSync(join(root, "Cargo.toml")),
    },
    args: () => ["clippy", "--message-format=json", "--quiet", "--", ...CLIPPY_LINTS],
    count: (stdout, _stderr, exitCode) => countClippy(stdout, exitCode),
  },
  {
    name: "rustfmt",
    measures: { counts: "files whose formatting differs from rustfmt's, one per file" },
    language: "rust",
    points: POINT_NAMES,
    extensions: [".rs"],
    binary: "rustfmt",
    install: rustupComponent("rustfmt"),
    fileSet: "changed",
    thresholds: RUSTFMT,
    configFiles: ["**/rustfmt.toml", "**/.rustfmt.toml"],
    // One spawn per file: given several, rustfmt exits 1 once for any
    // difference and cannot say how many were unformatted.
    args: (files) => ["--check", "--edition", String(RUSTFMT.edition), ...files],
    eachFile: true,
    count: countNonZeroExits,
  },
  {
    name: "semgrep-rust",
    measures: { counts: "rule matches from p/rust" },
    language: "rust",
    points: FROM_COMMIT,
    extensions: [".rs"],
    binary: "semgrep",
    install: uvTool("semgrep"),
    fileSet: SEMGREP_ENGINE_SET,
    ...semgrepRules(["p/rust"]),
    count: countSemgrep,
  },
  {
    name: "dotnet",
    measures: { counts: "MSBuild build warnings, deduplicated across target frameworks" },
    language: "dotnet",
    points: FROM_PUSH,
    extensions: [".cs"],
    binary: "dotnet",
    install: { suggest: "install the dotnet SDK for your distro" },
    fileSet: "given",
    configFiles: DOTNET_PROJECT,
    args: () => ["build", "-tl:off", "--nologo", "-v", "minimal", "-p:TreatWarningsAsErrors=false"],
    // A failed build that named diagnostics is a list of findings, not a broken run: an
    // .editorconfig that raises a category to error makes the build exit non-zero on the very
    // findings this checker exists to count.
    count: (stdout, _stderr, exitCode) => {
      const tally = countDotnetDiagnostics(stdout);
      return exitCode === 0 || tally.total > 0 ? tally : null;
    },
  },
  {
    name: "dotnet-format",
    measures: {
      counts:
        "whitespace and style drift, one per reported FileChange, or one per drifted file that reports none",
    },
    language: "dotnet",
    points: FROM_COMMIT,
    extensions: [".cs"],
    binary: "dotnet",
    install: shipsWith("the dotnet SDK"),
    fileSet: "changed",
    configFiles: DOTNET_PROJECT,
    reportFile: "format-report.json",
    // One run per owning project: dotnet format loads a project and its analyzers once per run, so
    // the solution at the root costs four times a project and a file list costs nothing more. The
    // restore is the build's; a format that restored would write obj/ on both sides.
    groupBy: nearestProject,
    args: (files, root, reportDir) => [
      "format",
      nearestProject(root, files[0] ?? ""),
      "--verify-no-changes",
      "--no-restore",
      "--include",
      ...files,
      "--report",
      reportDirOf(reportDir),
    ],
    count: countDotnetFormatReport,
  },
  {
    name: "dotnet-vulnerable",
    guardsSafety: true,
    measures: {
      counts:
        "known vulnerabilities over direct and transitive packages; a vulnerability belongs to a package rather than a file, so this is a bare total",
    },
    language: "dotnet",
    points: FROM_PUSH,
    extensions: [".cs"],
    binary: "dotnet",
    install: shipsWith("the dotnet SDK (JSON output needs SDK 9+)"),
    fileSet: "given",
    notStored: "it reads the vulnerability advisories over the network",
    args: () => ["list", "package", "--vulnerable", "--include-transitive", "--format", "json"],
    count: countVulnerable,
  },
  {
    name: "devskim",
    guardsSafety: true,
    measures: {
      counts:
        "devskim findings, one per SARIF result or, on versions printing a bare array, one per entry as a bare total",
    },
    language: "dotnet",
    points: POINT_NAMES,
    extensions: [".cs"],
    binary: "devskim",
    install: dotnetTool("Microsoft.CST.DevSkim.CLI"),
    fileSet: "changed",
    // SARIF, not json: devskim 1.0.90 writes `[{},{}]` to stdout under `-f json -o -` — one empty
    // object per finding.
    args: (files) => [
      "analyze",
      "--source-code",
      ...files.slice(0, 1),
      "-f",
      "sarif",
      "-o",
      "-",
      "-s",
      "Critical",
      "Important",
      "Moderate",
      "BestPractice",
      "ManualReview",
      "--confidence",
      "High",
      "Medium",
      "Low",
    ],
    eachFile: true,
    count: countDevskim,
  },
  {
    name: "semgrep-dotnet",
    measures: {
      counts: "rule matches from p/csharp",
    },
    language: "dotnet",
    points: FROM_COMMIT,
    extensions: [".cs"],
    binary: "semgrep",
    install: uvTool("semgrep"),
    fileSet: SEMGREP_ENGINE_SET,
    ...semgrepRules(["p/csharp"]),
    count: countSemgrep,
  },
];

/** A file with no extension at all: `bin/deploy`, `Makefile`. A dotfile
 * counts as having one; nobody puts a program there. */
function hasNoExtension(file: string): boolean {
  return !basename(file).includes(".");
}

/** A file semgrep picks no language for by its name: `bin/deploy`, chosen
 * by its shebang, or `Dockerfile.prod`, chosen by its base name. */
function namedUnknown(file: string): boolean {
  return hasNoExtension(file) || basename(file).startsWith("Dockerfile.");
}

/**
 * semgrep's own parallelism is every core; two sides of a comparison run at once, so half the
 * cores each.
 */
function semgrepScope(files: readonly string[]): string[] {
  const jobs = ["-j", String(Math.max(1, Math.floor(JOBS / 2)))];
  return files.some(namedUnknown) ? [...jobs, "--scan-unknown-extensions"] : jobs;
}

/** The packs are the decision. A semgrep checker runs the same way at a commit and at a push:
 * the changed files, the community engine. The Pro engine's cross-file run over the whole tree
 * is a CI job's, not a gate on a person's machine: measured here, 128 s quiet and past 600 s at
 * a load of 15, and a run cut short blocks the push for nothing it proved. */
function semgrepRules(
  configs: readonly string[],
): Pick<CheckSpec, "packs" | "args" | "failure" | "guardsSafety"> {
  const flags = (rules?: LocalRules) => [
    ...configs.flatMap((config) => ["--config", rules?.get(config) ?? config]),
    "--json",
    "--quiet",
    // The gate's outer deadline is the bound; semgrep's own per-rule timeout would
    // cut a slow (but bounded) scan short and read it as a partial failure.
    "--timeout",
    "0",
  ];
  const args: Scoring["args"] = (files, _root, _reportDir, rules) => [
    ...flags(rules),
    ...semgrepScope(files),
    ...files,
  ];
  return { packs: configs, args, failure: semgrepFailure, guardsSafety: true };
}

export const REGISTRY: readonly CheckSpec[] = SPECS;
