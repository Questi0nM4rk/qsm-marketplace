// Which rules each semgrep checker runs: the decision the registry holds, so
// a pack added or dropped is a visible change to this table.

import { describe, expect, test } from "bun:test";
import { matchingFiles } from "./config.ts";
import { asRunAt, REGISTRY } from "./registry.ts";
import { OWN_RULES } from "./rules-data.ts";

const semgrep = REGISTRY.filter((spec) => spec.binary === "semgrep");

/** The limit a full semgrep run at pre-push gets: about twice the slowest measured. */
const PUSH_LIMIT_S = 420;

describe("semgrep checkers", () => {
  test("each runs the packs and rules decided for it", () => {
    const table = Object.fromEntries(semgrep.map((spec) => [spec.name, spec.packs]));

    expect(table).toEqual({
      "semgrep-ts": ["p/typescript", "p/nodejsscan"],
      "semgrep-py": ["p/python"],
      "semgrep-bash": [
        "r/bash.curl.security.curl-eval",
        "r/bash.curl.security.curl-pipe-bash",
        "r/bash.lang.security.ifs-tampering",
        "qsm/bash",
      ],
      "semgrep-rust": ["p/rust"],
      "semgrep-dotnet": ["p/csharp"],
      "semgrep-dockerfile": ["p/dockerfile"],
    });
  });

  // p/security-audit holds 225 rules and not one of them is a bash rule.
  test("semgrep-bash does not run p/security-audit", () => {
    const bash = semgrep.find((spec) => spec.name === "semgrep-bash");

    expect(bash?.packs).not.toContain("p/security-audit");
  });

  test("every pack is one --config: the local copy when the run has one, else its name", () => {
    const bash = semgrep.find((spec) => spec.name === "semgrep-bash");
    const rules = new Map([["r/bash.curl.security.curl-eval", "/scratch/0.yaml"]]);

    const args = bash?.args(["a.sh"], "/repo", undefined, rules) ?? [];

    const configs = args.flatMap((arg, i) => (arg === "--config" ? [args[i + 1]] : []));
    expect(configs).toEqual([
      "/scratch/0.yaml",
      "r/bash.curl.security.curl-pipe-bash",
      "r/bash.lang.security.ifs-tampering",
      "qsm/bash",
    ]);
    expect(args.at(-1)).toBe("a.sh");
  });

  test("every own rules file a checker names ships in the binary with rules in it", () => {
    const own = semgrep.flatMap((spec) => spec.packs ?? []).filter((p) => p.startsWith("qsm/"));

    expect(own.length).toBeGreaterThan(0);
    for (const pack of own) {
      expect(OWN_RULES[pack.slice("qsm/".length)]).toContain("- id: ");
    }
  });
});

describe("semgrep engines", () => {
  // Pre-commit is fast: the community engine over the changed files, on
  // every machine. Pre-push is the full run: the whole tree, and where the
  // login unlocks it the Pro engine, which follows a flow across files for
  // TypeScript, JavaScript, Python and C# and for nothing else.
  test("each declares its set at each enforcement point, and which runs Pro at pre-push", () => {
    // [pre-commit set, pre-push set, Pro at pre-push, pre-push limit in s]
    const table = Object.fromEntries(
      semgrep.map((spec) => [
        spec.name,
        [
          spec.fileSet,
          spec.prePush?.fileSet,
          spec.prePush?.pro !== undefined,
          (spec.prePush?.timeoutMs ?? 0) / 1000,
        ],
      ]),
    );

    expect(table).toEqual({
      "semgrep-ts": ["changed", "given", true, PUSH_LIMIT_S],
      "semgrep-py": ["changed", "given", true, PUSH_LIMIT_S],
      "semgrep-bash": ["changed", "given", false, PUSH_LIMIT_S],
      "semgrep-rust": ["changed", "given", false, PUSH_LIMIT_S],
      "semgrep-dotnet": ["changed", "given", true, PUSH_LIMIT_S],
      "semgrep-dockerfile": ["changed", "given", false, PUSH_LIMIT_S],
    });
  });

  test("the Pro argv is the community one with --pro first and the root as its one target", () => {
    const ts = semgrep.find((spec) => spec.name === "semgrep-ts");
    const rules = new Map([["p/typescript", "/scratch/0.yaml"]]);

    const community = ts?.args(["a.ts", "b.ts"], "/repo", undefined, rules) ?? [];
    const pro = ts?.prePush?.pro?.(["a.ts", "b.ts"], "/repo", undefined, rules) ?? [];

    expect(pro).toEqual(["--pro", ...community.slice(0, -2), "/repo"]);
    expect(community.slice(-2)).toEqual(["a.ts", "b.ts"]);
    expect(community).not.toContain("--pro");
    for (const spec of semgrep) {
      for (const point of ["pre-commit", "pre-push"] as const) {
        for (const engine of ["community", "pro"] as const) {
          const args = asRunAt(spec, point, engine).args(["a.ts"], "/repo");
          expect(args.slice(args.indexOf("--timeout"), args.indexOf("--timeout") + 2)).toEqual([
            "--timeout",
            "0",
          ]);
        }
      }
    }
  });
});

