#!/usr/bin/env bun

// Runs one model N times over the private screenshot fixtures, then scores every run.
// usage: QSM_MEMORY_OCR_FIXTURES=<dir> bun run.ts --model haiku [--runs 3]
//
// The fixtures directory holds threads.json ({"A": ["<sha256>", ...]}, the screenshots of one
// thread in order, stored with `qsm-memory blob put`), gold/<thread>.json, and runs/, where each
// run lands as <model>-<i>.json. The screenshots are work data, so they never enter this repository.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { blobPath } from "../../lib/blobs.ts";
import { report, scoreDir, ThreadsSchema } from "./score.ts";

const TIMEOUT_MS = 20 * 60 * 1000;
const say = (line: string) => process.stdout.write(`${line}\n`);

const { values } = parseArgs({
  options: { model: { type: "string" }, runs: { type: "string", default: "3" } },
});
const { model: requested } = values;
const runs = Number(values.runs);
if (requested === undefined || requested === "" || !Number.isInteger(runs) || runs < 1) {
  process.stderr.write(
    "usage: QSM_MEMORY_OCR_FIXTURES=<dir> bun run.ts --model <haiku|sonnet|opus> [--runs N]\n",
  );
  process.exit(2);
}
const model = requested;
const dir = process.env.QSM_MEMORY_OCR_FIXTURES ?? "";
if (!existsSync(join(dir, "threads.json"))) {
  process.stderr.write(
    `missing: no threads.json in QSM_MEMORY_OCR_FIXTURES (${dir || "unset"}); point it at the private fixtures\n`,
  );
  process.exit(4);
}

// The model reads each screenshot by a name that says its thread and its place in the thread.
// The view is rebuilt on every run, so a run that was killed leaves nothing that the next run reads.
const threads = ThreadsSchema.parse(JSON.parse(readFileSync(join(dir, "threads.json"), "utf8")));
const view = join(dir, ".view");
rmSync(view, { recursive: true, force: true });
const listing: string[] = [];
for (const [thread, blobs] of Object.entries(threads)) {
  mkdirSync(join(view, thread), { recursive: true });
  const names = blobs.map((sha, i) => {
    const name = join(view, thread, `${String(i + 1).padStart(2, "0")}.png`);
    symlinkSync(blobPath(process.env, sha), name);
    return name;
  });
  listing.push(`Thread ${thread}: ${names.join(", ")}`);
}

const guide = readFileSync(join(import.meta.dir, "guide.md"), "utf8");
const prompt = `${guide}

## Your task

Read every screenshot below with the Read tool, thread by thread, in the order given. The image
field of a message is the file name (01.png, 02.png, ...). Return ONLY one JSON object that maps
each thread letter to its thread object, with no text before or after it.

${listing.join("\n")}
`;

/** The JSON object in a model's answer: a code fence or prose around it is dropped. */
function jsonOf(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

/** One `claude -p` run with only the Read tool; killed after TIMEOUT_MS. */
function one(i: number): Promise<void> {
  const started = Date.now();
  const args = ["-p", "--model", model, "--allowedTools", "Read", "--output-format", "text"];
  const child = spawn("claude", args, { cwd: view, stdio: ["pipe", "pipe", "pipe"] });
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  child.stdout.on("data", (b: Buffer) => {
    out.push(b);
  });
  child.stderr.on("data", (b: Buffer) => {
    err.push(b);
  });
  child.stdin.end(prompt);
  const timer = setTimeout(() => {
    child.kill();
  }, TIMEOUT_MS);
  return new Promise((resolve) => {
    child.on("close", (code) => {
      clearTimeout(timer);
      const file = join(dir, "runs", `${model}-${i}.json`);
      writeFileSync(file, `${jsonOf(Buffer.concat(out).toString("utf8"))}\n`);
      const secs = Math.round((Date.now() - started) / 1000);
      const tail = code === 0 ? "" : `\n${Buffer.concat(err).toString("utf8").slice(0, 400)}`;
      say(`${model}-${i}: exit ${code} after ${secs}s -> ${file}${tail}`);
      resolve();
    });
  });
}

mkdirSync(join(dir, "runs"), { recursive: true });
say(`${runs} x ${model} over ${Object.keys(threads).length} threads, at most 20 min each`);
try {
  await Promise.all(Array.from({ length: runs }, (_, i) => one(i + 1)));
} finally {
  rmSync(view, { recursive: true, force: true });
}
say(report(scoreDir(dir)));
