// Proof the four carried scripts still parse and still accept the flags
// their USAGE recipe uses, with no network reached and Instagram never
// contacted. `_browser.py` has no argparse of its own (a shared import for
// the other three), so it gets the compile check only.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const SCRIPTS_DIR = resolve(import.meta.dir, "instagram-saved");

const ALL_SCRIPTS = [
  "_browser.py",
  "convert-cookies.py",
  "harvest-shortcodes.py",
  "scrape-reels.py",
];

/** Script name to the one flag its USAGE recipe passes, which the --help
 * output must still name. */
const MAIN_FLAG: Record<string, string> = {
  "convert-cookies.py": "--source",
  "harvest-shortcodes.py": "--url",
  "scrape-reels.py": "--shortcodes",
};

function commandExists(cmd: string): boolean {
  return spawnSync("command", ["-v", cmd], { shell: true, stdio: "ignore" }).status === 0;
}

/** `harvest-shortcodes.py` and `scrape-reels.py` import `playwright.sync_api`
 * through `_browser.py`, which no project venv on this machine owns. Try
 * each candidate that could supply it, in order, and keep the first that
 * answers; none answering means the runner-dependent tests skip and say why. */
function findRunner(): readonly [string, ...string[]] | null {
  const candidates: readonly (readonly [string, ...string[]])[] = [
    ["uv", "tool", "run", "--from", "shot-scraper", "python"],
    ["uvx", "--from", "shot-scraper", "python"],
    ["uv", "run", "--with", "playwright", "python"],
  ];
  for (const candidate of candidates) {
    const [cmd, ...rest] = candidate;
    if (!commandExists(cmd)) {
      continue;
    }
    const probe = spawnSync(cmd, [...rest, "-c", "import playwright.sync_api"], {
      stdio: "ignore",
    });
    if (probe.status === 0) {
      return candidate;
    }
  }
  return null;
}

const PYTHON3 = commandExists("python3");
if (!PYTHON3) {
  console.warn("instagram-saved.test.ts: python3 not on PATH, skipping py_compile checks");
}

const RUNNER = findRunner();
if (RUNNER === null) {
  console.warn(
    "instagram-saved.test.ts: no runner supplies playwright.sync_api (tried uv tool run --from " +
      "shot-scraper, uvx --from shot-scraper, uv run --with playwright), skipping --help checks",
  );
}

describe.skipIf(!PYTHON3)("instagram-saved scripts byte-compile", () => {
  for (const script of ALL_SCRIPTS) {
    test(`${script} compiles`, () => {
      const r = spawnSync("python3", ["-m", "py_compile", script], {
        cwd: SCRIPTS_DIR,
        stdio: "pipe",
        encoding: "utf8",
      });
      expect(r.status, r.stderr).toBe(0);
    });
  }
});

if (RUNNER !== null) {
  const [cmd, ...rest] = RUNNER;
  describe("instagram-saved scripts answer --help", () => {
    for (const [script, flag] of Object.entries(MAIN_FLAG)) {
      test(`${script} names ${flag}`, () => {
        const r = spawnSync(cmd, [...rest, script, "--help"], {
          cwd: SCRIPTS_DIR,
          encoding: "utf8",
        });
        expect(r.status).toBe(0);
        expect(r.stdout).toContain(flag);
      });
    }
  });
}
