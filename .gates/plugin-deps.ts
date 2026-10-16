// Installs each plugin's own npm dependencies, the same frozen install its installer runs, so a
// fresh clone typechecks: root `bun install` runs this through `prepare`, and the root lockfile
// holds none of them (root lib imports no package).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pluginDirs, rel } from "./walk.ts";

for (const dir of pluginDirs().filter((d) => existsSync(join(d, "package.json")))) {
  const run = Bun.spawnSync(["bun", "install", "--frozen-lockfile"], {
    cwd: dir,
    stdout: "ignore",
    stderr: "inherit",
  });
  if (run.exitCode !== 0) {
    console.error(`plugin-deps: bun install --frozen-lockfile failed in ${rel(dir)}`);
    process.exit(1);
  }
}
