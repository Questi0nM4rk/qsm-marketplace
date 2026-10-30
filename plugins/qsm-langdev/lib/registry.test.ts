// Which rules each semgrep checker runs: the decision the registry holds, so
// a pack added or dropped is a visible change to this table.

import { describe, expect, test } from "bun:test";
import { matchingFiles } from "./config.ts";
import { asRunAt, REGISTRY } from "./registry.ts";
import { OWN_RULES } from "./rules-data.ts";

const semgrep = REGISTRY.filter((spec) => spec.binary === "semgrep");

/** The limit a full semgrep run at pre-push gets: about twice the slowest measured. */

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

describe("semgrep at each enforcement point", () => {
  test("every semgrep checker scans the changed files at a commit and at a push alike", () => {
    for (const spec of semgrep) {
      expect(spec.fileSet).toBe("changed");
      expect(spec.prePush).toBeUndefined();
      expect(asRunAt(spec, "pre-push")).toBe(spec);
      const args = asRunAt(spec, "pre-push").args(["a.ts"], "/repo");
      expect(args).not.toContain("--pro");
      expect(args.slice(args.indexOf("--timeout"), args.indexOf("--timeout") + 2)).toEqual([
        "--timeout",
        "0",
      ]);
    }
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
    expect(overlapping.map((spec) => spec.name).toSorted()).toEqual(["bash-syntax", "shellcheck"]);
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
