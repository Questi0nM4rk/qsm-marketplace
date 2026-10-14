import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { MARKER } from "./completions.ts";
import { installBase, installScript } from "./install-base.ts";
import type { InstallContext, InstallResult } from "./install-contract.ts";
import { isRecord } from "./outcome.ts";

const FIXTURE = resolve(import.meta.dir, "fixtures/plugin-fixture");

interface Fake {
  readonly ctx: InstallContext;
  readonly runs: string[][];
  readonly home: string;
}

// Every sandbox holds compiled binaries of ~90MB each; they go when the file does.
const sandboxes: string[] = [];
afterAll(() => {
  for (const dir of sandboxes.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});
function sandbox(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  sandboxes.push(dir);
  return dir;
}

function fake(
  opts: { present?: readonly string[]; dryRun?: boolean; runExit?: number } = {},
): Fake {
  const home = sandbox("qsm-install-");
  const present = new Set(opts.present ?? ["bun"]);
  const runs: string[][] = [];
  const ctx: InstallContext = {
    dryRun: opts.dryRun ?? false,
    env: { HOME: home, QSM_BIN_DIR: join(home, "bin"), XDG_CONFIG_HOME: join(home, "config") },
    probe: (cmd) => present.has(cmd),
    run: (cmd, args) => {
      runs.push([cmd, ...args]);
      return opts.runExit ?? 0;
    },
  };
  return { ctx, runs, home };
}

/** The steps of an install --json envelope; a stdout of any other shape throws. */
function stepsOf(stdout: string): { name: string; status: string }[] {
  const envelope: unknown = JSON.parse(stdout);
  const steps = isRecord(envelope) && isRecord(envelope["data"]) ? envelope["data"]["steps"] : null;
  if (!Array.isArray(steps)) {
    throw new TypeError(`not an install envelope: ${stdout}`);
  }
  return steps.map((s: unknown) => {
    if (!isRecord(s) || typeof s["name"] !== "string" || typeof s["status"] !== "string") {
      throw new TypeError(`not an install step: ${JSON.stringify(s)}`);
    }
    return { name: s["name"], status: s["status"] };
  });
}

function step(r: InstallResult, name: string) {
  const { steps } = r;
  const s = steps.find((x) => x.name === name);
  if (s === undefined) {
    throw new Error(`no step ${name} in ${steps.map((x) => x.name).join(", ")}`);
  }
  return s;
}

const install = installBase({
  pluginRoot: FIXTURE,
  upstream: [{ cmd: "fakeup", hint: "brew install fakeup" }],
});

describe("install-base over the fixture plugin", () => {
  const f = fake({ present: ["bun", "fakeup"] });

  test("A plugin with two binaries and no upstream", async () => {
    rmSync(join(FIXTURE, "dist"), { recursive: true, force: true });
    const r = await install(f.ctx);
    expect(r.tool).toBe("qsm-fixture");
    expect(r.status).toBe("installed");
    for (const bin of ["qsm-fix-a", "qsm-fix-b"]) {
      const path = join(f.home, "bin", bin);
      expect(existsSync(path)).toBe(true);
      expect(() => {
        accessSync(path, constants.X_OK);
      }).not.toThrow();
      expect(step(r, `bin ${bin}`).status).toBe("installed");
      const fish = readFileSync(join(f.home, "config/fish/completions", `${bin}.fish`), "utf8");
      expect(fish).toContain(MARKER);
      expect(fish).toContain("-a 'ping'");
    }
    expect(existsSync(join(FIXTURE, "dist/ping"))).toBe(true);
    expect(step(r, "hook ping").status).toBe("installed");
    expect(step(r, "upstream fakeup").status).toBe("already");
    const out = spawnSync(join(f.home, "bin/qsm-fix-a"), ["ping", "--json"], { encoding: "utf8" });
    expect(JSON.parse(out.stdout)).toMatchObject({ code: "ok", data: { pong: "a" } });
  }, 60_000);

  test("Nothing changed since the last run", async () => {
    const r = await install(f.ctx);
    expect(r.status).toBe("already");
    expect(r.steps.map((s) => s.status)).not.toContain("installed");
  }, 60_000);
});

describe("install-base dry run", () => {
  test("dry run: prints the plan, writes nothing, reports skipped", async () => {
    const d = fake({ dryRun: true, present: ["bun"] });
    const r = await install(d.ctx);
    expect(r.status).toBe("skipped");
    expect(r.detail).toStartWith("[dry-run] would compile scripts/cli.ts");
    expect(r.detail).toContain("qsm-fix-b");
    expect(r.detail).toContain("hooks/ping.ts");
    expect(r.detail).toContain("would need fakeup: brew install fakeup");
    expect(r.detail).not.toContain("would: would");
    expect(existsSync(join(d.home, "bin"))).toBe(false);
    expect(d.runs).toEqual([]);
  });

  test("dry run probes the upstream tools the way the real run does", async () => {
    const present = fake({ dryRun: true, present: ["bun", "fakeup"] });
    const r1 = await install(present.ctx);
    expect(r1.detail).toContain("fakeup on PATH");
    const runnable = fake({ dryRun: true, present: ["bun"] });
    const r2 = await installBase({
      pluginRoot: FIXTURE,
      upstream: [{ cmd: "fakeup", install: ["bun", "add", "-g", "fakeup"], hint: "x" }],
    })(runnable.ctx);
    expect(r2.detail).toContain("would run bun add -g fakeup");
    expect(runnable.runs).toEqual([]);
  });
});

describe("install-base dry run with extra steps", () => {
  test("dry run asks the extra step for its own plan line", async () => {
    const d = fake({ dryRun: true, present: ["bun"] });
    const r = await installBase({
      pluginRoot: FIXTURE,
      extra: (ctx) => ({
        name: "settings",
        status: ctx.dryRun ? "skipped" : "installed",
        detail: ctx.dryRun ? "would write settings.json" : "wrote settings.json",
      }),
    })(d.ctx);
    expect(r.status).toBe("skipped");
    expect(r.detail).toContain("would write settings.json");
  });

  test("dry run gives each of several extra steps its own plan line, in order", async () => {
    const d = fake({ dryRun: true, present: ["bun"] });
    const r = await installBase({
      pluginRoot: FIXTURE,
      extra: () => [
        { name: "first", status: "skipped", detail: "would do the first" },
        { name: "second", status: "skipped", detail: "would do the second" },
      ],
    })(d.ctx);
    const lines = r.steps.map((s) => s.detail);
    expect(lines.slice(-2)).toEqual(["would do the first", "would do the second"]);
    expect(r.detail).toEndWith("would do the first; would do the second");
  });

  test("a plugin with nothing to do says so instead of an empty detail", async () => {
    const bare = fake({ present: ["bun"] });
    const emptyRoot = sandbox("qsm-empty-plugin-");
    const r = await installBase({ pluginRoot: emptyRoot })(bare.ctx);
    expect(r).toMatchObject({ status: "already", detail: "nothing to install", steps: [] });
  });

  test("dry run over a plugin with nothing to plan answers the same line", async () => {
    const bare = fake({ dryRun: true, present: ["bun"] });
    const r = await installBase({ pluginRoot: sandbox("qsm-empty-plugin-") })(bare.ctx);
    expect(r).toMatchObject({ status: "already", detail: "nothing to install", steps: [] });
  });
});

describe("install-base plugin dependencies", () => {
  // A plugin root with a lockfile and local file: dependencies, so no network is needed. A
  // second dependency added after the lock makes the lockfile stale.
  function depPlugin(stale: boolean): string {
    const root = sandbox("qsm-dep-plugin-");
    for (const name of ["dep", "dep2"]) {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, "package.json"), `{"name":"${name}","version":"1.0.0"}`);
    }
    const manifest = (deps: string) => `{"name":"p","private":true,"dependencies":{${deps}}}`;
    writeFileSync(join(root, "package.json"), manifest('"dep":"file:./dep"'));
    spawnSync("bun", ["install"], { cwd: root });
    if (stale) {
      writeFileSync(
        join(root, "package.json"),
        manifest('"dep":"file:./dep","dep2":"file:./dep2"'),
      );
    }
    return root;
  }

  test("a stale lockfile is an error step that stops before compiling", async () => {
    const d = fake();
    const r = await installBase({ pluginRoot: depPlugin(true) })(d.ctx);
    expect(r.status).toBe("error");
    expect(r.steps.map((s) => s.name)).toEqual(["dependencies"]);
    expect(step(r, "dependencies").detail).toContain("commit its bun.lock");
  });

  test("a current lockfile installs the dependency", async () => {
    const root = depPlugin(false);
    const d = fake();
    const first = await installBase({ pluginRoot: root })(d.ctx);
    expect(existsSync(join(root, "node_modules/dep/package.json"))).toBe(true);
    expect(first.status).not.toBe("error");
    expect(step(first, "dependencies").status).toBe("installed");
  });

  test("dry run names the install and runs nothing", async () => {
    const d = fake({ dryRun: true });
    const r = await installBase({ pluginRoot: depPlugin(false) })(d.ctx);
    expect(r.detail).toContain("would run bun install --frozen-lockfile");
  });
});

