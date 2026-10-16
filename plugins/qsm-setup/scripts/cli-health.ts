// The qsm-setup verbs that report on the machine without changing it: "doctor" checks every plugin
// and Claude Code itself, "tools" compares the installed binaries with the checkout.
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
import { flagArg, type Handler, optionalString } from "../../../lib/cli-base.ts";
import { fail, ok } from "../../../lib/outcome.ts";
import { binDir, buildRecordPath, type Env, stateDir } from "../../../lib/paths.ts";
import { type ClaudeProbes, claudeChecks, type Lookup } from "../lib/claude-health.ts";
import { doctor, type Probe, qsmBinsIn } from "../lib/doctor.ts";
import { bunActivationReader, bunRunner } from "../lib/run-installers.ts";
import { compareTools, describeTools, type ToolsProbes } from "../lib/tools.ts";
import { purgeMachine, withRoot } from "./root.ts";

const env: Env = process.env;

/** The probe sees the bin directory install writes to, whether or not the
 * user's PATH has it yet. */
const shellProbe: Probe = (shell) => {
  const r = spawnSync("sh", ["-c", shell], {
    encoding: "utf8",
    env: { ...env, PATH: `${binDir(env)}:${env.PATH ?? ""}` },
  });
  return { code: r.status ?? 1, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
};

const RELEASES = "https://downloads.claude.ai/claude-code-releases";

/** One GET, five seconds, no retry: the body is the version as plain text. */
const lookupLatest: ClaudeProbes["latest"] = (channel) =>
  fetch(`${RELEASES}/${channel}`, { signal: AbortSignal.timeout(5000) })
    .then(async (res): Promise<Lookup> =>
      res.ok
        ? { ok: true, version: (await res.text()).trim() }
        : { ok: false, reason: `HTTP ${res.status}` },
    )
    .catch((e: unknown): Lookup => ({ ok: false, reason: String(e) }));

function whichClaude(): string[] {
  const r = spawnSync("which", ["-a", "claude"], { encoding: "utf8" });
  return (r.stdout ?? "").split("\n").filter((l) => l.length > 0);
}

function claudeVersion(): string | null {
  const r = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 10_000 });
  return r.status === 0 ? r.stdout : null;
}

const claudeProbes: ClaudeProbes = {
  env,
  cwd: process.cwd(),
  whichAll: whichClaude,
  version: claudeVersion,
  latest: lookupLatest,
};

const doctorVerb: Handler = (call) =>
  withRoot(call, async (nodes, root) => {
    const only = optionalString(call, "plugin") ?? null;
    const claude = only === null ? await claudeChecks(claudeProbes) : [];
    const verbose = flagArg(call, "verbose");
    const report = doctor(nodes, {
      installedPath: join(stateDir(env), "installed.json"),
      recordPath: buildRecordPath(env),
      binDir: binDir(env),
      path: env.PATH ?? "",
      only,
      probe: shellProbe,
      run: bunRunner,
      activation: bunActivationReader,
      legacy: purgeMachine(nodes, root, true),
      claude,
    });
    const lines = report.checks.flatMap((c) => {
      const head = `${c.status} ${c.name}: ${c.detail}`;
      const show = c.output.length > 0 && (c.status === "FAIL" || verbose);
      return show
        ? [
            head,
            ...c.output
              .trimEnd()
              .split("\n")
              .map((l) => `  ${l}`),
          ]
        : [head];
    });
    if (only === null) {
      lines.push(`${report.pass} pass, ${report.fail} fail, ${report.skip} skip`);
    }
    return report.ok ? ok(report, lines.join("\n")) : fail("failed", lines.join("\n"), report);
  });

/** Every qsm-* executable in a PATH directory or the qsm bin directory. */
function installedQsmBins(): Set<string> {
  return new Set(qsmBinsIn([...(env.PATH ?? "").split(":"), binDir(env)]).keys());
}

function toolsProbes(root: string): ToolsProbes {
  return {
    git: (args) => {
      const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
      return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
    installed: installedQsmBins,
    mtime: (path) => {
      try {
        return statSync(path).mtime;
      } catch {
        return null;
      }
    },
  };
}

const toolsVerb: Handler = (call) =>
  withRoot(call, (nodes, root) => {
    const r = compareTools(nodes, toolsProbes(root), flagArg(call, "fetch"));
    if (r.kind !== "ok") {
      return fail(r.kind, r.message);
    }
    const out = ok(r.report, describeTools(r.report).join("\n"));
    const onMain = r.report.binaries.some((b) => !b.goneFromMain);
    return onMain
      ? out
      : { ...out, warnings: ["origin/main declares no qsm binaries under plugins/*/qsm.json"] };
  });

export const handlers: Readonly<Record<string, Handler>> = { doctor: doctorVerb, tools: toolsVerb };
