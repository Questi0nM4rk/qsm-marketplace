// GitHub, in three separable pieces: what a call looks like (the arg builders), what an answer
// means (the mappers), and the forge that runs one and maps the other.

import { UsageError } from "../../../lib/outcome.ts";
import { parseAs, type Run } from "./exec.ts";
import type { GithubRepo } from "./remote.ts";
import type { ReviewPayload } from "./review-payload.ts";
import {
  arrayOf,
  type Guard,
  isBoolean,
  isNumber,
  isString,
  objectOf,
  orAbsent,
  orNull,
} from "./shape.ts";

/** Where and when a comment was written; every value is null when GitHub has none. */
interface GhProvenance {
  readonly url: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly authorAssociation: string;
  readonly authorType: string | null;
  readonly reviewId: number | null;
  readonly commit: string | null;
  readonly originalCommit: string | null;
  readonly commentLine: number | null;
  readonly originalLine: number | null;
  readonly startLine: number | null;
  readonly originalStartLine: number | null;
}

interface GhComment extends GhProvenance {
  readonly id: number;
  readonly author: string;
  readonly body: string;
}

export interface GhThread {
  readonly id: string;
  readonly resolved: boolean;
  readonly path: string;
  readonly line: number | null;
  readonly comments: readonly GhComment[];
}

interface GhCheck {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string;
}

export interface GhStatus {
  readonly state: string;
  readonly reviewDecision: string;
  readonly mergeStateStatus: string;
  readonly autoMerge: boolean;
  readonly unresolvedThreads: number;
  readonly checks: readonly GhCheck[];
}

export interface GhReview {
  readonly id: number;
  readonly author: string;
  readonly state: string;
}

interface GhSubmittedReview {
  readonly id: number;
  readonly url: string;
  readonly state: string;
}

/** A review still asking for changes; the one state `dismiss-reviews` acts
 * on. */
export const CHANGES_REQUESTED = "CHANGES_REQUESTED";

interface GqlComment {
  readonly databaseId: number;
  readonly body: string;
  readonly author: { readonly login: string; readonly type: string } | null;
  readonly url: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly authorAssociation: string;
  readonly pullRequestReview: { readonly databaseId: number | null } | null;
  readonly commit: { readonly oid: string } | null;
  readonly originalCommit: { readonly oid: string } | null;
  readonly line: number | null;
  readonly originalLine: number | null;
  readonly startLine: number | null;
  readonly originalStartLine: number | null;
}

interface GqlThread {
  readonly id: string;
  readonly isResolved: boolean;
  readonly path: string;
  readonly line: number | null;
  readonly comments: { readonly nodes: readonly GqlComment[] };
}

interface GqlPageInfo {
  readonly hasNextPage: boolean;
  readonly endCursor: string | null;
}

interface GqlCheck {
  readonly name?: string;
  readonly status?: string;
  readonly conclusion?: string | null;
}

interface GqlReview {
  readonly databaseId: number;
  readonly author: { readonly login: string } | null;
  readonly state: string;
}

interface GqlPullRequest {
  readonly state: string;
  readonly reviewDecision: string | null;
  readonly mergeStateStatus: string;
  readonly autoMergeRequest: { readonly enabledAt: string } | null;
  readonly reviewThreads: {
    readonly nodes: readonly GqlThread[];
    readonly pageInfo: GqlPageInfo;
  };
  readonly reviews: {
    readonly nodes: readonly GqlReview[];
    readonly pageInfo: GqlPageInfo;
  };
  readonly commits: {
    readonly nodes: readonly {
      readonly commit: {
        readonly statusCheckRollup: {
          readonly contexts: { readonly nodes: readonly GqlCheck[] };
        } | null;
      };
    }[];
  };
}

/** The answer to one query. Each query asks for some of the pull request's fields, so a mapper
 * names the ones it reads. */
export interface GqlResponse<P> {
  readonly data: {
    readonly repository: { readonly pullRequest: P | null } | null;
  };
}

