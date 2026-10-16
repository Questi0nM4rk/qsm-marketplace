// Every plugin with a bin ships its own generated hooks/noun.generated.ts,
// and its unwrap has never once run against that binary's real stdout — only
// against fixtures. A stale binary printed a different shape
// under --json and a module failed silently. This proves the seam: import
// each plugin's real unwrap, feed it the real stdout of its own binary
// called with an unknown verb, and check it reads the envelope loud.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { isolatedEnv, runBin } from "./fixtures/cli.ts";
import { sandboxDir } from "./fixtures/sandbox.ts";
import { messageOf } from "./outcome.ts";
import { parseManifest } from "./qsm-manifest.ts";

const root = resolve(import.meta.dir, "..");
const pluginsDir = resolve(root, "plugins");

type Unwrap = (
  argv: readonly string[],
  result: { exitCode: number; stdout: string; stderr: string },
) => unknown;

interface Candidate {
  readonly plugin: string;
  readonly dir: string;
  readonly bin: string;
  readonly script: string;
}

async function loadUnwrap(dir: string): Promise<Unwrap> {
  const mod: unknown = await import(resolve(dir, "hooks/noun.generated.ts"));
  if (typeof mod !== "object" || mod === null || !("unwrap" in mod) || !isUnwrap(mod.unwrap)) {
    throw new Error(`${dir}/hooks/noun.generated.ts does not export unwrap`);
  }
  return mod.unwrap;
}

function isUnwrap(value: unknown): value is Unwrap {
  return typeof value === "function";
}

/** Every plugins/<name>/qsm.json that declares a qsm.bin, its first bin and script. */
function candidates(): Candidate[] {
  const found: Candidate[] = [];
  for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dir = resolve(pluginsDir, entry.name);
    const manifestPath = resolve(dir, "qsm.json");
    if (!existsSync(manifestPath)) {
      continue;
    }
    const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
    const [bin, script] = Object.entries(manifest.qsm.bin ?? {})[0] ?? [];
    if (bin !== undefined && script !== undefined) {
      found.push({ plugin: basename(dir), dir, bin, script });
    }
  }
  return found;
}

/** Calls a plugin's own binary script with an unknown verb under --json and
 * returns its real stdout: the outcome envelope the binary actually prints,
 * not a fixture standing in for one. */
function unknownVerbStdout(candidate: Candidate): string {
  const home = sandboxDir("qsm-noun-contract-");
  const r = runBin(resolve(candidate.dir, candidate.script), ["no-such-verb", "--json"], {
    env: isolatedEnv(home),
  });
  return r.stdout;
}

describe.each(candidates())("$plugin noun contract", (candidate) => {
  test("unwrap reads the real binary's usage envelope and throws code + message", async () => {
    const unwrap = await loadUnwrap(candidate.dir);
    const stdout = unknownVerbStdout(candidate);
    const argv = [candidate.bin, "no-such-verb", "--json"];
    let thrown: unknown;
    try {
      unwrap(argv, { exitCode: 2, stdout, stderr: "" });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = messageOf(thrown);
    expect(message).toContain("usage");
    expect(message).toContain("no-such-verb");
  });
});

/** qsm-memory's own generated copy, resolved the same computed way every
 * per-plugin test resolves its own — never a literal path into a plugin. */
async function memoryUnwrap(): Promise<Unwrap> {
  const memory = candidates().find((c) => c.plugin === "qsm-memory");
  if (memory === undefined) {
    throw new Error(
      "qsm-memory candidate not found; is plugins/qsm-memory/qsm.json missing qsm.bin?",
    );
  }
  return loadUnwrap(memory.dir);
}

describe("unwrap pure failure cases (qsm-memory's own copy)", () => {
  test("empty stdout throws 'printed no envelope'", async () => {
    const unwrap = await memoryUnwrap();
    expect(() =>
      unwrap(["qsm-memory", "recall", "--json"], { exitCode: 1, stdout: "", stderr: "boom" }),
    ).toThrow("printed no envelope");
  });

  test("stdout that is not JSON at all throws 'is not an outcome envelope', never a raw JSON.parse error", async () => {
    const unwrap = await memoryUnwrap();
    expect(() =>
      unwrap(["qsm-memory", "recall", "--json"], {
        exitCode: 0,
        stdout: "not json at all",
        stderr: "",
      }),
    ).toThrow("is not an outcome envelope");
  });
});
