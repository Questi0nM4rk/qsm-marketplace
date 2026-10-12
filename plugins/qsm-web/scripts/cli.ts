#!/usr/bin/env bun
// qsm-web: the one binary for the whole web tier.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { type Call, type Handler, runCli } from "../../../lib/cli-base.ts";
import { fail, type Outcome, ok } from "../../../lib/outcome.ts";
import type { QsmManifest } from "../../../lib/qsm-manifest.ts";
import { formatDoctor, runDoctor } from "../lib/doctor.ts";
import {
  ambiguousBareName,
  buildFetchResult,
  classifyTarget,
  declaredDeps,
  type FetchMode,
  libDir,
  linkWouldNest,
  type ProjectPackage,
  resolvedVersionFromPath,
  sourceRoot,
} from "../lib/opensrc-core.ts";
import manifestJson from "../qsm.json" with { type: "json" };
import { handlers as browserboxHandlers } from "./browserbox.ts";
import { handlers as searxngHandlers } from "./searxng.ts";

const manifest = manifestJson as QsmManifest;

/** A failure that already knows its outcome code. Thrown from the helpers
 * below so one guard turns it into the handler's outcome. */
class FetchError extends Error {
  readonly code: "failed" | "missing";
  constructor(code: "failed" | "missing", message: string) {
    super(message);
    this.name = "FetchError";
    this.code = code;
  }
}

function doctor(): Outcome {
  const report = runDoctor(
    {
      onPath: (bin) =>
        spawnSync("command", ["-v", bin], { shell: true, stdio: "ignore" }).status === 0,
      responds: (bin) => spawnSync(bin, ["--help"], { stdio: "ignore" }).status === 0,
    },
    () => spawnSync("shot-scraper", ["--version"], { stdio: "ignore" }).status === 0,
    process.env,
  );
  const text = formatDoctor(report).trimEnd();
  return report.ok ? ok(report, text) : fail("missing", text, report);
}

/** Ask the upstream resolver where a spec lives; the path it prints. */
function runResolver(target: string, projectDir: string | undefined): string {
  const args = ["path"];
  if (projectDir !== undefined) {
    args.push("--cwd", projectDir);
  }
  args.push(target);
  const r = spawnSync("opensrc", args, { encoding: "utf8" });
  if (r.status === null) {
    throw new FetchError("missing", "the resolver is not installed: bun add -g opensrc");
  }
  if (r.status !== 0) {
    throw new FetchError("failed", `the resolver failed for "${target}" (exit ${r.status})`);
  }
  const cached = (r.stdout ?? "").trim().split(/\r?\n/).filter(Boolean).pop() ?? "";
  if (cached.length === 0 || !existsSync(cached)) {
    throw new FetchError("failed", `the resolver returned no usable path for "${target}"`);
  }
  return cached;
}

function pointAt(into: string, cached: string): void {
  const entry = lstatSync(into, { throwIfNoEntry: false });
  if (linkWouldNest(entry !== undefined, entry?.isSymbolicLink() ?? false)) {
    throw new FetchError(
      "failed",
      `${into} is a directory an earlier fetch by address left there; remove it with "rm -rf ${into}" and ask again`,
    );
  }
  const linked = spawnSync("ln", ["-sfn", cached, into], { stdio: "inherit" });
  if (linked.status !== 0) {
    throw new FetchError("failed", `could not point ${into} at ${cached} (exit ${linked.status})`);
  }
}

/** Resolve a spec through the upstream resolver and point the library
 * directory at what it produced. */
function resolveSpec(target: string, into: string, projectDir: string | undefined): string | null {
  const cached = runResolver(target, projectDir);
  pointAt(into, cached);
  return resolvedVersionFromPath(cached) ?? resolvedVersionFromPath(target);
}

/** Clone an address on first use; update the clone on every call after. */
function acquireAddress(target: string, into: string, warnings: string[]): FetchMode {
  if (!existsSync(into)) {
    const c = spawnSync("git", ["clone", "--depth", "1", target, into], { stdio: "inherit" });
    if (c.status !== 0) {
      throw new FetchError("failed", `git clone failed for ${target} (exit ${c.status})`);
    }
    return "clone";
  }
  const u = spawnSync("git", ["-C", into, "pull", "--ff-only"], { stdio: "inherit" });
  if (u.status !== 0) {
    warnings.push(`${into} would not fast-forward; keeping the tree it already has`);
  }
  return "update";
}

function projectPackage(dir: string): ProjectPackage | null {
  try {
    return JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function get(call: Call): Outcome {
  const target = call.args.target as string;
  const project = call.args.project as string | undefined;
  const projectDir = project === undefined ? undefined : resolve(project);
  const into = libDir(target, sourceRoot(process.env, homedir()));
  mkdirSync(resolve(into, ".."), { recursive: true });

  // Read once: the same declarations decide whether a bare name is
  // ambiguous and whether the resolved version can be called exact.
  const pkg = projectDir === undefined ? null : projectPackage(projectDir);
  const projectDeps = projectDir === undefined ? null : declaredDeps(pkg);

  const warnings: string[] = [];
  let resolvedVersion: string | null = null;
  let mode: FetchMode;
  if (classifyTarget(target) === "address") {
    mode = acquireAddress(target, into, warnings);
  } else {
    const scoped = ambiguousBareName(target, pkg);
    if (scoped !== null) {
      throw new FetchError(
        "failed",
        `"${target}" is declared as "${scoped}"; ask for the full name instead`,
      );
    }
    resolvedVersion = resolveSpec(target, into, projectDir);
    mode = "resolver";
  }

  const result = buildFetchResult({ target, projectDeps, libPath: into, resolvedVersion, mode });
  return { ...ok(result, JSON.stringify(result)), warnings };
}

/** One place turns a FetchError into its outcome; anything else keeps
 * reaching the CLI base, which reports it as `failed`. */
function guarded(handler: (call: Call) => Outcome): (call: Call) => Outcome {
  return (call) => {
    try {
      return handler(call);
    } catch (err: unknown) {
      if (err instanceof FetchError) {
        return fail(err.code, err.message);
      }
      throw err;
    }
  };
}

const handlers: Readonly<Record<string, Handler>> = {
  "opensrc get": guarded(get),
  doctor: guarded(doctor),
  ...searxngHandlers,
  ...browserboxHandlers,
};

if (import.meta.main) {
  process.exit(await runCli(manifest, "qsm-web", handlers));
}
