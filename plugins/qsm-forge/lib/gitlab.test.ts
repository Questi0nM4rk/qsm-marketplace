// Recorded answers, never a network. Each fixture is the shape the GitLab
// API returns for the path above it, trimmed to the fields the mappers read.

import { describe, expect, test } from "bun:test";
import { UsageError } from "./errors.ts";
import { expectRejection } from "./rejection.ts";
import type { Run } from "./exec.ts";
import {
  type ApiDiscussion,
  type ApiMergeRequest,
  approvalPath,
  discussionNotesPath,
  discussionPath,
  discussionsPage,
  discussionsPath,
  type GitlabForge,
  gitlabForge,
  inlineDiscussionBody,
  mapStatus,
  mapThreads,
  mergeRequestPath,
  notesPath,
  readArgs,
  replyToThread,
  requireThread,
  resolveThread,
  writeArgs,
} from "./gitlab.ts";

const PROJECT = { path: "group/sub/project", encodedPath: "group%2Fsub%2Fproject" };
const MR = 7;

function note(id: number, body: string, extras: Partial<ApiDiscussion["notes"][number]> = {}) {
  return {
    id,
    body,
    system: false,
    resolvable: true,
    resolved: false,
    author: { username: "a-reviewer" },
    ...extras,
  };
}

const OPEN: ApiDiscussion = {
  id: "d1",
  individual_note: false,
  notes: [
    note(101, "this leaks a handle", {
      position: { new_path: "src/a.ts", new_line: 42 },
    }),
  ],
};

const ANSWERED: ApiDiscussion = {
  id: "d2",
  individual_note: false,
  notes: [
    note(201, "name this", { position: { old_path: "src/b.ts", old_line: 9 } }),
    note(202, "Fixed in abc1234", { author: { username: "the-author" } }),
  ],
};

const CLOSED: ApiDiscussion = {
  id: "d3",
  individual_note: false,
  notes: [note(301, "nit", { resolved: true, position: { new_path: "src/c.ts", new_line: 7 } })],
};

const STANDALONE: ApiDiscussion = {
  id: "d4",
  individual_note: true,
  notes: [note(401, "just a comment")],
};

const SYSTEM: ApiDiscussion = {
  id: "d5",
  individual_note: false,
  notes: [note(501, "changed the description", { system: true, resolvable: false })],
};

const MERGE_REQUEST: ApiMergeRequest = {
  state: "opened",
  detailed_merge_status: "discussions_not_resolved",
  merge_when_pipeline_succeeds: false,
  blocking_discussions_resolved: false,
  web_url: "https://gitlab.example.com/group/sub/project/-/merge_requests/7",
  diff_refs: { base_sha: "base0", start_sha: "start0", head_sha: "head0" },
  head_pipeline: { status: "failed" },
};

const ALL = [OPEN, ANSWERED, CLOSED, STANDALONE, SYSTEM];

describe("what a call looks like", () => {
  test("a project path is one segment, which is what the API takes", () => {
    expect(mergeRequestPath(PROJECT, MR)).toBe("projects/group%2Fsub%2Fproject/merge_requests/7");
    expect(discussionsPath(PROJECT, MR)).toEndWith("/merge_requests/7/discussions");
    expect(discussionPath(PROJECT, MR, "d1")).toEndWith("/discussions/d1");
    expect(discussionNotesPath(PROJECT, MR, "d1")).toEndWith("/discussions/d1/notes");
    expect(notesPath(PROJECT, MR)).toEndWith("/merge_requests/7/notes");
    expect(approvalPath(PROJECT, MR, true)).toEndWith("/approve");
    expect(approvalPath(PROJECT, MR, false)).toEndWith("/unapprove");
  });

  test("pages are asked for one at a time", () => {
    expect(discussionsPage(PROJECT, MR, 2)).toContain("per_page=100&page=2");
  });

  test("a read is a plain api call and a write sends its body on stdin", () => {
    expect(readArgs("path")).toEqual(["api", "path"]);
    const args = writeArgs("path", "PUT");
    expect(args).toContain("PUT");
    expect(args).toContain("--input");
    expect(args).toContain("-");
  });

  test("an inline comment carries the three shas that place it in the diff", () => {
    const body = inlineDiscussionBody(MERGE_REQUEST, {
      path: "src/a.ts",
      line: 42,
      body: "nice",
    });
    expect(body.position.base_sha).toBe("base0");
    expect(body.position.start_sha).toBe("start0");
    expect(body.position.head_sha).toBe("head0");
    expect(body.position.new_path).toBe("src/a.ts");
    expect(body.position.new_line).toBe(42);
    expect(body.position.position_type).toBe("text");
  });
});

