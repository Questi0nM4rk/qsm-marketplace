// qsm-setup through its real surface: the binary's argv, stdout, stderr, exit.
import { describe, expect, test } from "bun:test";
import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { readRelinkOutput } from "../hooks/relink-output.ts";
import { isRecord, parseEnvelope } from "../lib/json.ts";
import setupManifest from "../qsm.json" with { type: "json" };

interface CheckRow {
  readonly name: string;
  readonly status: string;
  readonly output: string;
}

/** The --json envelope a verb printed; the test fails when stdout is not one. */
function envelopeOf(stdout: string) {
  const envelope = parseEnvelope(stdout);
  if (envelope === null) {
    throw new Error(`stdout is not an envelope: ${stdout}`);
  }
  return envelope;
}

/** The doctor report's check rows, read from its envelope. */
function checksOf(stdout: string): CheckRow[] {
  const { data } = envelopeOf(stdout);
  if (!isRecord(data) || !Array.isArray(data.checks)) {
    throw new Error("doctor data has no checks");
  }
  return data.checks.map((c): CheckRow => {
    if (!isRecord(c) || typeof c.name !== "string" || typeof c.status !== "string") {
      throw new Error("a check row is malformed");
    }
    return { name: c.name, status: c.status, output: typeof c.output === "string" ? c.output : "" };
  });
}

const CLI = resolve(import.meta.dir, "cli.ts");
const ROOT = resolve(import.meta.dir, "../../..");

function run(argv: readonly string[], env: Record<string, string> = {}) {
  const home = sandboxDir("qsm-setup-cli-");
  const r = spawnSync("bun", [CLI, ...argv], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: home,
      XDG_CONFIG_HOME: join(home, "c"),
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      ...env,
    },
  });
  return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** bun's own dir, sh's dir (the doctor probe shells out), and the given bin
 * dir — never the real PATH, or this machine's own qsm-toolbox would mask
 * a FAIL a test is proving. */
function narrowPath(binDir: string): string {
  const shDir = dirname(execSync("command -v sh", { encoding: "utf8" }).trim());
  return [dirname(process.execPath), shDir, binDir].join(":");
}

describe("qsm-setup cli", () => {
  test("--help lists the six verbs from qsm.json", () => {
    const r = run(["--help"]);
    expect(r.exit).toBe(0);
    for (const verb of ["install", "activate", "doctor", "relink", "build-bins", "tools"]) {
      expect(r.stdout).toContain(`  ${verb}`);
    }
  });

  test("install with no selection is a usage error, exit 2", () => {
    const r = run(["install", "--root", ROOT]);
    expect(r.exit).toBe(2);
    expect(r.stderr).toContain("usage: install takes exactly one of");
  });

  test("no marketplace root anywhere is missing, exit 4, an envelope under --json", () => {
    const r = run(["doctor", "--json"], { QSM_SETUP_CONFIG: "/nonexistent/setup.json" });
    expect(r.exit).toBe(4);
    expect(JSON.parse(r.stdout)).toMatchObject({ code: "missing", exit: 4 });
  });

  test("doctor probes through QSM_BIN_DIR even when PATH lacks it, and a missing bin says so", () => {
    const home = sandboxDir("qsm-setup-doctor-");
    const bin = join(home, "bin");
    mkdirSync(bin, { recursive: true });
    // answers only the doctor verb, so a PASS proves the probe called it
    writeFileSync(join(bin, "qsm-memory"), '#!/bin/sh\n[ "$1" = doctor ]\n', { mode: 0o755 });
    const state = join(home, "state");
    mkdirSync(state, { recursive: true });
    const installed = { plugins: ["qsm-memory", "qsm-toolbox"] };
    writeFileSync(join(state, "installed.json"), JSON.stringify(installed));
    const r = run(["doctor", "--root", ROOT, "--json"], {
      PATH: narrowPath(bin),
      QSM_BIN_DIR: bin,
      QSM_SETUP_STATE_DIR: state,
      QSM_SETUP_CONFIG: join(home, "none.json"),
    });
    const checks = checksOf(r.stdout);
    expect(checks.find((c) => c.name === "qsm-memory")?.status).toBe("PASS");
    const toolbox = checks.find((c) => c.name === "qsm-toolbox");
    expect(toolbox?.status).toBe("FAIL");
    expect(toolbox?.output).toContain("qsm-toolbox is not on PATH");
  });

  test("install qsm-setup --dry-run prints the plan and exits 0", () => {
    const r = run(["install", "qsm-setup", "--dry-run", "--root", ROOT, "--json"], {
      QSM_BIN_DIR: "/nonexistent/bin",
    });
    expect(r.exit).toBe(0);
    const envelope = envelopeOf(r.stdout);
    expect(envelope.code).toBe("ok");
    // qsm-setup requires qsm-essentials, so both plan; requirements come first
    const rows: unknown[] = Array.isArray(envelope.data) ? envelope.data : [];
    const outcome = rows.find((o) => isRecord(o) && o.plugin === "qsm-setup");
    expect(outcome).toMatchObject({ plugin: "qsm-setup", status: "skipped" });
    expect(isRecord(outcome) ? outcome.detail : null).toContain(
      "compile scripts/cli.ts to /nonexistent/bin/qsm-setup",
    );
  }, 30_000);
});

describe("install selection", () => {
  test("An unknown plugin name", () => {
    const r = run(["install", "nope", "--root", ROOT, "--json"]);
    expect(r.exit).toBe(2);
    const envelope = envelopeOf(r.stdout);
    expect(envelope.code).toBe("usage");
    expect(envelope.message).toStartWith("unknown plugin: nope; known: ");
    expect(envelope.message).toContain("qsm-setup");
  });
});

