// Installs each plugin's own dependencies, so a fresh clone typechecks: root `bun install` runs this
// through `prepare`, and the root lockfile holds none of them (root lib imports no package).
// npm: the same frozen install each plugin's installer runs. Python: every tracked
// requirements.txt goes into one `.venv` at the root, on the Python the code runs on, so pyright
// (pyrightconfig.json names that venv) resolves a package that lives only in a container.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pluginDirs, rel } from "./walk.ts";

/** The browserbox image is Debian 12, whose Python is 3.11. */
const PYTHON = "3.11";

function run(argv: string[], cwd: string, what: string): void {
  const done = Bun.spawnSync(argv, { cwd, stdout: "ignore", stderr: "inherit" });
  if (done.exitCode !== 0) {
    console.error(`plugin-deps: ${what} failed in ${rel(cwd)}: ${argv.join(" ")}`);
    process.exit(1);
  }
}

for (const dir of pluginDirs().filter((d) => existsSync(join(d, "package.json")))) {
  run(["bun", "install", "--frozen-lockfile"], dir, "bun install");
}

const root = join(import.meta.dir, "..");
const listed = Bun.spawnSync(["git", "ls-files", "--", "*requirements.txt"], { cwd: root });
const requirements = listed.stdout
  .toString()
  .split("\n")
  .filter((line) => line !== "");
if (requirements.length > 0) {
  if (Bun.which("uv") === null) {
    console.error("plugin-deps: uv is not on PATH; install it (pacman -S uv) so Python typechecks");
    process.exit(1);
  }
  run(["uv", "venv", "--quiet", "--allow-existing", "--python", PYTHON, ".venv"], root, "uv venv");
  const files = requirements.flatMap((file) => ["-r", file]);
  run(["uv", "pip", "install", "--quiet", "--python", ".venv", ...files], root, "uv pip install");
}
