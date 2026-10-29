// The one thing the install base is told about this plugin: the command output filter, an
// upstream row whose name the environment may choose. A dry run reads it without compiling.

import { describe, expect, test } from "bun:test";
import { fakeInstall } from "../../../lib/fixtures/install.ts";
import type { Step } from "../../../lib/install-contract.ts";
import { FILTER_BIN_ENV } from "../lib/doctor.ts";
import { FILTER_INSTALL_COMMAND } from "../lib/filter.ts";
import { install } from "./install.ts";

async function upstream(present: readonly string[], bin?: string): Promise<Step | undefined> {
  const { ctx } = fakeInstall({
    present,
    dryRun: true,
    env: bin === undefined ? {} : { [FILTER_BIN_ENV]: bin },
  });
  const result = await install(ctx);
  return result.steps.find((s) => s.name.startsWith("upstream"));
}

describe("the command output filter row", () => {
  test("a missing filter is built from the pinned revision", async () => {
    expect(await upstream([])).toMatchObject({
      name: "upstream rtk",
      detail: `would run ${FILTER_INSTALL_COMMAND}`,
    });
  });

  test("a filter on PATH is already there", async () => {
    expect(await upstream(["rtk"])).toMatchObject({ status: "already", detail: "rtk on PATH" });
  });

  test("a filter the environment names is the one probed", async () => {
    expect(await upstream(["other-filter"], "other-filter")).toMatchObject({
      name: "upstream other-filter",
      status: "already",
    });
  });

  test("a named filter that is missing is the user's to install, never a build of ours", async () => {
    expect(await upstream([], "other-filter")).toMatchObject({
      name: "upstream other-filter",
      status: "suggested",
      detail: `would need other-filter: install other-filter yourself (named by ${FILTER_BIN_ENV})`,
    });
  });
});
