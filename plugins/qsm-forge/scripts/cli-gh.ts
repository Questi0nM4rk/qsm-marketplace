#!/usr/bin/env bun

// The GitHub half of qsm-forge: a pull request's review threads as one call each ("qsm-forge gh
// <verb>").

import {
  type Call,
  flagArg,
  type Handler,
  optionalString,
  readStdin,
  requiredNumber,
} from "../../../lib/cli-base.ts";
import { fail, type Outcome, ok } from "../../../lib/outcome.ts";
import { runCommand } from "../lib/exec.ts";
import {
  dismissStaleReviews,
  type GithubForge,
  githubForge,
  latestReply,
  listComments,
  replyToThread,
  resolveAllThreads,
  resolveThread,
} from "../lib/github.ts";
import { type GithubRepo, resolveGithubRepo } from "../lib/remote.ts";
import { oneLine, place, table } from "../lib/render.ts";
import { parseReviewPayload, readPayloadFile } from "../lib/review-payload.ts";

const BODY_WIDTH = 80;
const FILE_WIDTH = 40;

/** What every verb is handed: the forge, the label a human reads, and the
 * call's own arguments. */
interface At {
  readonly forge: GithubForge;
  readonly at: string;
  readonly call: Call;
}

function said(value: unknown, lines: readonly string[]): Outcome {
  return ok(value, lines.join("\n"));
}

function pr(call: Call): number {
  return requiredNumber(call, "pr");
}

async function status({ forge, at, call }: At): Promise<Outcome> {
  const found = await forge.status(pr(call));
  const checks = found.checks.map((check) => [
    oneLine(check.name, FILE_WIDTH),
    check.status,
    check.conclusion,
  ]);
  return said(found, [
    `${at}  ${found.state}`,
    `review decision:  ${found.reviewDecision}`,
    `merge readiness:  ${found.mergeStateStatus}`,
    `auto-merge:       ${found.autoMerge ? "enabled" : "disabled"}`,
    `unresolved:       ${String(found.unresolvedThreads)}`,
    "",
    ...(checks.length === 0
      ? ["no checks reported"]
      : table(
          [
            { header: "check", width: FILE_WIDTH },
            { header: "status", width: 12 },
            { header: "result", width: 12 },
          ],
          checks,
        )),
  ]);
}

async function threads({ forge, at, call }: At): Promise<Outcome> {
  const unresolved = (await forge.threads(pr(call))).filter((thread) => !thread.resolved);
  if (unresolved.length === 0) {
    return said({ unresolved: [] }, [`no unresolved threads on ${at}`]);
  }
  const rows = unresolved.map((thread) => [
    String(thread.comments.at(0)?.id ?? 0),
    oneLine(thread.path, FILE_WIDTH),
    thread.line === null ? "-" : String(thread.line),
    oneLine(thread.comments.at(0)?.body ?? "", BODY_WIDTH),
    latestReply(thread) === null ? "no" : "yes",
  ]);
  return said({ unresolved }, [
    `${String(unresolved.length)} unresolved on ${at}`,
    "",
    ...table(
      [
        { header: "comment", width: 12 },
        { header: "file", width: FILE_WIDTH },
        { header: "line", width: 6 },
        { header: "said", width: BODY_WIDTH },
        { header: "replied", width: 7 },
      ],
      rows,
    ),
  ]);
}

async function comments({ forge, at, call }: At): Promise<Outcome> {
  const onlyUnresolved = flagArg(call, "unresolved");
  const listed = listComments(await forge.threads(pr(call)), onlyUnresolved);
  if (listed.length === 0) {
    return said({ comments: [] }, [
      onlyUnresolved ? `no unresolved comments on ${at}` : `no review comments on ${at}`,
    ]);
  }
  return said(
    { comments: listed },
    table(
      [
        { header: "comment", width: 12 },
        { header: "author", width: 18 },
        { header: "at", width: FILE_WIDTH },
        { header: "said", width: BODY_WIDTH },
        { header: "resolved", width: 8 },
      ],
      listed.map((comment) => [
        String(comment.id),
        oneLine(comment.author, 18),
        oneLine(place(comment.path, comment.line), FILE_WIDTH),
        oneLine(comment.body, BODY_WIDTH),
        comment.resolved ? "yes" : "no",
      ]),
    ),
  );
}

