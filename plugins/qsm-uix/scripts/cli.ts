#!/usr/bin/env bun

// qsm-uix: the capture kit the audit skills measure with.

import {
  type Call,
  type Handler,
  optionalNumber,
  optionalString,
  requiredString,
  runCli,
} from "../../../lib/cli-base.ts";
import { checkTools, doctorVerdict, type Outcome, ok } from "../../../lib/outcome.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
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
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = parseManifest(manifestJson, "qsm-uix/qsm.json");
const DEFAULT_DEPTH = 32;

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

/** A QsmError thrown below reaches the CLI base, which turns it into its outcome code. */
function captured<R extends object>(
  run: (call: Call) => R | Promise<R>,
  keys: readonly string[] | Say<R>,
): Handler {
  return async (call): Promise<Outcome> => {
    const result = await run(call);
    return ok(result, line(result, keys));
  };
}

if (import.meta.main) {
  process.exit(
    await runCli(manifest, "qsm-uix", {
      screenshot: captured(
        (call) =>
          screenshot({ output: optionalString(call, "output"), out: optionalString(call, "out") }),
        ["output", "file"],
      ),
      crop: captured(
        (call) =>
          crop({
            input: requiredString(call, "input"),
            rect: requiredString(call, "rect"),
            zoom: optionalNumber(call, "zoom"),
            out: optionalString(call, "out"),
          }),
        ["file", "zoom"],
      ),
      diff: captured(
        (call) =>
          diff({
            a: requiredString(call, "a"),
            b: requiredString(call, "b"),
            out: optionalString(call, "out"),
          }),
        ["distortion", "identical", "diffImage"],
      ),
      burst: captured(
        (call) =>
          burst({
            count: optionalNumber(call, "count"),
            interval: optionalNumber(call, "interval"),
            outDir: requiredString(call, "outDir"),
            output: optionalString(call, "output"),
          }),
        ["output", "frames"],
      ),
      "pixel-sample": captured(
        (call) =>
          pixelSample({ image: requiredString(call, "image"), at: requiredString(call, "at") }),
        ["hex", "r", "g", "b"],
      ),
      contrast: captured(
        (call) =>
          contrast({
            image: requiredString(call, "image"),
            fg: requiredString(call, "fg"),
            bg: requiredString(call, "bg"),
          }),
        ["ratio", "wcagAaText", "wcagAaLargeOrUi"],
      ),
      "region-stats": captured(
        (call) =>
          regionStats({
            image: requiredString(call, "image"),
            rect: requiredString(call, "rect"),
            top: optionalNumber(call, "top"),
          }),
        ["pixels", "uniqueColors", "meanLuminance", "palette"],
      ),
      "a11y-tree": captured(
        (call) => {
          const tree = accessibilityTree(
            optionalString(call, "app"),
            optionalNumber(call, "depth") ?? DEFAULT_DEPTH,
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