export type GqlPullRequestResponse = GqlResponse<GqlPullRequest>;
type ThreadsPullRequest = Pick<GqlPullRequest, "reviewThreads">;
type ReviewsPullRequest = Pick<GqlPullRequest, "reviews">;
type StatusPullRequest = Pick<
  GqlPullRequest,
  "state" | "reviewDecision" | "mergeStateStatus" | "autoMergeRequest" | "commits"
>;

interface GqlResolveResponse {
  readonly data: {
    readonly resolveReviewThread: { readonly thread: { readonly isResolved: boolean } };
  };
}

interface RestReview {
  readonly id: number;
  readonly html_url: string;
  readonly state: string;
}

interface Connection<N> {
  readonly nodes: readonly N[];
  readonly pageInfo: GqlPageInfo;
}

type GqlCommit = GqlPullRequest["commits"]["nodes"][number];
type GqlRollup = NonNullable<GqlCommit["commit"]["statusCheckRollup"]>;

const isLogin = orNull(objectOf<{ readonly login: string }>({ login: isString }));
const isPageInfo = objectOf<GqlPageInfo>({ hasNextPage: isBoolean, endCursor: orNull(isString) });
const isOid = orNull(objectOf<{ readonly oid: string }>({ oid: isString }));
const isComment = objectOf<GqlComment>({
  databaseId: isNumber,
  body: isString,
  author: orNull(
    objectOf<{ readonly login: string; readonly type: string }>({
      login: isString,
      type: isString,
    }),
  ),
  url: isString,
  createdAt: isString,
  updatedAt: isString,
  authorAssociation: isString,
  pullRequestReview: orNull(
    objectOf<{ readonly databaseId: number | null }>({ databaseId: orNull(isNumber) }),
  ),
  commit: isOid,
  originalCommit: isOid,
  line: orNull(isNumber),
  originalLine: orNull(isNumber),
  startLine: orNull(isNumber),
  originalStartLine: orNull(isNumber),
});
const isThread = objectOf<GqlThread>({
  id: isString,
  isResolved: isBoolean,
  path: isString,
  line: orNull(isNumber),
  comments: objectOf<GqlThread["comments"]>({ nodes: arrayOf(isComment) }),
});
const isReview = objectOf<GqlReview>({ databaseId: isNumber, author: isLogin, state: isString });
const isCheck = objectOf<GqlCheck>({
  name: orAbsent(isString),
  status: orAbsent(isString),
  conclusion: orAbsent(orNull(isString)),
});
const isCommit = objectOf<GqlCommit>({
  commit: objectOf<GqlCommit["commit"]>({
    statusCheckRollup: orNull(
      objectOf<GqlRollup>({
        contexts: objectOf<GqlRollup["contexts"]>({ nodes: arrayOf(isCheck) }),
      }),
    ),
  }),
});

function connectionOf<N>(node: Guard<N>): Guard<Connection<N>> {
  return objectOf<Connection<N>>({ nodes: arrayOf(node), pageInfo: isPageInfo });
}

function responseOf<P extends object>(pullRequest: Guard<P>): Guard<GqlResponse<P>> {
  return objectOf<GqlResponse<P>>({
    data: objectOf<GqlResponse<P>["data"]>({
      repository: orNull(
        objectOf<{ readonly pullRequest: P | null }>({ pullRequest: orNull(pullRequest) }),
      ),
    }),
  });
}

const isThreadsResponse = responseOf(
  objectOf<ThreadsPullRequest>({ reviewThreads: connectionOf(isThread) }),
);
const isReviewsResponse = responseOf(
  objectOf<ReviewsPullRequest>({ reviews: connectionOf(isReview) }),
);
const isStatusResponse = responseOf(
  objectOf<StatusPullRequest>({
    state: isString,
    reviewDecision: orNull(isString),
    mergeStateStatus: isString,
    autoMergeRequest: orNull(objectOf<{ readonly enabledAt: string }>({ enabledAt: isString })),
    commits: objectOf<GqlPullRequest["commits"]>({ nodes: arrayOf(isCommit) }),
  }),
);
const isResolveResponse = objectOf<GqlResolveResponse>({
  data: objectOf<GqlResolveResponse["data"]>({
    resolveReviewThread: objectOf<GqlResolveResponse["data"]["resolveReviewThread"]>({
      thread: objectOf<{ readonly isResolved: boolean }>({ isResolved: isBoolean }),
    }),
  }),
});
const isRestReview = objectOf<RestReview>({ id: isNumber, html_url: isString, state: isString });

