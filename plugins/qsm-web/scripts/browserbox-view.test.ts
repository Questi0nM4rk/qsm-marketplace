import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { envelopeOf, isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { fakeBin } from "../../../lib/fixtures/bin.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const PLUGIN = resolve(import.meta.dir, "..");
const CLI = join(PLUGIN, "scripts", "cli.ts");
const TOKEN = "a1b2c3d4".repeat(6);

/** One run of the CLI with a fake docker with one instance and a fake xdg-open that records its
 * argument, both first on PATH. */
function runWithFakes(argv: readonly string[]) {
  const home = sandboxDir("qs-view-home-");
  const bin = sandboxDir("qs-view-bin-");
  const record = join(bin, "opened");
  fakeBin(
    bin,
    "docker",
    [
      'case "$1" in',
      '  ps) printf "bbox-11000 qsm.browserbox=1\\n" ;;',
      `  exec) printf "%s" "${TOKEN}" ;;`,
      "esac",
    ].join("\n"),
  );
  fakeBin(bin, "xdg-open", `printf "%s" "$1" > "${record}"`);
  const r = runBin(CLI, argv, {
    env: isolatedEnv(home, {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      QSM_MARKETPLACE: resolve(PLUGIN, "..", ".."),
    }),
  });
  // xdg-open runs detached, so give it a moment to write what it was given.
  for (
    let waited = 0;
    waited < 2000 && !existsSync(record) && argv.includes("view");
    waited += 50
  ) {
    Bun.sleepSync(50);
  }
  return { ...r, opened: existsSync(record) ? readFileSync(record, "utf8") : null };
}

describe("browserbox view", () => {
  test("opens the address with the password and prints neither it nor anything carrying it", () => {
    const r = runWithFakes(["browserbox", "view", "bbox-11000", "--json"]);
    expect(r.exit).toBe(0);
    expect(r.stdout).not.toContain(TOKEN);
    expect(r.stderr).not.toContain(TOKEN);
    expect(envelopeOf(r.stdout).code).toBe("ok");
    expect(r.opened).toBe(`http://127.0.0.1:11000/?password=${TOKEN}`);
  });

  test("an instance that is not running is missing, and nothing is opened", () => {
    const r = runWithFakes(["browserbox", "view", "bbox-11999", "--json"]);
    expect(envelopeOf(r.stdout).code).toBe("missing");
    expect(r.opened).toBeNull();
  });

  test("--dry-run shows only the placeholder", () => {
    const r = runWithFakes(["browserbox", "view", "bbox-11000", "--dry-run"]);
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain("<token>");
    expect(r.stdout).not.toContain(TOKEN);
    expect(r.opened).toBeNull();
  });
});
