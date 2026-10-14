// The gh half of qsm-forge through its real surface: the merged binary's
// argv, stdout, stderr, exit, with every call prefixed "gh". `gh` is a
// script the test writes into a sandbox and puts first on PATH, so nothing
// here reaches GitHub, and the working directory is a scratch dir with no
// origin remote, so repository detection is what the test says it is and
// not what the developer's checkout happens to be.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseJson } from "../lib/exec.ts";
import { isRecord } from "../../../lib/outcome.ts";
import { isNumber, isString, objectOf, orNull } from "../lib/shape.ts";

const CLI = resolve(import.meta.dir, "cli.ts");

const GRAPHQL = {
  data: {
    repository: {
      pullRequest: {
        state: "OPEN",
        reviewDecision: "CHANGES_REQUESTED",
        mergeStateStatus: "BLOCKED",
        autoMergeRequest: null,
        reviewThreads: {
          nodes: [
            {
              id: "T1",
              isResolved: false,
              path: "src/a.ts",
              line: 42,
              comments: {
                nodes: [
                  { databaseId: 901, body: "this leaks a handle", author: { login: "a-reviewer" } },
                ],
              },
            },
          ],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
        reviews: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        commits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  contexts: {
                    nodes: [{ name: "build", status: "COMPLETED", conclusion: "SUCCESS" }],
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

let sandbox = "";
let cwd = "";

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "qsm-forge-gh-"));
  cwd = mkdtempSync(join(tmpdir(), "qsm-forge-gh-cwd-"));
  writeFileSync(join(sandbox, "graphql.json"), JSON.stringify(GRAPHQL));
  const fake = join(sandbox, "gh");
  writeFileSync(
    fake,
    `#!/bin/sh
if [ -n "$GH_FAKE_FAILS" ]; then echo 'gh: HTTP 404 Not Found' >&2; exit 1; fi
case "$*" in
  *graphql*) cat '${join(sandbox, "graphql.json")}' ;;
  *) printf '%s\\n' '{"id":77,"html_url":"https://example.test/r/1","state":"COMMENTED"}' ;;
esac
`,
  );
  chmodSync(fake, 0o755);
});

afterAll(() => {
  for (const dir of [sandbox, cwd]) {
    if (dir !== "") {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function cli(args: readonly string[], env: Record<string, string> = {}): Run {
  const r = spawnSync("bun", [CLI, ...args], {
    encoding: "utf8",
    cwd,
    env: { PATH: `${sandbox}:${process.env.PATH ?? ""}`, HOME: sandbox, ...env },
  });
  return { code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
}

interface Envelope {
  readonly code: string;
  readonly exit: number;
  readonly data: Record<string, unknown> | null;
}

const isEnvelope = objectOf<Envelope>({ code: isString, exit: isNumber, data: orNull(isRecord) });

function envelope(run: Run): Envelope {
  const parsed = parseJson(run.stdout, "qsm-forge");
  if (!isEnvelope(parsed)) {
    throw new Error(`not an envelope: ${run.stdout}`);
  }
  return parsed;
}

describe("qsm-forge gh through the shared base", () => {
  test("gh --help lists the group's verbs, new words dropped", () => {
    const run = cli(["gh", "--help"]);
    expect(run.code).toBe(0);
    for (const verb of [
      "status",
      "threads",
      "comments",
      "reply",
      "resolve",
      "resolve-all",
      "dismiss-reviews",
      "submit-review",
    ]) {
      expect(run.stdout).toContain(`  ${verb}`);
    }
    expect(run.stdout).not.toContain("gl status");
  });

  test("an unknown flag is a usage error, exit 2", () => {
    const run = cli(["gh", "status", "12", "--nope"]);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain("unknown flag --nope");
  });

  test("Reply without a message", () => {
    const run = cli(["gh", "reply", "12", "901", "--message", "   ", "--repo", "owner/name"]);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain("--message");
  });

  test("A payload file that cannot be read", () => {
    const run = cli([
      "gh",
      "submit-review",
      "12",
      "--file",
      "/nope.json",
      "--repo",
      "owner/name",
      "--json",
    ]);
    expect(run.code).toBe(4);
    expect(envelope(run)).toMatchObject({ code: "missing", exit: 4 });
    expect(run.stdout).toContain("nothing was posted");
  });

  test("no repository anywhere is missing, exit 4", () => {
    const run = cli(["gh", "status", "12"]);
    expect(run.code).toBe(4);
    expect(run.stderr).toContain("--repo owner/name");
  });
});

describe("qsm-forge gh output and forge failures", () => {
  test("status prints the pull request's state, through the merged binary's new words", () => {
    const run = cli(["gh", "status", "12", "--repo", "owner/name"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("owner/name#12  OPEN");
    expect(run.stdout).toContain("unresolved:       1");
  });

  test("--json is one envelope carrying the status as data", () => {
    const run = cli(["gh", "status", "12", "--repo", "owner/name", "--json"]);
    expect(run.code).toBe(0);
    expect(envelope(run)).toMatchObject({
      code: "ok",
      exit: 0,
      data: { state: "OPEN", unresolvedThreads: 1 },
    });
  });

  test("a forge that says no is failed, exit 1", () => {
    const run = cli(["gh", "status", "12", "--repo", "owner/name"], { GH_FAKE_FAILS: "1" });
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("gh");
  });
});