describe("activate runs a plugin's activation only with every choice given", () => {
  test("No choice given", () => {
    const claudeHome = sandboxDir("qsm-setup-activate-");
    const r = run(["activate", "qsm-setup", "--root", ROOT, "--json"], {
      CLAUDE_CONFIG_DIR: claudeHome,
    });
    expect(r.exit).toBe(2);
    expect(JSON.parse(r.stdout)).toMatchObject({
      code: "usage",
      message: "activation needs --instructions <replace|overwrite|skip>",
    });
    expect(readdirSync(claudeHome)).toEqual([]);
  });

  test("with the choice after --, a dry run names what it would write", () => {
    const claudeHome = sandboxDir("qsm-setup-activate-");
    const r = run(
      [
        "activate",
        "qsm-setup",
        "--dry-run",
        "--root",
        ROOT,
        "--json",
        "--",
        "--instructions",
        "replace",
      ],
      { CLAUDE_CONFIG_DIR: claudeHome },
    );
    expect(r.exit).toBe(0);
    const { data } = envelopeOf(r.stdout);
    expect(isRecord(data) ? data.detail : null).toContain("would write CLAUDE.md");
    expect(readdirSync(claudeHome)).toEqual([]);
  });

  test("a plugin without an activation says so", () => {
    const r = run(["activate", "qsm-usage", "--root", ROOT, "--json"]);
    expect(r.exit).toBe(4);
    expect(envelopeOf(r.stdout).message).toBe("qsm-usage has no activation: nothing to activate");
  });
});

describe("doctor ends with the Claude Code group", () => {
  test("a full run reports the claude checks after the plugins, network off", () => {
    const state = sandboxDir("qsm-setup-claude-");
    const r = run(["doctor", "--root", ROOT, "--json"], {
      QSM_SETUP_STATE_DIR: state,
      QSM_SETUP_CONFIG: join(state, "none.json"),
    });
    const checks = checksOf(r.stdout);
    const names = checks.map((c) => c.name);
    for (const name of ["claude installs", "claude path", "claude config", "claude version"]) {
      expect(names).toContain(name);
    }
    expect(checks.find((c) => c.name === "claude version")?.status).not.toBe("FAIL");
  });
});

/** A checkout whose origin is a local bare repository: real git, no network. */
function gitMarketplace(): string {
  const base = sandboxDir("qsm-setup-tools-");
  const origin = join(base, "origin.git");
  const root = join(base, "checkout");
  const git = (...args: string[]): void => {
    execSync(["git", "-C", root, ...args].map((a) => JSON.stringify(a)).join(" "), {
      stdio: "ignore",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
      },
    });
  };
  execSync(`git init -q --bare -b main ${JSON.stringify(origin)}`);
  mkdirSync(join(root, "plugins", "x", ".claude-plugin"), { recursive: true });
  execSync(`git init -q -b main ${JSON.stringify(root)}`);
  git("remote", "add", "origin", origin);
  const manifest = (verbs: string[]) => {
    const commands = Object.fromEntries(
      verbs.map((v) => [`qsm-x ${v}`, { description: `${v} it` }]),
    );
    writeFileSync(
      join(root, "plugins", "x", "qsm.json"),
      JSON.stringify({ qsm: { bin: { "qsm-x": "cli.ts" }, commands } }),
    );
  };
  writeFileSync(
    join(root, "plugins", "x", ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "x" }),
  );
  manifest(["run", "tail"]);
  git("add", "-A");
  git("commit", "-qm", "main");
  git("push", "-q", "origin", "main");
  git("update-ref", "-d", "refs/remotes/origin/main");
  manifest(["run"]);
  return root;
}

describe("tools over a real local git remote", () => {
  test("reads origin/main with git, names the fetch, and --fetch updates it", () => {
    const root = gitMarketplace();
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "qsm-x"), "#!/bin/sh\n", { mode: 0o755 });
    const env = { PATH: narrowPath(bin), QSM_BIN_DIR: bin };
    const stale = run(["tools", "--root", root], env);
    expect(stale.exit).toBe(4);
    expect(stale.stderr).toContain("run: qsm-setup tools --fetch");

    const fetched = run(["tools", "--fetch", "--root", root], env);
    expect(fetched.exit).toBe(0);
    expect(fetched.stdout).toContain("origin/main fetched just now");
    expect(fetched.stdout).toContain("qsm-x (x): installed");
    expect(fetched.stdout).toContain("  + tail: tail it (added on main)");

    const again = run(["tools", "--root", root], env);
    expect(again.stdout).toContain("origin/main as last fetched: 20");
    expect(again.stdout).toContain("  + tail: tail it (added on main)");
  });
});

describe("relink --auto --json feeds readRelinkOutput the seam it reads", () => {
  test("A machine that has not opted in", () => {
    const r = run(["relink", "--auto", "--json"]);
    expect(readRelinkOutput(r.stdout ?? "")).toEqual({ kind: "skipped", reason: "not opted in" });
  });

  test("the bare shape the hook used to read is unreadable, not a false positive", () => {
    expect(readRelinkOutput('{"relinked":true}')).toEqual({
      kind: "unreadable",
      reason: "not an outcome envelope: no data field",
    });
  });
});

describe("an empty root", () => {
  test("A root that holds no plugins is missing", () => {
    const empty = sandboxDir("qsm-setup-empty-");
    for (const verb of ["doctor", "install --all --dry-run"]) {
      const r = run([...verb.split(" "), "--root", empty]);
      expect(r.exit).toBe(4);
      expect(r.stderr).toContain("holds no plugins");
      expect(r.stdout).not.toContain("orphan");
    }
  });
});

describe("qsm-setup probes itself", () => {
  test("its own probe never runs its doctor verb, which would probe itself without end", () => {
    expect(setupManifest.qsm.doctor).not.toContain("doctor");
  });
});