describe("what an answer means", () => {
  test("only a resolvable, non-system, non-standalone discussion is a review thread", () => {
    expect(mapThreads(ALL).map((thread) => thread.id)).toEqual(["d1", "d2", "d3"]);
  });

  test("a thread takes its place from the note's position, new side or old", () => {
    const [first, second] = mapThreads(ALL);
    expect(first?.path).toBe("src/a.ts");
    expect(first?.line).toBe(42);
    expect(second?.path).toBe("src/b.ts");
    expect(second?.line).toBe(9);
  });

  test("Status requested", () => {
    const status = mapStatus(MERGE_REQUEST, mapThreads(ALL));
    expect(status.state).toBe("opened");
    expect(status.mergeStatus).toBe("discussions_not_resolved");
    expect(status.blockingDiscussionsResolved).toBe(false);
    expect(status.pipeline).toBe("failed");
    expect(status.unresolvedThreads).toBe(2);
  });

  test("a merge request with no pipeline says so rather than inventing one", () => {
    const status = mapStatus({ ...MERGE_REQUEST, head_pipeline: null }, mapThreads(ALL));
    expect(status.pipeline).toBeNull();
  });

  test("All threads resolved", () => {
    const threads = mapThreads([CLOSED]);
    expect(threads.filter((thread) => !thread.resolved)).toHaveLength(0);
  });
});

// --- the forge, driven by recorded answers ---------------------------------

interface Recorded {
  readonly forge: GitlabForge;
  readonly calls: { readonly args: readonly string[]; readonly stdin: string | undefined }[];
}

function recordedForge(discussions: readonly ApiDiscussion[] = ALL): Recorded {
  const calls: { args: readonly string[]; stdin: string | undefined }[] = [];
  const run: Run = (_command, args, stdin) => {
    calls.push({ args, stdin });
    const path = args.at(1) ?? "";
    if (path.includes("/discussions?")) {
      return Promise.resolve(JSON.stringify(discussions));
    }
    if (path.endsWith("/discussions")) {
      return Promise.resolve(JSON.stringify({ id: "new-discussion" }));
    }
    if (path.endsWith("/notes")) {
      return Promise.resolve(JSON.stringify({ id: 9001 }));
    }
    if (path.endsWith("/unapprove")) {
      return Promise.reject(new Error("glab: 404 not approved"));
    }
    if (path.endsWith("/approve")) {
      return Promise.resolve(JSON.stringify({}));
    }
    return Promise.resolve(JSON.stringify(MERGE_REQUEST));
  };
  return { forge: gitlabForge(run, PROJECT), calls };
}

describe("Platform unreachable", () => {
  test("the client's own error is what the caller sees", async () => {
    const run: Run = () => Promise.reject(new Error("glab: no token found"));
    await expectRejection(gitlabForge(run, PROJECT).status(MR), "no token found");
  });
});

describe("Identity does not exist", () => {
  test("a note on no thread is refused", () => {
    expect(() => requireThread(mapThreads(ALL), 999_999, MR)).toThrow(UsageError);
  });

  test("reply posts nothing when the note belongs to no thread", async () => {
    const { forge, calls } = recordedForge();
    await expectRejection(replyToThread(forge, MR, 999_999, "hello"), UsageError);
    expect(calls.every((call) => !call.args.includes("POST"))).toBe(true);
  });
});

