#!/usr/bin/env bun

// qsm-uix: the capture kit the audit skills measure with.

import { type Call, type Handler, runCli } from "../../../lib/cli-base.ts";
import { checkTools, doctorVerdict, fail, type Outcome, ok } from "../../../lib/outcome.ts";
import type { QsmManifest } from "../../../lib/qsm-manifest.ts";
import { accessibilityTree, busFinding, renderTree } from "../lib/atspi.ts";
import {
  burst,
  contrast,
  crop,
  diff,
  pixelSample,
  regionStats,
  screenshot,
} from "../lib/capture.ts";
import { UPSTREAM } from "../lib/doctor.ts";
import { CaptureError } from "../lib/errors.ts";
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = manifestJson as QsmManifest;
const DEFAULT_DEPTH = 32;

function str(call: Call, name: string): string {
  return call.args[name] as string;
}

function optionalStr(call: Call, name: string): string | undefined {
  return call.args[name] as string | undefined;
}

function num(call: Call, name: string): number | undefined {
  return call.args[name] as number | undefined;
}

type Say<R> = (result: R) => string;

/** The one line a reader gets in text mode; `--json` carries the whole
 * result as data either way. */
function line<R extends object>(result: R, keys: readonly string[] | Say<R>): string {
  if (typeof keys === "function") {
    return keys(result);
  }
  const said = new Map<string, unknown>(Object.entries(result));
  return keys.map((key) => `${key}: ${JSON.stringify(said.get(key))}`).join("  ");
}

/** A CaptureError carries the outcome code its own thrower chose: a missing
 * tool, a call that does not hold, or the capture going wrong. */
function captured<R extends object>(
  run: (call: Call) => R | Promise<R>,
  keys: readonly string[] | Say<R>,
): Handler {
  return async (call): Promise<Outcome> => {
    try {
      const result = await run(call);
      return ok(result, line(result, keys));
    } catch (error) {
      if (error instanceof CaptureError) {
        return fail(error.code, error.message);
      }
      throw error;
    }
  };
}

if (import.meta.main) {
  process.exit(
    await runCli(manifest, "qsm-uix", {
      screenshot: captured(
        (call) =>
          screenshot({ output: optionalStr(call, "output"), out: optionalStr(call, "out") }),
        ["output", "file"],
      ),
      crop: captured(
        (call) =>
          crop({
            input: str(call, "input"),
            rect: str(call, "rect"),
            zoom: num(call, "zoom"),
            out: optionalStr(call, "out"),
          }),
        ["file", "zoom"],
      ),
      diff: captured(
        (call) => diff({ a: str(call, "a"), b: str(call, "b"), out: optionalStr(call, "out") }),
        ["distortion", "identical", "diffImage"],
      ),
      burst: captured(
        (call) =>
          burst({
            count: num(call, "count"),
            interval: num(call, "interval"),
            outDir: str(call, "outDir"),
            output: optionalStr(call, "output"),
          }),
        ["output", "frames"],
      ),
      "pixel-sample": captured(
        (call) => pixelSample({ image: str(call, "image"), at: str(call, "at") }),
        ["hex", "r", "g", "b"],
      ),
      contrast: captured(
        (call) => contrast({ image: str(call, "image"), fg: str(call, "fg"), bg: str(call, "bg") }),
        ["ratio", "wcagAaText", "wcagAaLargeOrUi"],
      ),
      "region-stats": captured(
        (call) =>
          regionStats({
            image: str(call, "image"),
            rect: str(call, "rect"),
            top: num(call, "top"),
          }),
        ["pixels", "uniqueColors", "meanLuminance", "palette"],
      ),
      "a11y-tree": captured(
        (call) => {
          const tree = accessibilityTree(
            optionalStr(call, "app"),
            num(call, "depth") ?? DEFAULT_DEPTH,
          );
          return { action: "a11y-tree", tree };
        },
        (result) => renderTree(result.tree).join("\n"),
      ),
      doctor: () => {
        const finding = busFinding();
        return doctorVerdict("qsm-uix", checkTools(UPSTREAM), finding === null ? [] : [finding]);
      },
    }),
  );
}
