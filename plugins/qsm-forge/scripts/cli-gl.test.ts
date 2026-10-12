// The gl half of qsm-forge through its real surface, against a `glab` the
// test writes into a sandbox and puts first on PATH, with every call
// prefixed "gl" for the merged binary.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
    notes: [
      {
        id: 301,
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

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "qsm-forge-gl-"));
  cwd = mkdtempSync(join(tmpdir(), "qsm-forge-gl-cwd-"));
  writeFileSync(join(sandbox, "mr.json"), JSON.stringify(MERGE_REQUEST));
  writeFileSync(join(sandbox, "discussions.json"), JSON.stringify(DISCUSSIONS));
  const fake = join(sandbox, "glab");
  writeFileSync(
    fake,
    `#!/bin/sh
if [ -n "$GLAB_FAKE_FAILS" ]; then echo 'glab: 404 Not Found' >&2; exit 1; fi
case "$*" in
  *discussions*) cat '${join(sandbox, "discussions.json")}' ;;
  *) cat '${join(sandbox, "mr.json")}' ;;
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

function envelope(run: Run): { code: string; exit: number; data: Record<string, unknown> } {
  return JSON.parse(run.stdout) as {
    code: string;
    exit: number;
    data: Record<string, unknown>;
  };
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
