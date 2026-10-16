#!/usr/bin/env bun
// qsm-usage: arguments and QSM_* environment only, nothing read from a checkout.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  type Call,
  flagArg,
  type Handler,
  optionalString,
  requiredString,
  runCli,
} from "../../../lib/cli-base.ts";
import { fail, type Outcome, ok } from "../../../lib/outcome.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import {
  type Answer,
  checkBins,
  type DoctorReport,
  formatDoctorReport,
  probeList,
} from "../lib/doctor.ts";
import { InputError, messageOf, readData } from "../lib/formats.ts";
import { extractFrontmatter, extractTable, frontmatterText, tableText } from "../lib/markdown.ts";
import { formatSizeReport, sizeReport } from "../lib/size.ts";
import { decode } from "../lib/toon-decode.ts";
import { encode } from "../lib/toon-encode.ts";
import manifestJson from "../qsm.json" with { type: "json" };
import { count } from "./count.ts";
import { drop, dropped } from "./dropped.ts";
import { filter } from "./filter.ts";
import { report as reportVerb } from "./report.ts";
import { wrap } from "./wrap.ts";

const manifest = parseManifest(manifestJson, "qsm-usage/qsm.json");

/**
 * A refusal raised from a helper: `usage` for a broken call, `failed` for a call that was fine and
 * an input that was not.
 */
class Refuse extends Error {
  readonly outcome: Outcome;
  constructor(outcome: Outcome) {
    super(outcome.message ?? "");
    this.outcome = outcome;
  }
}

function badCall(message: string): never {
  throw new Refuse(fail("usage", message));
}

function inputError(message: string): never {
  throw new Refuse(fail("failed", message));
}

function guarded(handler: Handler): Handler {
  return (call) => {
    try {
      return handler(call);
    } catch (error) {
      if (error instanceof Refuse) {
        return error.outcome;
      }
      if (error instanceof InputError) {
        return fail("failed", error.message);
      }
      return fail("failed", messageOf(error));
    }
  };
}

function read(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    return inputError(`cannot read ${path}: ${messageOf(error)}`);
  }
}

interface Selection {
  readonly label: string;
  readonly original: string;
  readonly value: unknown;
}

/** The three ways to name the data inside a file: the whole file, its
 * frontmatter, or one table under a heading. */
function select(call: Call): Selection {
  const file = requiredString(call, "file");
  const section = optionalString(call, "section");
  const source = read(file);
  if (flagArg(call, "frontmatter") && flagArg(call, "table")) {
    badCall("--frontmatter and --table name two different things; pass one");
  }
  if (flagArg(call, "frontmatter")) {
    return {
      label: `${file} (frontmatter)`,
      original: frontmatterText(source),
      value: extractFrontmatter(source),
    };
  }
  if (flagArg(call, "table")) {
    if (section === undefined || section.length === 0) {
      badCall("--table needs --section <heading>");
    }
    return {
      label: `${file} (table under ${section})`,
      original: tableText(source, section),
      value: extractTable(source, section),
    };
  }
  return { label: file, original: source, value: readData(file, source) };
}

const answer: Answer = (bin, args) => {
  const probed = spawnSync(bin, [...args], { encoding: "utf8" });
  if (probed.error !== undefined || probed.status !== 0) {
    return null;
  }
  const [line] = probed.stdout.trim().split("\n");
  return line === undefined || line.length === 0 ? null : line;
};

const encodeVerb: Handler = guarded((call) => {
  const toon = encode(select(call).value);
  return ok({ toon }, toon);
});

const decodeVerb: Handler = guarded((call) => {
  const value = decode(read(requiredString(call, "file")));
  return ok(value, JSON.stringify(value));
});

const sizeVerb: Handler = guarded((call) => {
  const chosen = select(call);
  const report = sizeReport(chosen.label, chosen.original, encode(chosen.value));
  return ok(report, formatSizeReport(report));
});

const doctorVerb: Handler = () => {
  const report: DoctorReport = checkBins(probeList(process.env), answer);
  const text = formatDoctorReport(report);
  return report.allUsable
    ? ok(report, text)
    : fail(
        "missing",
        `${report.bins
          .filter((b) => !b.usable)
          .map((b) => b.bin)
          .join(", ")} not usable\n${text}`,
        report,
      );
};

if (import.meta.main) {
  process.exit(
    await runCli(manifest, "qsm-usage", {
      "toon encode": encodeVerb,
      "toon decode": decodeVerb,
      "toon size": sizeVerb,
      "toon wrap": wrap,
      filter,
      doctor: doctorVerb,
      count,
      report: reportVerb,
      drop,
      dropped,
    }),
  );
}