const THREAD_FIELDS = `
        nodes {
          id
          isResolved
          path
          line
          comments(first: 100) {
            nodes {
              databaseId body url createdAt updatedAt authorAssociation
              author { login type: __typename }
              pullRequestReview { databaseId }
              commit { oid }
              originalCommit { oid }
              line originalLine startLine originalStartLine
            }
          }
        }
        pageInfo { hasNextPage endCursor }`;

const THREADS_QUERY = `query($owner: String!, $repo: String!, $pr: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100, after: $cursor) {${THREAD_FIELDS}
      }
    }
  }
}`;

const REVIEWS_QUERY = `query($owner: String!, $repo: String!, $pr: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviews(first: 100, after: $cursor) {
        nodes { databaseId author { login } state }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

/** The pull request's own fields only. */
const STATUS_QUERY = `query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      state
      reviewDecision
      mergeStateStatus
      autoMergeRequest { enabledAt }
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              contexts(first: 100) {
                nodes { ... on CheckRun { name status conclusion } }
              }
            }
          }
        }
      }
    }
  }
}`;

const RESOLVE_MUTATION = `mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { isResolved }
  }
}`;

/** `gh api graphql` takes `-f name=value` for text and `-F name=value` for
 * a number, and gets the two wrong the other way round. */
export function graphqlArgs(query: string, variables: Readonly<Record<string, string | number>>) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    args.push(typeof value === "number" ? "-F" : "-f", `${key}=${String(value)}`);
  }
  return args;
}

export function replyArgs(repo: GithubRepo, pr: number, commentId: number, body: string) {
  return [
    "api",
    "--method",
    "POST",
    `repos/${repo.owner}/${repo.repo}/pulls/${String(pr)}/comments/${String(commentId)}/replies`,
    "-f",
    `body=${body}`,
  ];
}

export function dismissArgs(repo: GithubRepo, pr: number, reviewId: number, message: string) {
  return [
    "api",
    "--method",
    "PUT",
    `repos/${repo.owner}/${repo.repo}/pulls/${String(pr)}/reviews/${String(reviewId)}/dismissals`,
    "-f",
    `message=${message}`,
  ];
}

const EVENTS: Readonly<Record<ReviewPayload["decision"], string>> = {
  comment: "COMMENT",
  approve: "APPROVE",
  "request-changes": "REQUEST_CHANGES",
};

/** One review, one request: `gh api` repeats `comments[][field]` per inline
 * comment, and GitHub reads the run as a list. */
export function submitReviewArgs(repo: GithubRepo, pr: number, payload: ReviewPayload) {
  const args = [
    "api",
    "--method",
    "POST",
    `repos/${repo.owner}/${repo.repo}/pulls/${String(pr)}/reviews`,
    "-f",
    `event=${EVENTS[payload.decision]}`,
    "-f",
    `body=${payload.body}`,
  ];
  for (const comment of payload.inline) {
    args.push(
      "-f",
      `comments[][path]=${comment.path}`,
      "-F",
      `comments[][line]=${String(comment.line)}`,
      "-f",
      `comments[][body]=${comment.body}`,
    );
  }
  return args;
}

function pullRequestOf<P>(response: GqlResponse<P>, repo: GithubRepo, pr: number): P {
  const found = response.data.repository?.pullRequest ?? null;
  if (found === null) {
    throw new Error(`no pull request #${String(pr)} in ${repo.owner}/${repo.repo}`);
  }
  return found;
}

