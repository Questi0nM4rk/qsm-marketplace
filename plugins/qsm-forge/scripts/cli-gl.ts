#!/usr/bin/env bun

// The GitLab half of qsm-forge: a merge request's review threads as one call each ("qsm-forge gl
// <verb>").

import { type Call, type Handler, optionalString, requiredNumber } from "../../../lib/cli-base.ts";
import { fail, type Outcome, ok } from "../../../lib/outcome.ts";
import { UsageError } from "../lib/errors.ts";
import { runCommand } from "../lib/exec.ts";
import { type GitlabForge, gitlabForge, replyToThread, resolveThread } from "../lib/gitlab.ts";
import { MissingError } from "../lib/missing-error.ts";
import { type GitlabProject, resolveGitlabProject } from "../lib/remote.ts";
import { oneLine, place, table } from "../lib/render.ts";
import { parseReviewPayload, readPayloadFile } from "../lib/review-payload.ts";

const BODY_WIDTH = 80;
const FILE_WIDTH = 40;

interface At {
  readonly forge: GitlabForge;
  readonly at: string;
  readonly call: Call;
}

function said(value: unknown, lines: readonly string[]): Outcome {
  return ok(value, lines.join("\n"));
}

function mr(call: Call): number {
  return requiredNumber(call, "mr");
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return "";
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function status({ forge, at, call }: At): Promise<Outcome> {
  const found = await forge.status(mr(call));
  return said(found, [
    `${at}  ${found.state}`,
    `merge readiness:  ${found.mergeStatus}`,
    `auto-merge:       ${found.autoMerge ? "enabled" : "disabled"}`,
    `discussions:      ${found.blockingDiscussionsResolved ? "all resolved" : "blocking"}`,
    `unresolved:       ${String(found.unresolvedThreads)}`,
    `pipeline:         ${found.pipeline ?? "none"}`,
  ]);
}

async function threads({ forge, at, call }: At): Promise<Outcome> {
  const unresolved = (await forge.threads(mr(call))).filter((thread) => !thread.resolved);
  if (unresolved.length === 0) {
    return said({ unresolved: [] }, [`no unresolved threads on ${at}`]);
  }
  const rows = unresolved.map((thread) => [
    String(thread.notes.at(0)?.id ?? 0),
    oneLine(thread.path, FILE_WIDTH),
    thread.line === null ? "-" : String(thread.line),
    oneLine(thread.notes.at(0)?.body ?? "", BODY_WIDTH),
    thread.notes.length > 1 ? "yes" : "no",
  ]);
  return said({ unresolved }, [
    `${String(unresolved.length)} unresolved on ${at}`,
    "",
    ...table(
      [
        { header: "note", width: 12 },
        { header: "file", width: FILE_WIDTH },
        { header: "line", width: 6 },
        { header: "said", width: BODY_WIDTH },
        { header: "replied", width: 7 },
      ],
      rows,
    ),
  ]);
}

async function reply({ forge, at, call }: At): Promise<Outcome> {
  const message = optionalString(call, "message") ?? "";
  if (message.trim().length === 0) {
    return fail("usage", "reply requires --message; nothing was posted");
  }
  const outcome = await replyToThread(forge, mr(call), requiredNumber(call, "noteId"), message);
  return said({ thread: outcome.thread.id, replied: true, resolved: outcome.resolved }, [
    `replied on ${at} ${place(outcome.thread.path, outcome.thread.line)}`,
    "thread left open; resolve it with qsm-forge gl resolve",
  ]);
}

async function resolve({ forge, at, call }: At): Promise<Outcome> {
  const outcome = await resolveThread(
    forge,
    mr(call),
    requiredNumber(call, "noteId"),
    optionalString(call, "message") ?? null,
  );
  const where = place(outcome.thread.path, outcome.thread.line);
  return said(
    {
      thread: outcome.thread.id,
      resolved: outcome.resolved,
      alreadyResolved: outcome.alreadyResolved,
    },
    [
      outcome.alreadyResolved
        ? `thread on ${at} ${where} is already resolved`
        : `resolved ${where} on ${at}`,
    ],
  );
}

async function submitReview({ forge, at, call }: At): Promise<Outcome> {
  const file = optionalString(call, "file");
  const raw = file === undefined ? await readStdin() : readPayloadFile(file);
  const payload = parseReviewPayload(raw);
  const submitted = await forge.submitReview(mr(call), payload);
  return said(submitted, [
    `posted on ${at}: overall note ${submitted.bodyNoteId === null ? "none" : String(submitted.bodyNoteId)}, ${String(submitted.inlineDiscussionIds.length)} inline, approval ${submitted.approval}`,
    submitted.url,
  ]);
}

type Verb = (at: At) => Promise<Outcome>;

function handler(verb: Verb): Handler {
  return async (call) => {
    try {
      const project: GitlabProject = await resolveGitlabProject(
        runCommand,
        optionalString(call, "project") ?? null,
      );
      const at = `${project.path}!${String(mr(call))}`;
      return await verb({ forge: gitlabForge(runCommand, project), at, call });
    } catch (error) {
      if (error instanceof MissingError) {
        return fail("missing", error.message);
      }
      if (error instanceof UsageError) {
        return fail("usage", error.message);
      }
      throw error;
    }
  };
}

/** Keyed by the full merged-binary verb ("qsm-forge gl <verb>" minus the
 * bin word), so scripts/cli.ts only ever spreads this into runCli's table. */
export const handlers: Readonly<Record<string, Handler>> = {
  "gl status": handler(status),
  "gl threads": handler(threads),
  "gl reply": handler(reply),
  "gl resolve": handler(resolve),
  "gl submit-review": handler(submitReview),
};