describe("Effect on thread resolution", () => {
  test("a GitLab reply leaves the thread unresolved", async () => {
    const { forge, calls } = recordedForge();
    const outcome = await replyToThread(forge, MR, 101, "Fixed in abc1234");
    expect(outcome.resolved).toBe(false);
    expect(calls.some((call) => call.args.includes("PUT"))).toBe(false);
    const posted = calls.find((call) => call.args.includes("POST"));
    expect(posted?.args.at(1)).toEndWith("/discussions/d1/notes");
    expect(posted?.stdin).toBe(JSON.stringify({ body: "Fixed in abc1234" }));
  });
});

describe("resolving one thread", () => {
  test("Resolve without a reply", async () => {
    const { forge, calls } = recordedForge();
    const outcome = await resolveThread(forge, MR, 101, null);
    expect(outcome.resolved).toBe(true);
    expect(calls.some((call) => call.args.includes("POST"))).toBe(false);
    const put = calls.find((call) => call.args.includes("PUT"));
    expect(put?.stdin).toBe(JSON.stringify({ resolved: true }));
  });

  test("a message is posted before the thread closes", async () => {
    const { forge, calls } = recordedForge();
    await resolveThread(forge, MR, 101, "Fixed in abc1234");
    const order = calls.filter((call) => call.args.includes("POST") || call.args.includes("PUT"));
    expect(order.at(0)?.args).toContain("POST");
    expect(order.at(1)?.args).toContain("PUT");
  });

  test("Already resolved", async () => {
    const { forge, calls } = recordedForge();
    const outcome = await resolveThread(forge, MR, 301, null);
    expect(outcome.alreadyResolved).toBe(true);
    expect(calls.some((call) => call.args.includes("PUT"))).toBe(false);
  });

  test("Identity not found", async () => {
    const { forge } = recordedForge();
    await expectRejection(resolveThread(forge, MR, 42_424, null), UsageError);
  });
});

describe("Submit a whole review atomically", () => {
  test("Approve decision", async () => {
    const { forge, calls } = recordedForge();
    const submitted = await forge.submitReview(MR, {
      decision: "approve",
      body: "reads well",
      inline: [{ path: "src/a.ts", line: 42, body: "nice" }],
    });
    expect(submitted.bodyNoteId).toBe(9001);
    expect(submitted.inlineDiscussionIds).toEqual(["new-discussion"]);
    expect(submitted.approval).toBe("approved");
    expect(submitted.url).toEndWith("/merge_requests/7");
    expect(calls.some((call) => (call.args.at(1) ?? "").endsWith("/approve"))).toBe(true);
  });

  test("Request-changes decision", async () => {
    const { forge, calls } = recordedForge();
    const submitted = await forge.submitReview(MR, {
      decision: "request-changes",
      body: "not yet",
      inline: [],
    });
    // The fixture refuses the unapprove call the way GitLab does when there
    // was no approval to withdraw; that is an answer, not a failure.
    expect(submitted.approval).toBe("unchanged");
    expect(calls.some((call) => (call.args.at(1) ?? "").endsWith("/unapprove"))).toBe(true);
  });

  test("an empty overall comment posts no note", async () => {
    const { forge, calls } = recordedForge();
    const submitted = await forge.submitReview(MR, {
      decision: "comment",
      body: "   ",
      inline: [{ path: "src/a.ts", line: 42, body: "here" }],
    });
    expect(submitted.bodyNoteId).toBeNull();
    expect(submitted.approval).toBe("unchanged");
    expect(calls.some((call) => (call.args.at(1) ?? "").endsWith("/merge_requests/7/notes"))).toBe(
      false,
    );
  });
});