function commentOf(node: GqlComment): GhComment {
  return {
    id: node.databaseId,
    author: node.author?.login ?? "unknown",
    body: node.body,
    url: node.url,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    authorAssociation: node.authorAssociation,
    authorType: node.author?.type ?? null,
    reviewId: node.pullRequestReview?.databaseId ?? null,
    commit: node.commit?.oid ?? null,
    originalCommit: node.originalCommit?.oid ?? null,
    commentLine: node.line,
    originalLine: node.originalLine,
    startLine: node.startLine,
    originalStartLine: node.originalStartLine,
  };
}

function threadOf(node: GqlThread): GhThread {
  return {
    id: node.id,
    resolved: node.isResolved,
    path: node.path,
    line: node.line,
    comments: node.comments.nodes.map(commentOf),
  };
}

export function mapThreads(
  response: GqlResponse<ThreadsPullRequest>,
  repo: GithubRepo,
  pr: number,
): readonly GhThread[] {
  return pullRequestOf(response, repo, pr).reviewThreads.nodes.map(threadOf);
}

function after(pageInfo: GqlPageInfo): string | null {
  return pageInfo.hasNextPage ? pageInfo.endCursor : null;
}

function nextThreadCursor(
  response: GqlResponse<ThreadsPullRequest>,
  repo: GithubRepo,
  pr: number,
): string | null {
  return after(pullRequestOf(response, repo, pr).reviewThreads.pageInfo);
}

function nextReviewCursor(
  response: GqlResponse<ReviewsPullRequest>,
  repo: GithubRepo,
  pr: number,
): string | null {
  return after(pullRequestOf(response, repo, pr).reviews.pageInfo);
}

function checksOf(pullRequest: StatusPullRequest): GhCheck[] {
  const rollup = pullRequest.commits.nodes.at(-1)?.commit.statusCheckRollup ?? null;
  if (rollup === null) {
    return [];
  }
  return rollup.contexts.nodes
    .filter((node) => node.name !== undefined)
    .map((node) => ({
      name: node.name ?? "",
      status: node.status ?? "",
      conclusion: node.conclusion ?? "",
    }));
}

/**
 * The status fields, plus the unresolved count taken from the threads the caller already read to
 * the last page.
 */
export function mapStatus(
  response: GqlResponse<StatusPullRequest>,
  repo: GithubRepo,
  pr: number,
  threads: readonly GhThread[],
): GhStatus {
  const pullRequest = pullRequestOf(response, repo, pr);
  return {
    state: pullRequest.state,
    reviewDecision: pullRequest.reviewDecision ?? "NONE",
    mergeStateStatus: pullRequest.mergeStateStatus,
    autoMerge: pullRequest.autoMergeRequest !== null,
    unresolvedThreads: threads.filter((thread) => !thread.resolved).length,
    checks: checksOf(pullRequest),
  };
}

export function mapReviews(
  response: GqlResponse<ReviewsPullRequest>,
  repo: GithubRepo,
  pr: number,
): readonly GhReview[] {
  return pullRequestOf(response, repo, pr).reviews.nodes.map((node) => ({
    id: node.databaseId,
    author: node.author?.login ?? "unknown",
    state: node.state,
  }));
}

function mapSubmittedReview(response: RestReview): GhSubmittedReview {
  return { id: response.id, url: response.html_url, state: response.state };
}

/** The thread a comment id belongs to. */
function threadOfComment(threads: readonly GhThread[], commentId: number): GhThread | undefined {
  return threads.find((thread) => thread.comments.some((comment) => comment.id === commentId));
}

/** The marker `resolve-all` looks for when it was given no message: the
 * reply that says the point was addressed and names where. */
export function carriesFixedMarker(body: string): boolean {
  return /^fixed in\b/i.test(body.trim());
}

export interface GithubForge {
  threads: (pr: number) => Promise<readonly GhThread[]>;
  status: (pr: number) => Promise<GhStatus>;
  reviews: (pr: number) => Promise<readonly GhReview[]>;
  reply: (pr: number, commentId: number, body: string) => Promise<void>;
  resolve: (threadId: string) => Promise<boolean>;
  dismiss: (pr: number, reviewId: number, message: string) => Promise<void>;
  submitReview: (pr: number, payload: ReviewPayload) => Promise<GhSubmittedReview>;
}