async function reply({ forge, at, call }: At): Promise<Outcome> {
  const message = optionalString(call, "message") ?? "";
  // A reply with nothing to say is the one call this wrapper will not make:
  // it would resolve a thread with an empty note under the person's name.
  if (message.trim().length === 0) {
    return fail("usage", "reply requires --message; nothing was posted");
  }
  const outcome = await replyToThread(forge, {
    pr: pr(call),
    commentId: requiredNumber(call, "commentId"),
    message,
    keepOpen: flagArg(call, "noResolve"),
  });
  return said({ thread: outcome.thread.id, replied: true, resolved: outcome.resolved }, [
    `replied on ${at} ${place(outcome.thread.path, outcome.thread.line)}`,
    outcome.resolved ? "thread resolved" : "thread left open",
  ]);
}

async function resolve({ forge, at, call }: At): Promise<Outcome> {
  const outcome = await resolveThread(
    forge,
    pr(call),
    requiredNumber(call, "commentId"),
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

async function resolveAll({ forge, at, call }: At): Promise<Outcome> {
  const outcome = await resolveAllThreads(forge, pr(call), optionalString(call, "message") ?? null);
  const open = outcome.resolved.length + outcome.left.length;
  const where = (threadsIn: typeof outcome.resolved) =>
    threadsIn.map((thread) => `  ${place(thread.path, thread.line)}`);
  if (open === 0) {
    return said(outcome, [`no unresolved threads on ${at}`]);
  }
  if (outcome.resolved.length === 0) {
    return said(outcome, [
      `none of the ${String(open)} open threads on ${at} carry a fixed-in reply; nothing resolved`,
    ]);
  }
  return said(outcome, [
    `resolved ${String(outcome.resolved.length)} on ${at}`,
    ...where(outcome.resolved),
    ...(outcome.left.length === 0
      ? []
      : [`left open ${String(outcome.left.length)}`, ...where(outcome.left)]),
  ]);
}

async function dismissReviews({ forge, at, call }: At): Promise<Outcome> {
  const outcome = await dismissStaleReviews(
    forge,
    pr(call),
    optionalString(call, "author") ?? null,
    optionalString(call, "message") ?? null,
  );
  if (outcome.dismissed.length === 0) {
    return said(outcome, [`nothing to dismiss on ${at}`]);
  }
  return said(outcome, [
    `dismissed ${String(outcome.dismissed.length)} on ${at}`,
    ...outcome.dismissed.map((review) => `  ${String(review.id)} by ${review.author}`),
  ]);
}

async function submitReview({ forge, at, call }: At): Promise<Outcome> {
  const file = optionalString(call, "file");
  const raw = file === undefined ? await readStdin() : readPayloadFile(file);
  const payload = parseReviewPayload(raw);
  const submitted = await forge.submitReview(pr(call), payload);
  return said(submitted, [
    `posted review ${String(submitted.id)} (${submitted.state}) on ${at}`,
    submitted.url,
  ]);
}

type Verb = (at: At) => Promise<Outcome>;

/** Resolves the repository, builds the forge, and runs the verb. */
function handler(verb: Verb): Handler {
  return async (call) => {
    const repo: GithubRepo = await resolveGithubRepo(
      runCommand,
      optionalString(call, "repo") ?? null,
    );
    const at = `${repo.owner}/${repo.repo}#${String(pr(call))}`;
    return verb({ forge: githubForge(runCommand, repo), at, call });
  };
}

/** Keyed by the full merged-binary verb ("qsm-forge gh <verb>" minus the
 * bin word), so scripts/cli.ts only ever spreads this into runCli's table. */
export const handlers: Readonly<Record<string, Handler>> = {
  "gh status": handler(status),
  "gh threads": handler(threads),
  "gh comments": handler(comments),
  "gh reply": handler(reply),
  "gh resolve": handler(resolve),
  "gh resolve-all": handler(resolveAll),
  "gh dismiss-reviews": handler(dismissReviews),
  "gh submit-review": handler(submitReview),
};
