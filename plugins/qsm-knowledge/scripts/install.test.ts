// The one step the shared base cannot do: reaching the notebook binary the
// Go toolchain built into a directory PATH usually cannot see.
import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { InstallContext } from "../../../lib/install-contract.ts";
import { NOTEBOOK_BIN, NOTEBOOK_INSTALL_COMMAND } from "../lib/notebook.ts";
import { install, notebook } from "./install.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

function sandbox(): { home: string; bin: string; gobin: string } {
  const home = sandboxDir("qsm-knowledge-install-");
  return { home, bin: join(home, "bin"), gobin: join(home, "go", "bin") };
}

function context(
  where: { home: string; bin: string; gobin: string },
  options: { onPath?: boolean; dryRun?: boolean } = {},
): InstallContext {
  return {
    dryRun: options.dryRun ?? false,
    env: {
      HOME: where.home,
      QSM_BIN_DIR: where.bin,
      GOBIN: where.gobin,
      XDG_CONFIG_HOME: where.home,
    },
    probe: () => options.onPath ?? false,
    run: () => 0,
  };
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
    const log: string[] = [];
    const r = await install({
      ...context(where),
      probe: (cmd) => cmd === "bun",
      run: (cmd, args) => {
        log.push([cmd, ...args].join(" "));
        goInstalled(where.gobin);
        return 0;
      },
    });
    expect(log).toContain(NOTEBOOK_INSTALL_COMMAND);
    expect(r.steps.find((s) => s.name === `upstream ${NOTEBOOK_BIN}`)?.status).toBe("installed");
    expect(r.steps.find((s) => s.name === `link ${NOTEBOOK_BIN}`)?.status).toBe("installed");
  }, 60_000);
});

describe("the notebook step", () => {
  test("a notebook already on PATH is left alone", () => {
    const where = sandbox();
    const step = notebook(context(where, { onPath: true }));
    expect(step.status).toBe("already");
    expect(existsSync(join(where.bin, NOTEBOOK_BIN))).toBe(false);
  });

  test("a notebook in the Go bin directory is linked into the bin directory", () => {
    const where = sandbox();
    const source = goInstalled(where.gobin);
    const step = notebook(context(where));
    expect(step.status).toBe("installed");
    const target = join(where.bin, NOTEBOOK_BIN);
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
    expect(step.detail).toContain(source);
  });

  test("a second run finds the link in place and changes nothing", () => {
    const where = sandbox();
    goInstalled(where.gobin);
    expect(notebook(context(where)).status).toBe("installed");
    expect(notebook(context(where)).status).toBe("already");
  });

  test("a dangling link from an earlier install is replaced", () => {
    const where = sandbox();
    goInstalled(where.gobin);
    mkdirSync(where.bin, { recursive: true });
    symlinkSync(join(where.gobin, "gone"), join(where.bin, NOTEBOOK_BIN));
    expect(notebook(context(where)).status).toBe("installed");
  });

  test("no notebook after the build is an error naming where it should be", () => {
    const where = sandbox();
    const step = notebook(context(where));
    expect(step.status).toBe("error");
    expect(step.detail).toContain(join(where.gobin, NOTEBOOK_BIN));
    expect(existsSync(where.bin)).toBe(false);
  });
});

describe("a dry run of the notebook step", () => {
  test("a dry run before the build names the link the build makes possible", () => {
    const where = sandbox();
    const step = notebook(context(where, { dryRun: true }));
    expect(step.detail).toStartWith("would link");
    expect(step.detail).toContain(join(where.gobin, NOTEBOOK_BIN));
  });

  test("a dry run with the notebook on PATH says so", () => {
    const step = notebook(context(sandbox(), { onPath: true, dryRun: true }));
    expect(step.detail).toBe(`${NOTEBOOK_BIN} on PATH`);
  });

  test("a dry run writes nothing and names the link it would make", () => {
    const where = sandbox();
    goInstalled(where.gobin);
    const step = notebook(context(where, { dryRun: true }));
    expect(step.status).toBe("skipped");
    expect(step.detail).toContain("would link");
    expect(existsSync(join(where.bin, NOTEBOOK_BIN))).toBe(false);
  });
});