/** How many pages of one connection this asks for before it stops. */
const MAX_PAGES = 20;

/** One connection, read to its last page. */
async function everyPage<T>(
  what: string,
  page: (cursor: string | null) => Promise<readonly [readonly T[], string | null]>,
): Promise<readonly T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  for (let read = 0; read < MAX_PAGES; read += 1) {
    const [items, next] = await page(cursor);
    all.push(...items);
    if (next === null) {
      return all;
    }
    cursor = next;
  }
  throw new Error(`more than ${String(MAX_PAGES)} pages of ${what}; narrow the ask`);
}

export function githubForge(run: Run, repo: GithubRepo): GithubForge {
  const gh = async <T>(args: readonly string[], what: string, guard: Guard<T>): Promise<T> =>
    parseAs(await run("gh", args), what, guard);

  const connection = <T>(query: string, pr: number, cursor: string | null, guard: Guard<T>) => {
    const variables: Record<string, string | number> = { owner: repo.owner, repo: repo.repo, pr };
    if (cursor !== null) {
      variables.cursor = cursor;
    }
    return gh(graphqlArgs(query, variables), "gh api graphql", guard);
  };

  const threads = (pr: number): Promise<readonly GhThread[]> =>
    everyPage<GhThread>("threads", async (cursor) => {
      const response = await connection(THREADS_QUERY, pr, cursor, isThreadsResponse);
      return [mapThreads(response, repo, pr), nextThreadCursor(response, repo, pr)] as const;
    });

  const reviews = (pr: number): Promise<readonly GhReview[]> =>
    everyPage<GhReview>("reviews", async (cursor) => {
      const response = await connection(REVIEWS_QUERY, pr, cursor, isReviewsResponse);
      return [mapReviews(response, repo, pr), nextReviewCursor(response, repo, pr)] as const;
    });

  const statusResponse = (pr: number) =>
    gh(
      graphqlArgs(STATUS_QUERY, { owner: repo.owner, repo: repo.repo, pr }),
      "gh api graphql",
      isStatusResponse,
    );

  return {
    threads,
    reviews,
    status: async (pr) => mapStatus(await statusResponse(pr), repo, pr, await threads(pr)),
    reply: async (pr, commentId, body) => {
      await run("gh", replyArgs(repo, pr, commentId, body));
    },
    resolve: async (threadId) => {
      const response = await gh(
        graphqlArgs(RESOLVE_MUTATION, { threadId }),
        "gh api graphql",
        isResolveResponse,
      );
      return response.data.resolveReviewThread.thread.isResolved;
    },
    dismiss: async (pr, reviewId, message) => {
      await run("gh", dismissArgs(repo, pr, reviewId, message));
    },
    submitReview: async (pr, payload) =>
      mapSubmittedReview(
        await gh(submitReviewArgs(repo, pr, payload), "gh api pulls reviews", isRestReview),
      ),
  };
}

/** The thread a verb was pointed at, or a refusal that names the comment. */
export function requireThread(
  threads: readonly GhThread[],
  commentId: number,
  pr: number,
): GhThread {
  const found = threadOfComment(threads, commentId);
  if (found === undefined) {
    throw new UsageError(
      `no thread on #${String(pr)} holds comment ${String(commentId)}; run \`qsm-forge gh threads ${String(pr)}\``,
    );
  }
  return found;
}

export interface ListedComment extends GhProvenance {
  readonly id: number;
  readonly author: string;
  readonly path: string;
  readonly line: number | null;
  readonly body: string;
  readonly resolved: boolean;
}

/** Every review comment, or only the ones in an unresolved thread. A
 * comment's own resolution is its thread's; GitHub has no other. */
