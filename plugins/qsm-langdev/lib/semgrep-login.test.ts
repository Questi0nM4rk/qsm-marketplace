// Whether the semgrep CLI is logged in, asked through its exit code only.
// The spawn is handed in, so no test needs semgrep or a login.
import { describe, expect, test } from "bun:test";
import {
  semgrepEngine,
  semgrepLogin,
  semgrepLoginWarning,
  semgrepProEngine,
} from "./semgrep-login.ts";

function exits(code: number | null, calls: string[][] = [], output = "") {
  return (cmd: string, args: readonly string[]) => {
    calls.push([cmd, ...args]);
    return { status: code, output };
  };
}

describe("semgrep login probe", () => {
  test("exit 0 of semgrep show identity is logged in", () => {
    const calls: string[][] = [];
    expect(semgrepLogin({}, exits(0, calls))).toBe("logged-in");
    expect(calls).toEqual([["semgrep", "show", "identity"]]);
  });

  test("exit 2 is logged out, and warns with the login command", () => {
    const state = semgrepLogin({}, exits(2));
    expect(state).toBe("logged-out");
    expect(semgrepLoginWarning(state)).toBe(
      "semgrep is not logged in: run semgrep login to use qsm-langdev at its fullest",
    );
  });

  test("a SEMGREP_APP_TOKEN in the environment is logged in, and nothing spawns", () => {
    const calls: string[][] = [];
    expect(semgrepLogin({ SEMGREP_APP_TOKEN: "x" }, exits(2, calls))).toBe("logged-in");
    expect(calls).toHaveLength(0);
  });

  test("an empty SEMGREP_APP_TOKEN is no token", () => {
    expect(semgrepLogin({ SEMGREP_APP_TOKEN: "" }, exits(2))).toBe("logged-out");
  });

  test("any other exit, or no exit at all, is unknown and says so, never logged out", () => {
    for (const code of [1, 127, null]) {
      const state = semgrepLogin({}, exits(code));
      expect(state).toBe("unknown");
      expect(semgrepLoginWarning(state)).toBe(
        "semgrep login state is unknown: semgrep show identity answered neither logged in (exit 0) nor logged out (exit 2); run it to see why",
      );
    }
  });

  test("exit 2 with a 401 is a login the server rejects, and says to log in again", () => {
    const answer =
      '[WARNING]: Failed to download identity, https://semgrep.dev/api/agent/identity returned 401: {"error":"Not authorized"}\n ERROR  Failed to determine identity';
    const state = semgrepLogin({}, exits(2, [], answer));
    expect(state).toBe("rejected");
    expect(semgrepLoginWarning(state)).toBe(
      "semgrep's login is rejected by semgrep.dev (401): run semgrep login again to use qsm-langdev at its fullest",
    );
  });

  test("logged in warns nothing", () => {
    expect(semgrepLoginWarning("logged-in")).toBeNull();
  });
});

describe("semgrep Pro engine probe", () => {
  const says =
    (status: number | null, stdout: string, calls: string[][] = []) =>
    (cmd: string, args: readonly string[]) => {
      calls.push([cmd, ...args]);
      return { status, stdout };
    };
  const here = import.meta.path;

  test("the path semgrep names for its Pro engine, present, is installed", () => {
    const calls: string[][] = [];
    expect(semgrepProEngine(says(0, `${here}\n`, calls))).toBe("installed");
    expect(calls).toEqual([["semgrep", "--dump-engine-path", "--pro"]]);
  });

  test("a named path with no file there is missing", () => {
    expect(semgrepProEngine(says(0, "/nowhere/semgrep-core-proprietary\n"))).toBe("missing");
  });

  test("no path, or a failed probe, is unknown", () => {
    expect(semgrepProEngine(says(0, ""))).toBe("unknown");
    expect(semgrepProEngine(says(2, `${here}\n`))).toBe("unknown");
    expect(semgrepProEngine(says(null, ""))).toBe("unknown");
  });
});

describe("the semgrep engine a run uses", () => {
  const never = (): never => {
    throw new Error("the Pro engine is probed only when logged in");
  };

  test("logged in with the Pro engine installed runs pro, warning nothing", () => {
    expect(semgrepEngine("logged-in", () => "installed")).toEqual({ engine: "pro" });
  });

  test("logged in without the Pro engine runs community and says how to install it", () => {
    expect(semgrepEngine("logged-in", () => "missing")).toEqual({
      engine: "community",
      warning: "semgrep Pro engine is not installed: run semgrep install-semgrep-pro",
    });
  });

  test("logged in with the Pro engine unknown runs community and says so", () => {
    expect(semgrepEngine("logged-in", () => "unknown")).toEqual({
      engine: "community",
      warning:
        "semgrep Pro engine state is unknown: semgrep --dump-engine-path --pro named no path; the community engine ran",
    });
  });

  test("logged out or unknown runs community, warning nothing here, and probes nothing", () => {
    expect(semgrepEngine("logged-out", never)).toEqual({ engine: "community" });
    expect(semgrepEngine("unknown", never)).toEqual({ engine: "community" });
  });
});