describe("install-base run twice, each run its own process", () => {
  // The in-process tests above cannot see this: a temporary file named after
  // the process id is the same name within one process, so the compare that
  // makes a re-install cheap only ever fails when the second run is a new
  // process, which is how every real install runs.
  test("the second install compiles nothing again", () => {
    const home = sandbox("qsm-install-twice-");
    const env = {
      PATH: process.env.PATH ?? "",
      HOME: home,
      QSM_BIN_DIR: join(home, "bin"),
      XDG_CONFIG_HOME: join(home, "config"),
    };
    const installer = join(FIXTURE, "scripts/install.ts");
    const compiles = (): { name: string; status: string }[] => {
      const r = spawnSync("bun", [installer, "--json"], { encoding: "utf8", env });
      return stepsOf(r.stdout).filter(
        (s) => s.name.startsWith("bin ") || s.name.startsWith("hook "),
      );
    };
    const first = compiles();
    expect(first.filter((s) => s.name.startsWith("bin ")).map((s) => s.status)).toEqual([
      "installed",
      "installed",
    ]);
    const second = compiles();
    expect(second.map((s) => `${s.name}: ${s.status}`)).toEqual([
      "bin qsm-fix-a: already",
      "bin qsm-fix-b: already",
      "hook ping: already",
    ]);
  }, 120_000);
});

