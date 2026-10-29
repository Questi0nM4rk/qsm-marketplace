// The one step the shared base cannot do: reaching the notebook binary the
// Go toolchain built into a directory PATH usually cannot see.
import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fakeInstall } from "../../../lib/fixtures/install.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { NOTEBOOK_BIN, NOTEBOOK_INSTALL_COMMAND } from "../lib/notebook.ts";
import { install, notebook } from "./install.ts";

function sandbox(options: { onPath?: boolean; dryRun?: boolean } = {}) {
  const gobin = sandboxDir("qsm-knowledge-gobin-");
  const { ctx, bin } = fakeInstall({
    present: () => options.onPath ?? false,
    dryRun: options.dryRun ?? false,
    env: { GOBIN: gobin },
  });
  return { ctx, bin, gobin };
}

/** What `go install` leaves behind, without a Go toolchain in the test. */
function goInstalled(gobin: string): string {
  mkdirSync(gobin, { recursive: true });
  const path = join(gobin, NOTEBOOK_BIN);
  writeFileSync(path, "#!/bin/sh\n");
  return path;
}

describe("the whole installer", () => {
  test("a missing notebook is built with its upstream installer", async () => {
    const where = sandbox();
    const { ctx, runs } = fakeInstall({
      present: ["bun"],
      env: { GOBIN: where.gobin },
      exit: () => {
        goInstalled(where.gobin);
        return 0;
      },
    });
    const r = await install(ctx);
    const log = runs.map((run) => run.join(" "));
    expect(log).toContain(NOTEBOOK_INSTALL_COMMAND);
    expect(r.steps.find((s) => s.name === `upstream ${NOTEBOOK_BIN}`)?.status).toBe("installed");
    expect(r.steps.find((s) => s.name === `link ${NOTEBOOK_BIN}`)?.status).toBe("installed");
  }, 60_000);
});

describe("the notebook step", () => {
  test("a notebook already on PATH is left alone", () => {
    const where = sandbox({ onPath: true });
    const step = notebook(where.ctx);
    expect(step.status).toBe("already");
    expect(existsSync(join(where.bin, NOTEBOOK_BIN))).toBe(false);
  });

  test("a notebook in the Go bin directory is linked into the bin directory", () => {
    const where = sandbox();
    const source = goInstalled(where.gobin);
    const step = notebook(where.ctx);
    expect(step.status).toBe("installed");
    const target = join(where.bin, NOTEBOOK_BIN);
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
    expect(step.detail).toContain(source);
  });

  test("a second run finds the link in place and changes nothing", () => {
    const where = sandbox();
    goInstalled(where.gobin);
    expect(notebook(where.ctx).status).toBe("installed");
    expect(notebook(where.ctx).status).toBe("already");
  });

  test("a dangling link from an earlier install is replaced", () => {
    const where = sandbox();
    goInstalled(where.gobin);
    mkdirSync(where.bin, { recursive: true });
    symlinkSync(join(where.gobin, "gone"), join(where.bin, NOTEBOOK_BIN));
    expect(notebook(where.ctx).status).toBe("installed");
  });

  test("no notebook after the build is an error naming where it should be", () => {
    const where = sandbox();
    const step = notebook(where.ctx);
    expect(step.status).toBe("error");
    expect(step.detail).toContain(join(where.gobin, NOTEBOOK_BIN));
    expect(existsSync(where.bin)).toBe(false);
  });
});

describe("a dry run of the notebook step", () => {
  test("a dry run before the build names the link the build makes possible", () => {
    const where = sandbox({ dryRun: true });
    const step = notebook(where.ctx);
    expect(step.detail).toStartWith("would link");
    expect(step.detail).toContain(join(where.gobin, NOTEBOOK_BIN));
  });

  test("a dry run with the notebook on PATH says so", () => {
    const step = notebook(sandbox({ onPath: true, dryRun: true }).ctx);
    expect(step.detail).toBe(`${NOTEBOOK_BIN} on PATH`);
  });

  test("a dry run writes nothing and names the link it would make", () => {
    const where = sandbox({ dryRun: true });
    goInstalled(where.gobin);
    const step = notebook(where.ctx);
    expect(step.status).toBe("skipped");
    expect(step.detail).toContain("would link");
    expect(existsSync(join(where.bin, NOTEBOOK_BIN))).toBe(false);
  });
});
