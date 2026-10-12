// GitLab, in the same three pieces as GitHub: the paths and args a call takes, what an answer
// means, and the forge that runs one and maps the other.

import { UsageError } from "./errors.ts";
import { parseJson, type Run } from "./exec.ts";
import type { GitlabProject } from "./remote.ts";
import type { ReviewPayload } from "./review-payload.ts";

interface GlNote {
  readonly id: number;
  readonly author: string;
  readonly body: string;
  readonly system: boolean;
}

export interface GlThread {
  /** The discussion id: a string, unlike GitHub's numeric comment ids. */
  readonly id: string;
  readonly resolved: boolean;
  readonly path: string;
  readonly line: number | null;
  readonly notes: readonly GlNote[];
}

export interface GlStatus {
  readonly state: string;
  readonly mergeStatus: string;
  readonly autoMerge: boolean;
  readonly blockingDiscussionsResolved: boolean;
  readonly pipeline: string | null;
  readonly unresolvedThreads: number;
}

interface GlSubmittedReview {
  readonly url: string;
  readonly bodyNoteId: number | null;
  readonly inlineDiscussionIds: readonly string[];
  readonly approval: "approved" | "withdrawn" | "unchanged";
}

interface ApiNote {
  readonly id: number;
  readonly body: string;
  readonly system: boolean;
  readonly resolvable: boolean;
  readonly resolved?: boolean;
  readonly author?: { readonly username?: string };
  readonly position?: {
    readonly new_path?: string;
    readonly old_path?: string;
    readonly new_line?: number | null;
    readonly old_line?: number | null;
  };
}

export interface ApiDiscussion {
  readonly id: string;
  readonly individual_note: boolean;
  readonly notes: readonly ApiNote[];
}

export interface ApiMergeRequest {
  readonly state: string;
  readonly detailed_merge_status: string;
  readonly merge_when_pipeline_succeeds: boolean;
  readonly blocking_discussions_resolved: boolean;
  readonly web_url: string;
  readonly diff_refs: {
    readonly base_sha: string;
    readonly start_sha: string;
    readonly head_sha: string;
  };
  readonly head_pipeline: { readonly status: string } | null;
}

interface PostedNote {
  readonly id: number;
}

interface PostedDiscussion {
  readonly id: string;
}

const PER_PAGE = 100;

function mergeRequestBase(project: GitlabProject, mr: number): string {
  return `projects/${project.encodedPath}/merge_requests/${String(mr)}`;
}

export function mergeRequestPath(project: GitlabProject, mr: number): string {
  return mergeRequestBase(project, mr);
}

export function discussionsPath(project: GitlabProject, mr: number): string {
  return `${mergeRequestBase(project, mr)}/discussions`;
}

export function discussionsPage(project: GitlabProject, mr: number, page: number): string {
  return `${discussionsPath(project, mr)}?per_page=${String(PER_PAGE)}&page=${String(page)}`;
}

export function discussionPath(project: GitlabProject, mr: number, discussionId: string): string {
  return `${discussionsPath(project, mr)}/${discussionId}`;
}

export function discussionNotesPath(
  project: GitlabProject,
  mr: number,
  discussionId: string,
): string {
  return `${discussionPath(project, mr, discussionId)}/notes`;
}

export function notesPath(project: GitlabProject, mr: number): string {
  return `${mergeRequestBase(project, mr)}/notes`;
}

export function approvalPath(project: GitlabProject, mr: number, approve: boolean): string {
  return `${mergeRequestBase(project, mr)}/${approve ? "approve" : "unapprove"}`;
}

export function readArgs(path: string): string[] {
  return ["api", path];
}

/** A write sends its body on standard input, so a message with a newline,
 * a quote, or a backtick in it reaches GitLab as the person wrote it. */
export function writeArgs(path: string, method: "POST" | "PUT"): string[] {
  return ["api", path, "--method", method, "--input", "-", "-H", "Content-Type: application/json"];
}