describe("install-base outcomes", () => {
  test("no bun: missing-prereq, nothing else runs", async () => {
    const f = fake({ present: [] });
    const r = await installBase({ pluginRoot: FIXTURE })(f.ctx);
    expect(r.status).toBe("missing-prereq");
    expect(r.detail).toContain("bun");
    expect(existsSync(join(f.home, "bin"))).toBe(false);
  });

  test("a required upstream tool with no install command is missing, the hint is the detail", async () => {
    const f = fake({ present: ["bun"] });
    const r = await installBase({
      pluginRoot: FIXTURE,
      upstream: [{ cmd: "fakeup", hint: "brew install fakeup" }],
    })(f.ctx);
    expect(r.status).toBe("missing-prereq");
    expect(step(r, "upstream fakeup")).toMatchObject({
      status: "missing-prereq",
      detail: "fakeup is not on PATH: brew install fakeup",
    });
  }, 60_000);

  test("An upstream tool is missing and slow to install", async () => {
    const f = fake({ present: ["bun"] });
    const r = await installBase({
      pluginRoot: FIXTURE,
      upstream: [{ cmd: "fakeup", hint: "brew install fakeup", optional: true }],
    })(f.ctx);
    expect(step(r, "upstream fakeup")).toMatchObject({
      status: "suggested",
      detail: "fakeup is not on PATH: brew install fakeup",
    });
  }, 60_000);
});

