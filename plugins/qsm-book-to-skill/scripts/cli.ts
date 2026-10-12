#!/usr/bin/env bun

// qsm-book-to-skill: the conversion pipeline, one verb per stage.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { type Call, type Handler, runCli } from "../../../lib/cli-base.ts";
import { checkTools, doctorVerdict, fail, type Outcome, ok } from "../../../lib/outcome.ts";
import type { QsmManifest } from "../../../lib/qsm-manifest.ts";
import { onPath, UPSTREAM } from "../lib/converters.ts";
import { extractSources, systemDeps } from "../lib/extract.ts";
import { assembleSkill, draftSkill, skillContents } from "../lib/generate.ts";
import { resolveName, titleHint } from "../lib/naming.ts";
import { scanSkill } from "../lib/scan.ts";
import type { Source } from "../lib/sources.ts";
import { scanInputs } from "../lib/sources.ts";
import { analyzeText, type Structure } from "../lib/structure.ts";
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = manifestJson as QsmManifest;

/** A stage that cannot go on: the file it reads is not there, or it is
 * there and unreadable. Thrown so every reader can stay a plain function. */
interface StageOptions extends ErrorOptions {
  readonly code: "missing" | "failed";
}

class StageError extends Error {
  readonly code: "missing" | "failed";

  constructor(message: string, options: StageOptions) {
    super(message, options);
    this.name = "StageError";
    this.code = options.code;
  }
}

function text(call: Call, name: string): string | undefined {
  return call.args[name] as string | undefined;
}

/** Every stage's files sit together, so a run is one directory a caller can
 * inspect, archive, or delete. */
