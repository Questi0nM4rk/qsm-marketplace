// The one step the install base cannot know: the command output filter. The
// base's own steps (one binary, one hook, one completion) are covered by
// lib/install-base.test.ts, not here.

import { describe, expect, test } from "bun:test";
import type { InstallContext } from "../../../lib/install-contract.ts";
import { FILTER_BIN_ENV } from "../lib/doctor.ts";
import { FILTER_INSTALL_COMMAND, FILTER_REVISION } from "../lib/filter.ts";
import { filterStep } from "./install.ts";

function context(
  opts: { present?: boolean; dryRun?: boolean; bin?: string; exit?: number; log?: string[] } = {},
): InstallContext {
  return {
    dryRun: opts.dryRun ?? false,
    env: opts.bin === undefined ? {} : { [FILTER_BIN_ENV]: opts.bin },
    probe: () => opts.present ?? false,
    run: (cmd, args) => {
      opts.log?.push([cmd, ...args].join(" "));
      return opts.exit ?? 0;
    },
  };
}

describe("the command output filter step", () => {
  test("a dry run writes nothing and names the command it would run", () => {
    const log: string[] = [];
    const step = filterStep(context({ dryRun: true, log }));
    expect(step.detail).toBe(`would run ${FILTER_INSTALL_COMMAND}`);
    expect(log).toHaveLength(0);
  });

  test("a filter on PATH is already there, dry run or real", () => {
    expect(filterStep(context({ present: true }))).toMatchObject({ status: "already" });
    expect(filterStep(context({ present: true, dryRun: true })).detail).toBe("rtk on PATH");
  });

  test("a missing filter is built from the pinned revision", () => {
    const log: string[] = [];
    const step = filterStep(context({ log }));
    expect(step.status).toBe("installed");
    expect(log).toEqual([FILTER_INSTALL_COMMAND]);
    expect(log[0]).toContain(FILTER_REVISION);
  });

  test("a failed build is an error carrying the command", () => {
    const step = filterStep(context({ exit: 101 }));
    expect(step.status).toBe("error");
    expect(step.detail).toContain(FILTER_INSTALL_COMMAND);
  });

  test("a filter the environment names is the user's to install", () => {
    const log: string[] = [];
    const step = filterStep(context({ bin: "other-filter", log }));
    expect(step.status).toBe("suggested");
    expect(step.detail).toContain("other-filter");
    expect(log).toHaveLength(0);
  });
});
