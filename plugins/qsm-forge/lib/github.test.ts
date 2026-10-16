// Recorded answers, never a network. Each fixture is the shape gh prints
// for the call above it, trimmed to the fields the mappers read.

import { describe, expect, test } from "bun:test";
import { UsageError } from "./errors.ts";
import { expectRejection } from "./rejection.ts";
import type { Run } from "./exec.ts";
import {
  CHANGES_REQUESTED,
  carriesFixedMarker,
  dismissArgs,
  dismissStaleReviews,
  type GhThread,
  type GithubForge,
  type GqlPullRequestResponse,
  githubForge,
  graphqlArgs,
  latestReply,
  listComments,
  mapReviews,
  mapStatus,
  mapThreads,
  replyArgs,
  replyToThread,
  requireThread,
  resolveAllThreads,
  resolveThread,
  submitReviewArgs,
} from "./github.ts";
import type { ReviewPayload } from "./review-payload.ts";

const REPO = { owner: "owner", repo: "name" };
const PR = 12;

interface ThreadFixture {
  readonly id: string;
  readonly resolved: boolean;
  readonly path: string;
  readonly line: number | null;
  readonly bodies: readonly string[];
}

function gqlThread(fixture: ThreadFixture) {
  const { id, resolved, path, line, bodies } = fixture;
  return {
    id,
    isResolved: resolved,
    path,
    line,
    comments: {
      nodes: bodies.map((body, index) => ({
        databaseId: 100 + index + Number(id.slice(-1)) * 10,
        body,
        author: { login: index === 0 ? "a-reviewer" : "the-author" },
      })),
    },
  };
}

interface PageFixture {
  /** The cursor the next page of threads is asked for with, if there is one. */
  readonly threadsAfter?: string;
  /** The same for reviews. */
  readonly reviewsAfter?: string;
  readonly reviews?: readonly {
    databaseId: number;
    author: { login: string } | null;
    state: string;
  }[];
}

const REVIEWS = [
  { databaseId: 501, author: { login: "a-reviewer" }, state: CHANGES_REQUESTED },
  { databaseId: 502, author: { login: "a-bot" }, state: CHANGES_REQUESTED },
  { databaseId: 503, author: null, state: "APPROVED" },
];

