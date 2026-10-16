// The gl half of qsm-forge through its real surface, against a `glab` the
// test writes into a sandbox and puts first on PATH, with every call
// prefixed "gl" for the merged binary.
import { beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseJson } from "../lib/exec.ts";
import { isRecord } from "../../../lib/outcome.ts";
import { isNumber, isString, objectOf, orNull } from "../lib/shape.ts";
import { fakeBin } from "../../../lib/fixtures/bin.ts";
import { isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const CLI = resolve(import.meta.dir, "cli.ts");

const MERGE_REQUEST = {
  state: "opened",
  detailed_merge_status: "not_approved",
  merge_when_pipeline_succeeds: false,
  blocking_discussions_resolved: false,
  web_url: "https://gitlab.example.test/group/project/-/merge_requests/5",
  diff_refs: { base_sha: "b", start_sha: "s", head_sha: "h" },
  head_pipeline: { status: "success" },
};

const DISCUSSIONS = [
  {
    id: "D1",
    individual_note: false,
    notes: [
      {
        id: 301,
        system: false,
        body: "this leaks a handle",
        author: { username: "a-reviewer" },
        resolvable: true,
        resolved: false,
        position: { new_path: "src/a.ts", new_line: 42 },
      },
    ],
  },
];

let sandbox = "";
let cwd = "";

beforeEach(() => {
  sandbox = sandboxDir("qsm-forge-gl-");
  cwd = sandboxDir("qsm-forge-gl-cwd-");
  writeFileSync(join(sandbox, "mr.json"), JSON.stringify(MERGE_REQUEST));
  writeFileSync(join(sandbox, "discussions.json"), JSON.stringify(DISCUSSIONS));
  fakeBin(
    sandbox,
    "glab",
    `if [ -n "$GLAB_FAKE_FAILS" ]; then echo 'glab: 404 Not Found' >&2; exit 1; fi
case "$*" in
  *discussions*) cat '${join(sandbox, "discussions.json")}' ;;
  *) cat '${join(sandbox, "mr.json")}' ;;
esac`,
  );
});

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function cli(args: readonly string[], env: Record<string, string> = {}): Run {
  const r = runBin(CLI, args, {
    cwd,
    env: isolatedEnv(sandbox, { PATH: `${sandbox}:${process.env.PATH ?? ""}`, ...env }),
  });
  return { code: r.exit, stdout: r.stdout, stderr: r.stderr };
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

describe("qsm-forge gl through the shared base", () => {
  test("gl --help lists the group's five verbs, new words dropped", () => {
    const run = cli(["gl", "--help"]);
    expect(run.code).toBe(0);
    for (const verb of ["status", "threads", "reply", "resolve", "submit-review"]) {
      expect(run.stdout).toContain(`  ${verb}`);
    }
    expect(run.stdout).not.toContain("gh status");
  });

  test("an unknown flag is a usage error, exit 2", () => {
    const run = cli(["gl", "status", "5", "--nope"]);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain("unknown flag --nope");
  });

  test("no project anywhere is missing, exit 4", () => {
    const run = cli(["gl", "status", "5"]);
    expect(run.code).toBe(4);
    expect(run.stderr).toContain("--project");
  });

  test("status prints the merge request's state, through the merged binary's new words", () => {
    const run = cli(["gl", "status", "5", "--project", "group/project"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("group/project!5  opened");
    expect(run.stdout).toContain("unresolved:       1");
  });

  test("--json is one envelope carrying the status as data", () => {
    const run = cli(["gl", "status", "5", "--project", "group/project", "--json"]);
    expect(run.code).toBe(0);
    expect(envelope(run)).toMatchObject({
      code: "ok",
      exit: 0,
      data: { state: "opened", unresolvedThreads: 1 },
    });
  });

  test("a forge that says no is failed, exit 1", () => {
    const run = cli(["gl", "status", "5", "--project", "group/project"], {
      GLAB_FAKE_FAILS: "1",
    });
    expect(run.code).toBe(1);
    expect(run.stderr).toContain("glab");
  });
});
