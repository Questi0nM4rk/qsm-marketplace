import { expect, test } from "bun:test";
import { join } from "node:path";
import { envelopeOf, isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const SCRIPT = join(import.meta.dir, "activate.ts");

test("the activation reads its own flags, not the runtime and script path", () => {
  const home = sandboxDir("qsm-secrets-activate-");
  const env = isolatedEnv(home, { CLAUDE_CONFIG_DIR: join(home, "claude") });
  const status = runBin(SCRIPT, ["--status", "--json"], { env });
  expect(envelopeOf(status.stdout).code).toBe("ok");
  const planned = runBin(SCRIPT, ["--dry-run", "--backend", "bitwarden", "--json"], { env });
  expect(envelopeOf(planned.stdout).code).toBe("ok");
});