function response(
  threads: readonly ReturnType<typeof gqlThread>[],
  page: PageFixture = {},
): GqlPullRequestResponse {
  return {
    data: {
      repository: {
        pullRequest: {
          state: "OPEN",
          reviewDecision: "CHANGES_REQUESTED",
          mergeStateStatus: "BLOCKED",
          autoMergeRequest: { enabledAt: "2020-01-01T00:00:00Z" },
          reviewThreads: {
            nodes: threads,
            pageInfo: {
              hasNextPage: page.threadsAfter !== undefined,
              endCursor: page.threadsAfter ?? null,
            },
          },
          reviews: {
            nodes: page.reviews ?? REVIEWS,
            pageInfo: {
              hasNextPage: page.reviewsAfter !== undefined,
              endCursor: page.reviewsAfter ?? null,
            },
          },
          commits: {
            nodes: [
              {
                commit: {
                  statusCheckRollup: {
                    contexts: {
                      nodes: [
                        { name: "build", status: "COMPLETED", conclusion: "SUCCESS" },
                        { name: "lint", status: "COMPLETED", conclusion: null },
                        {},
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
      },
    },
  };
}

const OPEN_THREAD = gqlThread({
  id: "T1",
  resolved: false,
  path: "src/a.ts",
  line: 42,
  bodies: ["this leaks a handle"],
});
const ANSWERED_THREAD = gqlThread({
  id: "T2",
  resolved: false,
  path: "src/b.ts",
  line: null,
  bodies: ["name this", "Fixed in abc1234"],
});
const RESOLVED_THREAD = gqlThread({
  id: "T3",
  resolved: true,
  path: "src/c.ts",
  line: 7,
  bodies: ["nit", "done"],
});
const FULL = response([OPEN_THREAD, ANSWERED_THREAD, RESOLVED_THREAD]);

const EMPTY: GqlPullRequestResponse = {
  data: { repository: { pullRequest: null } },
};

describe("what a call looks like", () => {
  test("a GraphQL variable is text or a number, and gh spells the two apart", () => {
    const args = graphqlArgs("query", { owner: "o", pr: 12 });
    expect(args.slice(0, 3)).toEqual(["api", "graphql", "-f"]);
    expect(args).toContain("-F");
    expect(args).toContain("pr=12");
    expect(args).toContain("owner=o");
  });

  test("a reply goes to the thread's replies endpoint", () => {
    expect(replyArgs(REPO, PR, 98_765, "Fixed in abc1234")).toEqual([
      "api",
      "--method",
      "POST",
      "repos/owner/name/pulls/12/comments/98765/replies",
      "-f",
      "body=Fixed in abc1234",
    ]);
  });

  test("a dismissal is a PUT carrying the message", () => {
    const args = dismissArgs(REPO, PR, 501, "superseded");
    expect(args).toContain("repos/owner/name/pulls/12/reviews/501/dismissals");
    expect(args).toContain("PUT");
    expect(args).toContain("message=superseded");
  });

  test("Approve decision: the payload becomes one request with every inline comment", () => {
    const payload: ReviewPayload = {
      decision: "approve",
      body: "reads well",
      inline: [{ path: "src/a.ts", line: 42, body: "nice" }],
    };
    const args = submitReviewArgs(REPO, PR, payload);
    expect(args).toContain("repos/owner/name/pulls/12/reviews");
    expect(args).toContain("event=APPROVE");
    expect(args).toContain("body=reads well");
    expect(args).toContain("comments[][path]=src/a.ts");
    expect(args).toContain("comments[][line]=42");
    expect(args).toContain("comments[][body]=nice");
  });

  test("Request-changes decision: the event says so", () => {
    const args = submitReviewArgs(REPO, PR, {
      decision: "request-changes",
      body: "not yet",
      inline: [],
    });
    expect(args).toContain("event=REQUEST_CHANGES");
  });

  test("a comment decision is neither approval nor refusal", () => {
    expect(submitReviewArgs(REPO, PR, { decision: "comment", body: "", inline: [] })).toContain(
      "event=COMMENT",
    );
  });
});

describe("what an answer means", () => {
  test("Status requested", () => {
    const status = mapStatus(FULL, REPO, PR, mapThreads(FULL, REPO, PR));
    expect(status.state).toBe("OPEN");
    expect(status.reviewDecision).toBe("CHANGES_REQUESTED");
    expect(status.mergeStateStatus).toBe("BLOCKED");
    expect(status.autoMerge).toBe(true);
    expect(status.unresolvedThreads).toBe(2);
    expect(status.checks).toEqual([
      { name: "build", status: "COMPLETED", conclusion: "SUCCESS" },
      { name: "lint", status: "COMPLETED", conclusion: "" },
    ]);
  });

  test("Identifier not found", () => {
    expect(() => mapStatus(EMPTY, REPO, PR, [])).toThrow("no pull request #12 in owner/name");
    expect(() => mapThreads(EMPTY, REPO, PR)).toThrow("no pull request #12");
  });

  test("a thread keeps its identity, place, and every comment", () => {
    const [first] = mapThreads(FULL, REPO, PR);
    expect(first?.id).toBe("T1");
    expect(first?.resolved).toBe(false);
    expect(first?.path).toBe("src/a.ts");
    expect(first?.line).toBe(42);
    expect(first?.comments.at(0)?.author).toBe("a-reviewer");
  });

  test("a review by a deleted account still has an author to print", () => {
    expect(mapReviews(FULL, REPO, PR).at(2)?.author).toBe("unknown");
  });

  test("Filtered to unresolved", () => {
    const threads = mapThreads(FULL, REPO, PR);
    const everything = listComments(threads, false);
    const open = listComments(threads, true);
    expect(everything).toHaveLength(5);
    expect(open).toHaveLength(3);
    expect(open.every((comment) => !comment.resolved)).toBe(true);
  });

  test("the fixed-in marker is read at the start of a reply, whatever its case", () => {
    expect(carriesFixedMarker("Fixed in abc1234")).toBe(true);
    expect(carriesFixedMarker("  fixed in abc1234 ")).toBe(true);
    expect(carriesFixedMarker("I think this is fixed in the next commit")).toBe(false);
    expect(carriesFixedMarker("fixedin abc")).toBe(false);
  });

  test("the opening comment is not a reply to itself", () => {
    const threads = mapThreads(FULL, REPO, PR);
    expect(latestReply(threadAt(threads, 0))).toBeNull();
    expect(latestReply(threadAt(threads, 1))).toBe("Fixed in abc1234");
  });
});

// --- the forge, driven by recorded answers ---------------------------------

interface Recorded {
  readonly forge: GithubForge;
  readonly calls: string[][];
}

function recordedForge(answers: Readonly<Record<string, unknown>>, threads = FULL): Recorded {
  const calls: string[][] = [];
  const run: Run = (command, args) => {
    calls.push([command, ...args]);
    const joined = args.join(" ");
    for (const [needle, answer] of Object.entries(answers)) {
      if (joined.includes(needle)) {
        return Promise.resolve(JSON.stringify(answer));
      }
    }
    return Promise.resolve(JSON.stringify(threads));
  };
  return { forge: githubForge(run, REPO), calls };
}

const RESOLVED_OK = { data: { resolveReviewThread: { thread: { isResolved: true } } } };

function threadAt(threads: readonly GhThread[], index: number): GhThread {
  const thread = threads[index];
  if (thread === undefined) {
    throw new Error(`no thread at index ${String(index)}`);
  }
  return thread;
}

describe("Platform unreachable", () => {
  test("Platform unreachable", async () => {
    const run: Run = () => Promise.reject(new Error("gh: gh auth login required"));
    await expectRejection(githubForge(run, REPO).status(PR), "gh auth login required");
  });

  test("an answer that is not JSON is named rather than thrown as a parser fault", async () => {
    const run: Run = () => Promise.resolve("<html>proxy error</html>");
    await expectRejection(githubForge(run, REPO).threads(PR), "did not answer with JSON");
  });
});

describe("Identity does not exist", () => {
  test("a comment on no thread is refused before anything is posted", () => {
    const threads = mapThreads(FULL, REPO, PR);
    expect(() => requireThread(threads, 999_999, PR)).toThrow(UsageError);
  });

  test("Identity does not exist", async () => {
    const { forge, calls } = recordedForge({});
    await expectRejection(
      replyToThread(forge, { pr: PR, commentId: 999_999, message: "hi", keepOpen: false }),
      UsageError,
    );
    expect(calls.every((call) => !call.includes("--method"))).toBe(true);
  });
});

describe("Effect on thread resolution", () => {
  test("a reply closes the thread it answered", async () => {
    const { forge, calls } = recordedForge({ resolveReviewThread: RESOLVED_OK });
    const anchor = mapThreads(FULL, REPO, PR).at(0)?.comments.at(0)?.id ?? 0;
    const outcome = await replyToThread(forge, {
      pr: PR,
      commentId: anchor,
      message: "Fixed in abc1234",
      keepOpen: false,
    });
    expect(outcome.resolved).toBe(true);
    expect(calls.some((call) => call.join(" ").includes("replies"))).toBe(true);
    expect(calls.some((call) => call.join(" ").includes("resolveReviewThread"))).toBe(true);
  });

  test("keepOpen replies and stops", async () => {
    const { forge, calls } = recordedForge({ resolveReviewThread: RESOLVED_OK });
    const anchor = mapThreads(FULL, REPO, PR).at(0)?.comments.at(0)?.id ?? 0;
    const outcome = await replyToThread(forge, {
      pr: PR,
      commentId: anchor,
      message: "still thinking",
      keepOpen: true,
    });
    expect(outcome.resolved).toBe(false);
    expect(calls.some((call) => call.join(" ").includes("resolveReviewThread"))).toBe(false);
  });
});

describe("resolving one thread", () => {
  test("Resolve without a reply", async () => {
    const { forge, calls } = recordedForge({ resolveReviewThread: RESOLVED_OK });
    const anchor = mapThreads(FULL, REPO, PR).at(0)?.comments.at(0)?.id ?? 0;
    const outcome = await resolveThread(forge, PR, anchor, null);
    expect(outcome.resolved).toBe(true);
    expect(calls.some((call) => call.join(" ").includes("replies"))).toBe(false);
  });

  test("Already resolved", async () => {
    const { forge, calls } = recordedForge({ resolveReviewThread: RESOLVED_OK });
    const anchor = mapThreads(FULL, REPO, PR).at(2)?.comments.at(0)?.id ?? 0;
    const outcome = await resolveThread(forge, PR, anchor, null);
    expect(outcome.alreadyResolved).toBe(true);
    expect(outcome.resolved).toBe(true);
    expect(calls.some((call) => call.join(" ").includes("resolveReviewThread"))).toBe(false);
  });

  test("Identity not found", async () => {
    const { forge } = recordedForge({});
    await expectRejection(resolveThread(forge, PR, 42_424, null), UsageError);
  });
});

describe("Resolve all eligible threads", () => {
  test("a message answers and closes every open thread", async () => {
    const { forge } = recordedForge({ resolveReviewThread: RESOLVED_OK });
    const outcome = await resolveAllThreads(forge, PR, "Fixed in abc1234");
    expect(outcome.resolved.map((thread) => thread.id)).toEqual(["T1", "T2"]);
    expect(outcome.left).toHaveLength(0);
  });

  test("without a message, only the threads whose latest reply carries the marker", async () => {
    const { forge } = recordedForge({ resolveReviewThread: RESOLVED_OK });
    const outcome = await resolveAllThreads(forge, PR, null);
    expect(outcome.resolved.map((thread) => thread.id)).toEqual(["T2"]);
    expect(outcome.left.map((thread) => thread.id)).toEqual(["T1"]);
  });

  test("No thread carries the marker", async () => {
    const unmarked = response([
      OPEN_THREAD,
      gqlThread({ id: "T4", resolved: false, path: "src/d.ts", line: 1, bodies: ["a", "hmm"] }),
    ]);
    const { forge, calls } = recordedForge({ resolveReviewThread: RESOLVED_OK }, unmarked);
    const outcome = await resolveAllThreads(forge, PR, null);
    expect(outcome.resolved).toHaveLength(0);
    expect(outcome.left).toHaveLength(2);
    expect(calls.some((call) => call.join(" ").includes("resolveReviewThread"))).toBe(false);
  });

  test("All threads resolved", async () => {
    const { forge } = recordedForge({}, response([RESOLVED_THREAD]));
    const outcome = await resolveAllThreads(forge, PR, null);
    expect(outcome.resolved).toHaveLength(0);
    expect(outcome.left).toHaveLength(0);
  });
});

describe("Dismiss stale reviews", () => {
  test("every changes-requested review is dismissed", async () => {
    const { forge, calls } = recordedForge({});
    const outcome = await dismissStaleReviews(forge, PR, null, "superseded");
    expect(outcome.dismissed.map((review) => review.id)).toEqual([501, 502]);
    expect(calls.filter((call) => call.join(" ").includes("dismissals"))).toHaveLength(2);
  });

  test("an author filter narrows it to that author", async () => {
    const { forge } = recordedForge({});
    const outcome = await dismissStaleReviews(forge, PR, "a-bot", null);
    expect(outcome.dismissed.map((review) => review.id)).toEqual([502]);
    expect(outcome.message.length).toBeGreaterThan(0);
  });

  test("No matching review", async () => {
    const { forge, calls } = recordedForge({});
    const outcome = await dismissStaleReviews(forge, PR, "nobody", null);
    expect(outcome.dismissed).toHaveLength(0);
    expect(calls.some((call) => call.join(" ").includes("dismissals"))).toBe(false);
  });
});

describe("a connection longer than one page", () => {
  /** Answers the threads query, the reviews query, and the status query
   * apart, so a second page is served only to the connection that asked for
   * it. The cursor variable is what says a page is the second one. */
  function pagedRun(second: GqlPullRequestResponse, first: GqlPullRequestResponse): Run {
    return (_command, args) => {
      const joined = args.join(" ");
      const wanted = joined.includes("reviewThreads") || joined.includes("reviews(first:");
      if (!wanted) {
        return Promise.resolve(JSON.stringify(FULL));
      }
      return Promise.resolve(JSON.stringify(joined.includes("cursor=") ? second : first));
    };
  }

  test("Status requested: the unresolved count covers every page of threads", async () => {
    const first = response([OPEN_THREAD], { threadsAfter: "page-2" });
    const second = response([ANSWERED_THREAD, RESOLVED_THREAD]);
    const status = await githubForge(pagedRun(second, first), REPO).status(PR);
    expect(status.unresolvedThreads).toBe(2);
  });

  test("a changes-requested review on a later page is still dismissed", async () => {
    const first = response([], { reviewsAfter: "page-2", reviews: [] });
    const second = response([], {
      reviews: [{ databaseId: 777, author: { login: "a-reviewer" }, state: CHANGES_REQUESTED }],
    });
    const forge = githubForge(pagedRun(second, first), REPO);
    const outcome = await dismissStaleReviews(forge, PR, null, "superseded");
    expect(outcome.dismissed.map((review) => review.id)).toEqual([777]);
  });

  test("a connection that never ends is refused rather than paged forever", async () => {
    const endless = response([OPEN_THREAD], { threadsAfter: "and-another" });
    const run: Run = () => Promise.resolve(JSON.stringify(endless));
    await expectRejection(githubForge(run, REPO).threads(PR), "more than 20 pages of threads");
  });
});

describe("Successful submission", () => {
  test("Successful submission", async () => {
    const { forge } = recordedForge({
      "pulls/12/reviews": {
        id: 9001,
        html_url: "https://github.com/owner/name/pull/12#pullrequestreview-9001",
        state: "APPROVED",
      },
    });
    const submitted = await forge.submitReview(PR, {
      decision: "approve",
      body: "reads well",
      inline: [],
    });
    expect(submitted.id).toBe(9001);
    expect(submitted.state).toBe("APPROVED");
    expect(submitted.url).toContain("pullrequestreview-9001");
  });
});