export function listComments(
  threads: readonly GhThread[],
  onlyUnresolved: boolean,
): ListedComment[] {
  const kept = onlyUnresolved ? threads.filter((thread) => !thread.resolved) : threads;
  return kept.flatMap((thread) =>
    thread.comments.map((comment) => ({
      ...comment,
      path: thread.path,
      line: thread.line,
      resolved: thread.resolved,
    })),
  );
}

/** The comment a caller names a thread by when the wrapper picks: its
 * first one, the one the reviewer wrote. */
function anchorId(thread: GhThread): number {
  return thread.comments.at(0)?.id ?? 0;
}

/** The latest reply, or null when nobody has answered yet. The opening
 * comment is not a reply to itself. */
export function latestReply(thread: GhThread): string | null {
  return thread.comments.length > 1 ? (thread.comments.at(-1)?.body ?? null) : null;
}

export interface ReplyOutcome {
  readonly thread: GhThread;
  readonly resolved: boolean;
}

/** Reply, then close what was answered. `keepOpen` is the caller's opt-out;
 * an already-resolved thread is left as it is rather than resolved twice. */
export interface ReplyRequest {
  readonly pr: number;
  readonly commentId: number;
  readonly message: string;
  /** The caller's opt-out from GitHub's "answered means closed". */
  readonly keepOpen: boolean;
}

export async function replyToThread(
  forge: GithubForge,
  request: ReplyRequest,
): Promise<ReplyOutcome> {
  const { pr, commentId, message } = request;
  const thread = requireThread(await forge.threads(pr), commentId, pr);
  await forge.reply(pr, commentId, message);
  if (request.keepOpen || thread.resolved) {
    return { thread, resolved: thread.resolved };
  }
  return { thread, resolved: await forge.resolve(thread.id) };
}

export interface ResolveOutcome {
  readonly thread: GhThread;
  readonly resolved: boolean;
  readonly alreadyResolved: boolean;
}

/** Resolve one thread, posting `message` first when there is one. */
export async function resolveThread(
  forge: GithubForge,
  pr: number,
  commentId: number,
  message: string | null,
): Promise<ResolveOutcome> {
  const thread = requireThread(await forge.threads(pr), commentId, pr);
  if (thread.resolved) {
    return { thread, resolved: true, alreadyResolved: true };
  }
  if (message !== null) {
    await forge.reply(pr, commentId, message);
  }
  return { thread, resolved: await forge.resolve(thread.id), alreadyResolved: false };
}

export interface ResolveAllOutcome {
  readonly resolved: readonly GhThread[];
  readonly left: readonly GhThread[];
}

/** Given a message, answer and close every open thread. */
export async function resolveAllThreads(
  forge: GithubForge,
  pr: number,
  message: string | null,
): Promise<ResolveAllOutcome> {
  const open = (await forge.threads(pr)).filter((thread) => !thread.resolved);
  const resolved: GhThread[] = [];
  const left: GhThread[] = [];
  for (const thread of open) {
    const marked = latestReply(thread);
    if (message === null && !(marked !== null && carriesFixedMarker(marked))) {
      left.push(thread);
      continue;
    }
    if (message !== null) {
      await forge.reply(pr, anchorId(thread), message);
    }
    await forge.resolve(thread.id);
    resolved.push(thread);
  }
  return { resolved, left };
}

export interface DismissOutcome {
  readonly dismissed: readonly GhReview[];
  readonly message: string;
}

/** What a dismissal says when the caller did not write one. */
const DEFAULT_DISMISSAL = "Superseded: the requested changes are in.";

/** Dismiss every review still asking for changes, one author's only when
 * `author` names one. No matching review is an answer, not a failure. */
export async function dismissStaleReviews(
  forge: GithubForge,
  pr: number,
  author: string | null,
  message: string | null,
): Promise<DismissOutcome> {
  const said = message ?? DEFAULT_DISMISSAL;
  const stale = (await forge.reviews(pr)).filter(
    (review) => review.state === CHANGES_REQUESTED && (author === null || review.author === author),
  );
  for (const review of stale) {
    await forge.dismiss(pr, review.id, said);
  }
  return { dismissed: stale, message: said };
}
