// qsm.json is bundled into the binary at compile time; a compiled bin never
// reads the checkout at run time.
import { runCli } from "../../../cli-base.ts";
import { ok } from "../../../outcome.ts";
import type { QsmManifest } from "../../../qsm-manifest.ts";
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = manifestJson as QsmManifest;
if (import.meta.main) {
  process.exit(await runCli(manifest, "qsm-fix-a", { ping: () => ok({ pong: "a" }, "pong a") }));
}
