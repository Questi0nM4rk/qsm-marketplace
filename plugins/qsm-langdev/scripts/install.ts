#!/usr/bin/env bun
// The shared install base compiles this plugin's binary into the user's bin directory and its
// classic stop gate hook into dist/.
import { resolve } from "node:path";
import { installScript } from "../../../lib/install-base.ts";
import type { InstallContext, Step } from "../../../lib/install-contract.ts";
import { type StructuralCheckerStatus, structuralCheckerStatus } from "../lib/compare.ts";
import { type SemgrepLogin, semgrepLogin, semgrepLoginWarning } from "../lib/semgrep-login.ts";

const BUILD_ARGS = [resolve(import.meta.dir, "build-sentrux.ts"), "install"];
const BUILD_COMMAND = ["bun", ...BUILD_ARGS].join(" ");
const CARGO_HINT = `install Rust (https://rustup.rs), then run ${BUILD_COMMAND}`;

/** `checker` is the probe of the sentrux on PATH; a test hands in its own. */
export async function structuralChecker(
  ctx: InstallContext,
  checker: () => Promise<StructuralCheckerStatus> = structuralCheckerStatus,
): Promise<Step> {
  const name = "structural checker";
  if ((await checker()).patched) {
    return { name, status: "already", detail: "sentrux reports a qsm-patched version" };
  }
  if (!ctx.probe("cargo")) {
    return ctx.dryRun
      ? { name, status: "skipped", detail: `would need cargo: ${CARGO_HINT}` }
      : { name, status: "missing-prereq", detail: `cargo is not on PATH: ${CARGO_HINT}` };
  }
  if (ctx.dryRun) {
    return {
      name,
      status: "skipped",
      detail: `would build the qsm-patched sentrux: ${BUILD_COMMAND}`,
    };
  }
  const exit = ctx.run("bun", BUILD_ARGS);
  return exit === 0
    ? { name, status: "installed", detail: `built the qsm-patched sentrux: ${BUILD_COMMAND}` }
    : { name, status: "error", detail: `${BUILD_COMMAND} exited ${exit}; run it yourself` };
}

/**
 * The semgrep login warning as its own step when semgrep is on PATH and not logged in: a
 * suggestion, so install still succeeds.
 */
export function semgrepLoginStep(
  ctx: InstallContext,
  login: () => SemgrepLogin = () => semgrepLogin(ctx.env),
): Step | null {
  // an absent semgrep is the checker's missing binary, never a login question
  const warning = ctx.probe("semgrep") ? semgrepLoginWarning(login()) : null;
  return warning === null ? null : { name: "semgrep login", status: "suggested", detail: warning };
}

/** The structural checker, then the semgrep login when there is one. */
export async function extraSteps(
  ctx: InstallContext,
  checker?: () => Promise<StructuralCheckerStatus>,
  login?: () => SemgrepLogin,
): Promise<Step[]> {
  const loginStep = semgrepLoginStep(ctx, login);
  const checkerStep = await structuralChecker(ctx, checker);
  return loginStep === null ? [checkerStep] : [checkerStep, loginStep];
}

export const install = installScript(import.meta, {
  // rewraps markdown prose to the line length before the check (lib/markdown-wrap.ts)
  upstream: [
    { cmd: "rumdl", install: ["uv", "tool", "install", "rumdl"], hint: "uv tool install rumdl" },
  ],
  extra: (ctx) => extraSteps(ctx),
});
