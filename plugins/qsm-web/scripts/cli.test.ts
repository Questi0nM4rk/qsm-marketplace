// The web tier through its real surface: qsm-web's argv, stdout, stderr,
// exit. Nothing here reaches a search instance, a registry, or a container
// runtime; every call either stops at the parser, at a missing
// prerequisite, or inside --dry-run.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";

const Envelope = z.object({ code: z.string(), message: z.string() });
const DoctorEnvelope = z.object({
  code: z.string(),
  exit: z.number(),
  message: z.string(),
  data: z.object({
    bins: z.array(z.object({ status: z.string() })),
    skills: z.array(z.object({ status: z.string() })),
  }),
});
const DryRunEnvelope = z.object({
  code: z.string(),
  data: z.object({ commands: z.array(z.string()) }),
});

const PLUGIN = resolve(import.meta.dir, "..");
const CLI = join(PLUGIN, "scripts", "cli.ts");
/** A directory holding only a link to the runtime: a bin the tier looks for is never on it, wherever
 * the runtime is installed (its own directory may be /usr/bin). */
function barePath(): string {
  const dir = sandboxDir("qsm-web-bare-");
  symlinkSync(process.execPath, join(dir, "bun"));
  return dir;
}

function run(argv: readonly string[], env: Record<string, string> = {}) {
  const home = sandboxDir("qsm-web-cli-");
  const r = spawnSync("bun", [CLI, ...argv], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: home,
      XDG_CONFIG_HOME: join(home, "c"),
      QSM_MARKETPLACE: resolve(PLUGIN, "..", ".."),
      ...env,
    },
  });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("--help lists a verb from every rung", () => {
  const r = run(["--help"]);
  expect(r.exit).toBe(0);
  expect(r.stdout).toContain("opensrc get");
  expect(r.stdout).toContain("doctor");
  expect(r.stdout).toContain("searxng search");
  expect(r.stdout).toContain("browserbox start");
});

describe("qsm-web opensrc", () => {
  test("--help lists the group's verb", () => {
    const r = run(["opensrc", "--help"]);
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain("  get ");
  });

  test("an unknown flag is a usage error, exit 2", () => {
    const r = run(["opensrc", "get", "zod", "--nope"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("unknown flag --nope");
  });

  test("No target given", () => {
    const r = run(["opensrc", "get"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("missing required argument target");
  });
});

describe("qsm-web doctor", () => {
  test("on a machine with no web bin reports missing, exit 4", () => {
    const r = run(["doctor", "--json"], { PATH: barePath() });
    expect(r.exit).toBe(4);
    const envelope = DoctorEnvelope.parse(JSON.parse(r.stdout));
    expect(envelope).toMatchObject({ code: "missing", exit: 4 });
    expect(envelope.data.bins).toHaveLength(3);
    expect(envelope.data.bins.map((b) => b.status)).toEqual([
      "unhealthy",
      "unhealthy",
      "unhealthy",
    ]);
    expect(envelope.data.skills.map((k) => k.status)).toEqual(["unhealthy", "unhealthy"]);
    expect(envelope.message).toContain("npx ctx7 setup --claude");
  });
});

describe("qsm-web searxng", () => {
  test("--help lists search, and setup is gone", () => {
    const r = run(["searxng", "--help"]);
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain("  search");
    expect(r.stdout).not.toContain("setup");
  });

  test("No instance configured", () => {
    const r = run(["searxng", "search", "typed", "ast", "--json"]);
    expect(r.exit).toBe(4);
    const envelope = Envelope.parse(JSON.parse(r.stdout));
    expect(envelope.code).toBe("missing");
    expect(envelope.message).toContain("QSM_SEARXNG_INSTANCE");
  });

  // The envelope owns the output format, so the flag that named it is gone.
  // The spec requirement that demanded it went with it.
  test("there is no output-format flag left to accept", () => {
    const r = run(["searxng", "search", "hello", "--format", "json"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("unknown flag --format");
  });

  test("a value outside choices is a usage error, exit 2", () => {
    const r = run(["searxng", "search", "x", "--time-range", "fortnight"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("--time-range must be one of");
  });
});

describe("qsm-web browserbox", () => {
  test("--help lists every verb of the group", () => {
    const r = run(["browserbox", "--help"]);
    expect(r.exit).toBe(0);
    for (const verb of ["start", "ls", "stop", "fetch", "script", "takeover", "view"]) {
      expect(r.stdout).toContain(`  ${verb}`);
    }
  });

  test("stop with neither a name nor --all is a usage error, exit 2", () => {
    const r = run(["browserbox", "stop", "--dry-run"]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("exactly one of");
  });

  test("ls --dry-run reports the commands it would run, exit 0", () => {
    const r = run(["browserbox", "ls", "--dry-run", "--json"]);
    expect(r.exit).toBe(0);
    const envelope = DryRunEnvelope.parse(JSON.parse(r.stdout));
    expect(envelope.code).toBe("ok");
    expect(envelope.data.commands.join(" ")).toContain("ps");
  });

  test("Container runtime unavailable", () => {
    const r = run(["browserbox", "ls", "--json"], {
      PATH: barePath(),
      QSM_CONTAINER_RUNTIME: "",
    });
    expect(r.exit).toBe(4);
    expect(Envelope.parse(JSON.parse(r.stdout)).code).toBe("missing");
  });
});