function noteOf(note: ApiNote): GlNote {
  return {
    id: note.id,
    author: note.author?.username ?? "unknown",
    body: note.body,
    system: note.system,
  };
}

/**
 * A discussion becomes a review thread only when it is one: not a system event, not a standalone
 * comment, and resolvable.
 */
function threadOf(discussion: ApiDiscussion): GlThread | null {
  const first = discussion.notes.at(0);
  if (first === undefined || first.system || discussion.individual_note || !first.resolvable) {
    return null;
  }
  return {
    id: discussion.id,
    resolved: first.resolved === true,
    ...placeOf(first.position),
    notes: discussion.notes.map(noteOf),
  };
}

function placeOf(position: ApiNote["position"]): { path: string; line: number | null } {
  return {
    path: position?.new_path ?? position?.old_path ?? "",
    line: position?.new_line ?? position?.old_line ?? null,
  };
}

export function mapThreads(discussions: readonly ApiDiscussion[]): readonly GlThread[] {
  return discussions.map(threadOf).filter((thread): thread is GlThread => thread !== null);
}

export function mapStatus(mergeRequest: ApiMergeRequest, threads: readonly GlThread[]): GlStatus {
  return {
    state: mergeRequest.state,
    mergeStatus: mergeRequest.detailed_merge_status,
    autoMerge: mergeRequest.merge_when_pipeline_succeeds,
    blockingDiscussionsResolved: mergeRequest.blocking_discussions_resolved,
    pipeline: mergeRequest.head_pipeline?.status ?? null,
    unresolvedThreads: threads.filter((thread) => !thread.resolved).length,
  };
}

/** The thread a note id belongs to. */
function threadOfNote(threads: readonly GlThread[], noteId: number): GlThread | undefined {
  return threads.find((thread) => thread.notes.some((note) => note.id === noteId));
}

/** The thread a verb was pointed at, or a refusal naming the note. */
export function requireThread(threads: readonly GlThread[], noteId: number, mr: number): GlThread {
  const found = threadOfNote(threads, noteId);
  if (found === undefined) {
    throw new UsageError(
      `no thread on !${String(mr)} holds note ${String(noteId)}; run \`qsm-forge gl threads ${String(mr)}\``,
    );
  }
  return found;
}

/** The position an inline comment needs: which diff, which file, which line. */
export function inlineDiscussionBody(
  mergeRequest: ApiMergeRequest,
  comment: ReviewPayload["inline"][number],
) {
  return {
    body: comment.body,
    position: {
      base_sha: mergeRequest.diff_refs.base_sha,
      start_sha: mergeRequest.diff_refs.start_sha,
      head_sha: mergeRequest.diff_refs.head_sha,
      position_type: "text",
      new_path: comment.path,
      new_line: comment.line,
    },
  };
}

export interface GitlabForge {
  threads: (mr: number) => Promise<readonly GlThread[]>;
  status: (mr: number) => Promise<GlStatus>;
  reply: (mr: number, discussionId: string, body: string) => Promise<void>;
  resolve: (mr: number, discussionId: string) => Promise<void>;
  submitReview: (mr: number, payload: ReviewPayload) => Promise<GlSubmittedReview>;
}

/** Discussions come a hundred to a page; past this the merge request is not
 * being reviewed. */
const MAX_DISCUSSION_PAGES = 20;

interface GlApi {
  readonly read: <T>(path: string) => Promise<T>;
  readonly write: <T>(path: string, method: "POST" | "PUT", body: unknown) => Promise<T>;
}

function apiOver(run: Run): GlApi {
  return {
    read: async <T>(path: string): Promise<T> =>
      parseJson<T>(await run("glab", readArgs(path)), `glab api ${path}`),
    write: async <T>(path: string, method: "POST" | "PUT", body: unknown): Promise<T> =>
      parseJson<T>(
        await run("glab", writeArgs(path, method), JSON.stringify(body)),
        `glab api ${path}`,
      ),
  };
}

