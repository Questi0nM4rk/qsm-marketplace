#!/usr/bin/env bun
// qsm-web: the one binary for the whole web tier.
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { home } from "../../../lib/paths.ts";
import { resolve } from "node:path";
import {
  type Call,
  type Handler,
  optionalString,
  requiredString,
  runCli,
} from "../../../lib/cli-base.ts";
import { fail, type Outcome, ok, onPath } from "../../../lib/outcome.ts";
import { QsmError } from "../../../lib/qsm-error.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import { formatDoctor, runDoctor } from "../lib/doctor.ts";
import { parsePackage } from "../lib/manifest.ts";
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

const manifest = parseManifest(manifestJson, "qsm-web/qsm.json");

function doctor(): Outcome {
  const report = runDoctor(
    {
      onPath,
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
    throw new QsmError("missing", "the resolver is not installed: bun add -g opensrc");
  }
  if (r.status !== 0) {
    throw new QsmError("failed", `the resolver failed for "${target}" (exit ${r.status})`);
  }
  const cached = (r.stdout ?? "").trim().split(/\r?\n/).findLast(Boolean) ?? "";
  if (cached.length === 0 || !existsSync(cached)) {
    throw new QsmError("failed", `the resolver returned no usable path for "${target}"`);
  }
  return cached;
}

function pointAt(into: string, cached: string): void {
  const entry = lstatSync(into, { throwIfNoEntry: false });
  if (linkWouldNest(entry !== undefined, entry?.isSymbolicLink() ?? false)) {
    throw new QsmError(
      "failed",
      `${into} is a directory an earlier fetch by address left there; remove it with "rm -rf ${into}" and ask again`,
    );
  }
  const linked = spawnSync("ln", ["-sfn", cached, into], { stdio: "inherit" });
  if (linked.status !== 0) {
    throw new QsmError("failed", `could not point ${into} at ${cached} (exit ${linked.status})`);
  }
}

/** Resolve a spec through the upstream resolver and point the library
 * directory at what it produced. */
function resolveSpec(target: string, into: string, projectDir: string | undefined): string | null {
  const cached = runResolver(target, projectDir);
  pointAt(into, cached);
  return resolvedVersionFromPath(cached) ?? resolvedVersionFromPath(target);
}

/** A target with no URL scheme and no SCP colon is a filesystem path; git
 * clone canonicalizes it to an absolute origin, so the same resolution makes
 * a repeated relative address compare equal. URLs and SCP targets compare
 * exactly; aliases are never guessed. */
const localAddress = (s: string): boolean => {
  const colon = s.indexOf(":");
  const slash = s.indexOf("/");
  return colon === -1 || (slash !== -1 && slash < colon);
};

function sameOrigin(requested: string, origin: string): boolean {
  return (
    (localAddress(requested) ? resolve(requested) : requested) ===
    (localAddress(origin) ? resolve(origin) : origin)
  );
}

/** Clone an address on first use; update the clone on every call after,
 * but only once the clone's origin is the repository that was asked for.
 * Git stdout is captured so a successful `--json` run stays one envelope;
 * git diagnostics go to stderr. */
function acquireAddress(target: string, into: string): FetchMode {
  if (!existsSync(into)) {
    const c = spawnSync("git", ["clone", "--depth", "1", target, into], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    if (c.status !== 0) {
      throw new QsmError("failed", `git clone failed for ${target} (exit ${c.status})`);
    }
    return "clone";
  }
  const probe = spawnSync("git", ["-C", into, "remote", "get-url", "origin"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (probe.status !== 0) {
    throw new QsmError(
      "failed",
      `${into} has no readable origin to check against ${target}; ask for another QSM_OPENSRC_DIR or remove the directory`,
    );
  }
  if (!sameOrigin(target, probe.stdout.trim())) {
    throw new QsmError(
      "failed",
      `${into} holds a different repository than ${target}; its origin was not changed; ask for another QSM_OPENSRC_DIR or remove the directory`,
    );
  }
  const u = spawnSync("git", ["-C", into, "pull", "--ff-only"], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (u.status !== 0) {
    throw new QsmError("failed", `git update failed for ${target} (exit ${u.status})`);
  }
  return "update";
}

function projectPackage(dir: string): ProjectPackage | null {
  try {
    return parsePackage(JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8")));
  } catch {
    return null;
  }
}

function get(call: Call): Outcome {
  const target = requiredString(call, "target");
  const project = optionalString(call, "project");
  const projectDir = project === undefined ? undefined : resolve(project);
  const into = libDir(target, sourceRoot(process.env, home(process.env)));
  mkdirSync(resolve(into, ".."), { recursive: true });

  // Read once: the same declarations decide whether a bare name is
  // ambiguous and whether the resolved version can be called exact.
  const pkg = projectDir === undefined ? null : projectPackage(projectDir);
  const projectDeps = projectDir === undefined ? null : declaredDeps(pkg);

  let resolvedVersion: string | null = null;
  let mode: FetchMode;
  if (classifyTarget(target) === "address") {
    mode = acquireAddress(target, into);
  } else {
    const scoped = ambiguousBareName(target, pkg);
    if (scoped !== null) {
      throw new QsmError(
        "failed",
        `"${target}" is declared as "${scoped}"; ask for the full name instead`,
      );
    }
    resolvedVersion = resolveSpec(target, into, projectDir);
    mode = "resolver";
  }

  const result = buildFetchResult({ target, projectDeps, libPath: into, resolvedVersion, mode });
  return ok(result, JSON.stringify(result));
}

const handlers: Readonly<Record<string, Handler>> = {
  "opensrc get": get,
  doctor,
  ...searxngHandlers,
  ...browserboxHandlers,
};

if (import.meta.main) {
  process.exit(await runCli(manifest, "qsm-web", handlers));
}