function workDir(call: Call): string {
  const dir =
    text(call, "work") ??
    process.env.QSM_BOOK_TO_SKILL_WORKDIR ??
    join(tmpdir(), "qsm-book-to-skill");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function artifact(call: Call, named: string | undefined, fallback: string): string {
  return named === undefined ? join(workDir(call), fallback) : resolve(named);
}

function readJson<T>(path: string, what: string): T {
  if (!existsSync(path)) {
    throw new StageError(
      `${what} is not at ${path}; run the stage before this one or pass the path`,
      {
        code: "missing",
      },
    );
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (cause) {
    throw new StageError(
      `${path} is not readable JSON: ${cause instanceof Error ? cause.message : ""}`,
      {
        code: "failed",
        cause,
      },
    );
  }
}

function readText(path: string, what: string): string {
  if (!existsSync(path)) {
    throw new StageError(
      `${what} is not at ${path}; run the stage before this one or pass the path`,
      {
        code: "missing",
      },
    );
  }
  return readFileSync(path, "utf8");
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function said(value: unknown, lines: readonly string[]): Outcome {
  return ok(value, lines.join("\n"));
}

/** Some inputs done and some not is `partial`: exit 0 like ok, one warning
 * line per rejected input, and the envelope says so. */
function partialIf(outcome: Outcome, warnings: readonly string[]): Outcome {
  return warnings.length === 0 ? outcome : { ...outcome, code: "partial", warnings };
}

const validate: Handler = (call) => {
  const scan = scanInputs(call.args.input as string[]);
  const path = join(workDir(call), "sources.json");
  writeJson(path, scan);
  const lines = [
    `sources: ${scan.sources.length}`,
    ...scan.sources.map((s) => `  ${s.path} (${s.reader})`),
    `wrote ${path}`,
  ];
  // A rejected input beside a readable one makes the run partial, which exits 0: the stage did what
  // it could. Only a run that resolved nothing is a failure.
  const warnings = scan.rejected.map((r) => `skipped ${r.path}: ${r.reason}`);
  const data = { ...scan, path };
  if (scan.sources.length === 0) {
    return fail("failed", [...warnings, "no source could be read"].join("\n"), data);
  }
  return partialIf(said(data, lines), warnings);
};

const extract: Handler = (call) => {
  const scan = readJson<{ sources: readonly Source[] }>(
    artifact(call, text(call, "sources"), "sources.json"),
    "the validated source list",
  );
  const result = extractSources(scan.sources, systemDeps(process.env));
  const dir = workDir(call);
  const textPath = join(dir, "text.md");
  const metaPath = join(dir, "metadata.json");
  writeFileSync(textPath, result.text);
  writeJson(metaPath, { sources: result.sources, failed: result.failed });
  const data = {
    text: textPath,
    metadata: metaPath,
    sources: result.sources,
    failed: result.failed,
  };
  const warnings = result.failed.map((f) => `failed ${f.path}: ${f.reason}`);
  if (result.sources.length === 0) {
    return fail("failed", [...warnings, "no source could be extracted"].join("\n"), data);
  }
  return partialIf(
    said(data, [
      `extracted: ${result.sources.length}`,
      ...result.sources.map((s) => `  ${basename(s.path)}: ${s.words} words, ~${s.tokens} tokens`),
      `wrote ${textPath} and ${metaPath}`,
    ]),
    warnings,
  );
};

const analyze: Handler = (call) => {
  const body = readText(artifact(call, text(call, "text"), "text.md"), "the consolidated text");
  const structure = analyzeText(body);
  const path = join(workDir(call), "structure.json");
  writeJson(path, structure);
  return said({ ...structure, path }, [
    `chapters: ${structure.chapters.length} (${structure.method})`,
    `words: ${structure.words}, tokens: ~${structure.tokens}`,
    ...structure.chapters.map((c) => `  ${c.index}. ${c.title} (~${c.tokens} tokens)`),
    `wrote ${path}`,
  ]);
};

const draft: Handler = (call) => {
  const body = readText(artifact(call, text(call, "text"), "text.md"), "the consolidated text");
  const structure = readJson<Structure>(
    artifact(call, text(call, "structure"), "structure.json"),
    "the analyzed structure",
  );
  const dir = artifact(call, text(call, "out"), "draft");
  const result = draftSkill(body, structure, dir);
  return said(result, [
    `drafted ${result.chapters.length} chapters into ${dir}`,
    ...result.chapters.map((c) => `  ${c.summary} from ${c.source} (~${c.tokens} tokens)`),
  ]);
};

function skillRoot(call: Call): string {
  return text(call, "out") ?? process.env.QSM_SKILLS_DIR ?? join(workDir(call), "skills");
}

const assemble: Handler = (call) => {
  const given = text(call, "name");
  const hint =
    given === undefined
      ? titleHint(readText(artifact(call, undefined, "text.md"), "the consolidated text"))
      : "";
  const name = resolveName(given, hint);
  if (name.problems.length > 0) {
    return fail("failed", name.problems.join("\n"));
  }
  const result = assembleSkill({
    draftDir: artifact(call, text(call, "draft"), "draft"),
    outRoot: skillRoot(call),
    slug: name.slug,
    description: text(call, "description") ?? "",
  });
  writeJson(join(workDir(call), "skill.json"), result);
  return said(result, [
    `assembled ${result.dir}/SKILL.md`,
    ...result.sections.map((title) => `  ${title}`),
  ]);
};

function skillDir(call: Call): string {
  const named = text(call, "skill");
  if (named !== undefined) {
    return resolve(named);
  }
  return readJson<{ dir: string }>(artifact(call, undefined, "skill.json"), "the assembled skill")
    .dir;
}

/** The verdict on a generated skill: a skill that does not pass is never done, whatever else it
 * holds. On a pass it says where the skill is and what it holds. */
const scan: Handler = (call) => {
  const dir = skillDir(call);
  const findings = scanSkill(dir);
  const data = { dir, contents: skillContents(dir), findings };
  if (findings.length > 0) {
    return fail(
      "failed",
      [
        `${findings.length} finding(s) in ${dir}`,
        ...findings.map((f) => `  ${f.path}: ${f.problem}`),
      ].join("\n"),
      data,
    );
  }
  return said(data, [`clean: ${dir}`, `bytes: ${data.contents.bytes}`]);
};

const doctor: Handler = () =>
  doctorVerdict(
    "qsm-book-to-skill",
    checkTools(UPSTREAM, (cmd) => onPath(cmd, process.env.PATH ?? "")),
  );

/** A StageError carries the outcome code its own reader chose; anything
 * else is a bug and keeps travelling. */
function staged(handler: Handler): Handler {
  return (call) => {
    try {
      return handler(call);
    } catch (error) {
      if (error instanceof StageError) {
        return fail(error.code, error.message);
      }
      throw error;
    }
  };
}

if (import.meta.main) {
  process.exit(
    await runCli(
      manifest,
      "qsm-book-to-skill",
      Object.fromEntries(
        Object.entries({
          validate,
          extract,
          analyze,
          draft,
          assemble,
          scan,
          doctor,
        }).map(([verb, handler]) => [verb, staged(handler)]),
      ),
    ),
  );
}