async function allDiscussions(api: GlApi, project: GitlabProject, mr: number) {
  const all: ApiDiscussion[] = [];
  for (let page = 1; page <= MAX_DISCUSSION_PAGES; page += 1) {
    const batch = await api.read<ApiDiscussion[]>(discussionsPage(project, mr, page));
    all.push(...batch);
    if (batch.length < PER_PAGE) {
      return all;
    }
  }
  throw new Error(`more than ${String(MAX_DISCUSSION_PAGES)} pages of discussions; narrow the ask`);
}

/** GitLab has no single review object: approval is its own call, and a
 * request for changes withdraws an approval that may not be there, which
 * the API answers with an error we read as "nothing to withdraw". */
async function settleApproval(
  api: GlApi,
  project: GitlabProject,
  mr: number,
  payload: ReviewPayload,
): Promise<GlSubmittedReview["approval"]> {
  if (payload.decision === "approve") {
    await api.write(approvalPath(project, mr, true), "POST", {});
    return "approved";
  }
  if (payload.decision !== "request-changes") {
    return "unchanged";
  }
  try {
    await api.write(approvalPath(project, mr, false), "POST", {});
    return "withdrawn";
  } catch {
    return "unchanged";
  }
}

async function postReview(
  api: GlApi,
  project: GitlabProject,
  mr: number,
  payload: ReviewPayload,
): Promise<GlSubmittedReview> {
  const info = await api.read<ApiMergeRequest>(mergeRequestPath(project, mr));
  let bodyNoteId: number | null = null;
  if (payload.body.trim().length > 0) {
    const note = await api.write<PostedNote>(notesPath(project, mr), "POST", {
      body: payload.body,
    });
    bodyNoteId = note.id;
  }
  const inlineDiscussionIds: string[] = [];
  for (const comment of payload.inline) {
    const created = await api.write<PostedDiscussion>(
      discussionsPath(project, mr),
      "POST",
      inlineDiscussionBody(info, comment),
    );
    inlineDiscussionIds.push(created.id);
  }
  const approval = await settleApproval(api, project, mr, payload);
  return { url: info.web_url, bodyNoteId, inlineDiscussionIds, approval };
}

export function gitlabForge(run: Run, project: GitlabProject): GitlabForge {
  const api = apiOver(run);
  const threads = async (mr: number) => mapThreads(await allDiscussions(api, project, mr));
  const mergeRequest = (mr: number) => api.read<ApiMergeRequest>(mergeRequestPath(project, mr));
  return {
    threads,
    status: async (mr) => mapStatus(await mergeRequest(mr), await threads(mr)),
    reply: async (mr, discussionId, body) => {
      await api.write(discussionNotesPath(project, mr, discussionId), "POST", { body });
    },
    resolve: async (mr, discussionId) => {
      await api.write(discussionPath(project, mr, discussionId), "PUT", { resolved: true });
    },
    submitReview: (mr, payload) => postReview(api, project, mr, payload),
  };
}

export interface GlReplyOutcome {
  readonly thread: GlThread;
  readonly resolved: boolean;
}

/** Reply and stop. */
export async function replyToThread(
  forge: GitlabForge,
  mr: number,
  noteId: number,
  message: string,
): Promise<GlReplyOutcome> {
  const thread = requireThread(await forge.threads(mr), noteId, mr);
  await forge.reply(mr, thread.id, message);
  return { thread, resolved: thread.resolved };
}

export interface GlResolveOutcome {
  readonly thread: GlThread;
  readonly resolved: boolean;
  readonly alreadyResolved: boolean;
}

/** Resolve one thread, posting `message` first when there is one. */
export async function resolveThread(
  forge: GitlabForge,
  mr: number,
  noteId: number,
  message: string | null,
): Promise<GlResolveOutcome> {
  const thread = requireThread(await forge.threads(mr), noteId, mr);
  if (thread.resolved) {
    return { thread, resolved: true, alreadyResolved: true };
  }
  if (message !== null) {
    await forge.reply(mr, thread.id, message);
  }
  await forge.resolve(mr, thread.id);
  return { thread, resolved: true, alreadyResolved: false };
}