describe("install-base upstream and extra", () => {
  test("upstream missing with an install command: run it; success installs, failure is an error", async () => {
    const good = fake({ present: ["bun"] });
    const config = {
      pluginRoot: FIXTURE,
      upstream: [
        { cmd: "fakeup", install: ["bun", "add", "-g", "fakeup"], hint: "bun add -g fakeup" },
      ],
    };
    const r1 = await installBase(config)(good.ctx);
    expect(good.runs).toEqual([["bun", "add", "-g", "fakeup"]]);
    expect(step(r1, "upstream fakeup").status).toBe("installed");
    const bad = fake({ present: ["bun"], runExit: 1 });
    const r2 = await installBase(config)(bad.ctx);
    expect(step(r2, "upstream fakeup")).toMatchObject({
      status: "error",
      detail: "bun add -g fakeup exited 1; run it yourself: bun add -g fakeup",
    });
    expect(r2.status).toBe("error");
  }, 60_000);

  test("the extra step runs last and its status folds into the worst", async () => {
    const f = fake({ present: ["bun"] });
    const seen: string[] = [];
    const r = await installBase({
      pluginRoot: FIXTURE,
      extra: (ctx) => {
        seen.push(ctx.dryRun ? "dry" : "real");
        return { name: "settings", status: "error", detail: "could not write settings.json" };
      },
    })(f.ctx);
    expect(seen).toEqual(["real"]);
    expect(r.status).toBe("error");
    expect(r.steps.at(-1)?.name).toBe("settings");
  }, 60_000);

  test("several extra steps all run last, in order, each folding into the worst", async () => {
    const f = fake({ present: ["bun"] });
    const r = await installBase({
      pluginRoot: FIXTURE,
      extra: () => [
        { name: "checker", status: "already", detail: "checker there" },
        { name: "login", status: "suggested", detail: "log in" },
      ],
    })(f.ctx);
    expect(r.steps.slice(-2)).toEqual([
      { name: "checker", status: "already", detail: "checker there" },
      { name: "login", status: "suggested", detail: "log in" },
    ]);
    expect(r.status).toBe("suggested");
    expect(r.detail).toBe("login: log in");
  }, 60_000);

  test("A user's own completion file for the same name", async () => {
    const f = fake({ present: ["bun"] });
    const dir = join(f.home, "config/fish/completions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "qsm-fix-a.fish"), "complete -c qsm-fix-a -e\n");
    const r = await installBase({ pluginRoot: FIXTURE })(f.ctx);
    expect(step(r, "completion qsm-fix-a").detail).toContain("left alone");
    expect(readFileSync(join(dir, "qsm-fix-a.fish"), "utf8")).toBe("complete -c qsm-fix-a -e\n");
    expect(readdirSync(dir)).toContain("qsm-fix-b.fish");
  }, 60_000);
});

describe("an installer's child processes never reach stdout", () => {
  // qsm-setup reads one envelope from an installer's stdout. An upstream
  // install command that prints there (a package manager's progress, a
  // browser download's warnings) would make that envelope unreadable.
  test("--json stdout is exactly the envelope while a child prints", () => {
    const dir = sandbox("qsm-install-noise-");
    const script = join(dir, "install.ts");
    const contract = resolve(import.meta.dir, "install-contract.ts");
    writeFileSync(
      script,
      `import { cliMain } from ${JSON.stringify(contract)};
const install = (ctx) => {
  ctx.run("echo", ["noise on stdout"]);
  return { tool: "noisy", status: "installed", detail: "ran echo", steps: [] };
};
process.exit(await cliMain(install));
`,
    );
    const r = spawnSync("bun", [script, "--json"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({ code: "ok", data: { tool: "noisy" } });
    expect(r.stderr).toContain("noise on stdout");
  });
});

describe("an activation takes every choice it declares, or refuses", () => {
  function activation(): string {
    const dir = sandbox("qsm-activate-");
    const script = join(dir, "activate.ts");
    const contract = resolve(import.meta.dir, "install-contract.ts");
    writeFileSync(
      script,
      `import { activationMain } from ${JSON.stringify(contract)};
const activation = {
  options: [{ name: "instructions", values: ["replace", "overwrite", "skip"], description: "CLAUDE.md" }],
  activate: (ctx) => ({ tool: "t", status: "installed", detail: \`chose \${ctx.choices.instructions}\${ctx.dryRun ? " (dry)" : ""}\`, steps: [] }),
};
process.exit(await activationMain(activation));
`,
    );
    return script;
  }
  const envelope = (args: string[]) => {
    const r = spawnSync("bun", [activation(), "--json", ...args], { encoding: "utf8" });
    const body: unknown = JSON.parse(r.stdout);
    return { exit: r.status, body };
  };

  test("Activation with an unanswered choice and no terminal", () => {
    expect(envelope([])).toMatchObject({
      exit: 2,
      body: { code: "usage", message: "activation needs --instructions <replace|overwrite|skip>" },
    });
  });

  test("a value outside the declared ones is usage", () => {
    expect(envelope(["--instructions", "merge"])).toMatchObject({
      exit: 2,
      body: {
        code: "usage",
        message: "--instructions takes replace, overwrite or skip, not merge",
      },
    });
  });

  test("An agent runs a verb with choices", () => {
    expect(envelope(["--instructions", "replace", "--dry-run"])).toMatchObject({
      exit: 0,
      body: { code: "ok", data: { detail: "chose replace (dry)" } },
    });
  });
});

describe("installScript", () => {
  test("A script's directory names its plugin root", async () => {
    const meta = { dir: join(FIXTURE, "scripts"), main: false };
    const dry = fake({ dryRun: true, present: ["bun", "fakeup"] });
    const viaScript = await installScript(meta, {
      upstream: [{ cmd: "fakeup", hint: "brew install fakeup" }],
    })(dry.ctx);
    expect(viaScript).toEqual(await install(dry.ctx));
    expect(viaScript.steps.length).toBeGreaterThan(0);
  });
});
