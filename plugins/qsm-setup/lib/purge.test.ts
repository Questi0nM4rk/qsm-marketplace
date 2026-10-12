import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { purge } from "./purge.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function fakeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "qsm-purge-"));
  dirs.push(home);
  return home;
}

test("purge removes every older artifact once, keeps the rest, and a second run finds nothing", () => {
  const home = fakeHome();
  mkdirSync(join(home, ".local/share/qsm/bin"), { recursive: true });
  symlinkSync("/nonexistent", join(home, ".local/share/qsm/bin/qsm-doctor"));
  writeFileSync(
    join(home, ".zshenv"),
    'export A=1\n# qsm: put the qsm bin farm on PATH\nexport PATH="/x:$PATH"\nexport B=2\n',
  );
  mkdirSync(join(home, ".claude/plugins/data/qsm-gone-qsm-marketplace"), { recursive: true });
  mkdirSync(join(home, ".claude/plugins/data/qsm-here-qsm-marketplace"), { recursive: true });
  const o = {
    env: { HOME: home },
    root: join(home, "repo"),
    marketplace: "qsm-marketplace",
    plugins: new Set(["qsm-here"]),
    check: false,
  };
  expect(purge({ ...o, check: true }).found).toHaveLength(3);
  expect(existsSync(join(home, ".local/share/qsm"))).toBe(true);
  expect(purge(o).found).toHaveLength(3);
  expect(existsSync(join(home, ".local/share/qsm"))).toBe(false);
  expect(readFileSync(join(home, ".zshenv"), "utf8")).toBe("export A=1\nexport B=2\n");
  expect(existsSync(join(home, ".claude/plugins/data/qsm-gone-qsm-marketplace"))).toBe(false);
  expect(existsSync(join(home, ".claude/plugins/data/qsm-here-qsm-marketplace"))).toBe(true);
  expect(purge(o)).toEqual({ found: [], blocked: [] });
});

test("a regular file in the legacy farm is left alone and reported as blocked", () => {
  const home = fakeHome();
  mkdirSync(join(home, ".local/share/qsm/bin"), { recursive: true });
  writeFileSync(join(home, ".local/share/qsm/bin/mine"), "");
  const r = purge({
    env: { HOME: home },
    root: "/r",
    marketplace: "m",
    plugins: new Set(),
    check: false,
  });
  expect(r.blocked).toHaveLength(1);
  expect(existsSync(join(home, ".local/share/qsm/bin/mine"))).toBe(true);
});
