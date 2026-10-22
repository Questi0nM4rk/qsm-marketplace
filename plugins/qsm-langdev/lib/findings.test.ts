// Output parsers whose identity rule is not obvious from the tool's format.

import { describe, expect, test } from "bun:test";
import { countJscpd, countSemgrep, countShellMetrics } from "./findings.ts";

describe("countShellMetrics", () => {
  const output = `==============================================================================
  LLOC  CCN  Location
------------------------------------------------------------------------------
     2   12  f:2 a.sh
     2    1  <main> a.sh
------------------------------------------------------------------------------
 1 file(s), 2 function(s) analyzed. [bash 5.3.20(1)-release]

==============================================================================
 NLOC    NLOC  LLOC    LLOC    CCN Func File (lines:comment:blank)
total     avg total     avg    avg  cnt
------------------------------------------------------------------------------
   42   42.00     4    2.00   1.50    2 a.sh (5:1:0)
------------------------------------------------------------------------------
`;

  test("the per-file and total average rows are not complexity findings", () => {
    expect(countShellMetrics(output, 10)).toBe(1);
  });
});

function semgrepOutput(checkId: string): string {
  return JSON.stringify({
    results: [{ check_id: checkId, path: "a.py", start: { line: 3, col: 5 } }],
    errors: [],
  });
}

describe("countSemgrep", () => {
  // semgrep names a rule read from a local file after that file's directory,
  // and a run's pack files sit in a scratch directory with a fresh name: the
  // same rule would read as a new finding against a side stored by another run.
  test("a rule read from a run's pack file is known by its own id, not by the scratch directory", () => {
    const stored = countSemgrep(
      semgrepOutput("tmp.qsm-langdev-packs-rkLWPy.python.lang.security.shell-true"),
      "",
      1,
    );
    const fresh = countSemgrep(
      semgrepOutput("home.u.v1.2.tmp.qsm-langdev-packs-Ab3dE9.python.lang.security.shell-true"),
      "",
      1,
    );

    expect(stored?.findings?.[0]?.identity).toBe("python.lang.security.shell-true");
    expect(fresh?.findings?.[0]?.identity).toBe("python.lang.security.shell-true");
  });

  test("a rule semgrep read from its registry keeps its id", () => {
    const tally = countSemgrep(semgrepOutput("python.lang.security.shell-true"), "", 1);

    expect(tally?.findings?.[0]?.identity).toBe("python.lang.security.shell-true");
  });
});

describe("countJscpd", () => {
  test("a renamed clone head reads the same as before, so a rename is no worse", () => {
    const report = (head: string) =>
      JSON.stringify({
        statistics: { total: { clones: 1 } },
        duplicates: [{ fragment: `${head}\nsame body`, firstFile: { name: "a.ts", start: 1 } }],
      });

    expect(countJscpd(report('test("old title"'), "", 0)).toEqual(
      countJscpd(report('test("new title"'), "", 0),
    );
    expect(countJscpd(report("x"), "", 0)).toEqual({ total: 1 });
  });

  test("a report without a clone count is not measured", () => {
    expect(countJscpd("{}", "", 0)).toBeNull();
  });
});