describe("semgrep at each enforcement point", () => {
  test("a checker runs as declared for the point, and its Pro argv only at pre-push under Pro", () => {
    const ts = semgrep.find((spec) => spec.name === "semgrep-ts");
    const bash = semgrep.find((spec) => spec.name === "semgrep-bash");
    if (ts === undefined || bash === undefined) {
      throw new Error("semgrep-ts and semgrep-bash are registered");
    }

    expect(asRunAt(ts, "pre-commit", "pro")).toBe(ts);
    const push = asRunAt(ts, "pre-push", "community");
    expect([push.fileSet, push.args(["a.ts"], "/repo").includes("--pro")]).toEqual([
      "given",
      false,
    ]);
    const pro = asRunAt(ts, "pre-push", "pro");
    expect([pro.fileSet, pro.args(["a.ts"], "/repo")[0], pro.timeoutMs]).toEqual([
      "given",
      "--pro",
      PUSH_LIMIT_S * 1000,
    ]);
    expect(asRunAt(bash, "pre-push", "pro").args(["a.sh"], "/repo")).not.toContain("--pro");
  });
});

describe("semgrep-dockerfile", () => {
  const docker = semgrep.find((spec) => spec.name === "semgrep-dockerfile");

  test("A Dockerfile with a suffix", () => {
    const files = [
      "Dockerfile",
      "svc/api/Dockerfile",
      "api.Dockerfile",
      "Dockerfile.prod",
      "docker-compose.yml",
      "Dockerfiles/notes.txt",
      "dockerfile-lint.sh",
      "src/main.ts",
      "Makefile",
    ];

    const covered = matchingFiles("/nowhere", files, docker?.extensions ?? [], docker?.names);

    expect(covered).toEqual([
      "Dockerfile",
      "svc/api/Dockerfile",
      "api.Dockerfile",
      "Dockerfile.prod",
    ]);
  });

  // semgrep picks the dockerfile parser for Dockerfile and *.Dockerfile by
  // name, and skips Dockerfile.prod unless told to scan unknown extensions.
  test("tells semgrep to scan a Dockerfile.* it would skip by its name", () => {
    expect(docker?.args(["Dockerfile.prod"], "/repo")).toContain("--scan-unknown-extensions");
    expect(docker?.args(["api.Dockerfile"], "/repo")).not.toContain("--scan-unknown-extensions");
  });
});

describe("measures", () => {
  const byName = new Map(REGISTRY.map((spec) => [spec.name, spec]));

  test("A quantity gated twice is a query, not a reading of 39 manuals", () => {
    for (const spec of REGISTRY) {
      expect(spec.measures.counts.length).toBeGreaterThan(10);
    }
    const overlapping = REGISTRY.filter((spec) => (spec.measures.overlaps ?? []).length > 0);
    expect(overlapping.map((spec) => spec.name).toSorted()).toEqual([
      "bash-syntax",
      "csharpier",
      "dotnet-format",
      "shellcheck",
    ]);
  });

  test("an overlap names a check that exists", () => {
    for (const spec of REGISTRY) {
      for (const other of spec.measures.overlaps ?? []) {
        expect(byName.has(other)).toBe(true);
      }
    }
  });

  // Counting the same quantity is a relation between two checks, so a claim
  // written on one side only is a claim half made.
  test("an overlap is declared on both checks", () => {
    for (const spec of REGISTRY) {
      for (const other of spec.measures.overlaps ?? []) {
        expect(byName.get(other)?.measures.overlaps ?? []).toContain(spec.name);
      }
    }
  });

  test("an overlapping pair shares at least one extension, since that is what the field means", () => {
    for (const spec of REGISTRY) {
      for (const other of spec.measures.overlaps ?? []) {
        const theirs = byName.get(other)?.extensions ?? [];
        expect(spec.extensions.some((extension) => theirs.includes(extension))).toBe(true);
      }
    }
  });
});
