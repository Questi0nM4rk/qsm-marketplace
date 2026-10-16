import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  type Call,
  flagArg,
  optionalNumber,
  optionalString,
  parseCall,
  renderHelp,
  renderVerbHelp,
  requiredNumber,
  requiredString,
  runCli,
  stringList,
} from "./cli-base.ts";
import { grouped, manifest } from "./fixtures/cli-fixture.ts";
import { runBin } from "./fixtures/cli.ts";
import { isRecord, ok } from "./outcome.ts";
import { parseManifest } from "./qsm-manifest.ts";

const FIXTURE = resolve(import.meta.dir, "fixtures/cli-fixture.ts");

function run(...argv: string[]) {
  return runBin(FIXTURE, argv);
}

describe("parseCall", () => {
  test("positionals in order, typed flags, repeatable collects, choices pass", () => {
    const call = parseCall(manifest, "qsm-fix", [
      "echo",
      "bob",
      "--times",
      "3",
      "--loud",
      "--tag",
      "a",
      "--tag",
      "b",
      "--mode",
      "add",
    ]);
    expect(call).toEqual({
      ok: true,
      call: {
        verb: "echo",
        args: { name: "bob", times: 3, loud: true, tag: ["a", "b"], mode: "add" },
        rest: [],
        json: false,
        noInput: false,
      },
    });
  });

  test("a repeatable positional takes every remaining value", () => {
    const call = parseCall(manifest, "qsm-fix", ["files", "a.ts", "b.ts", "c.ts"]);
    expect(call).toMatchObject({ ok: true, call: { args: { input: ["a.ts", "b.ts", "c.ts"] } } });
  });

  test("passthrough after -- is untouched, flags before it still parse", () => {
    const call = parseCall(manifest, "qsm-fix", [
      "run",
      "--shell",
      "fish",
      "--",
      "--not-a-flag",
      "x",
    ]);
    expect(call).toMatchObject({
      ok: true,
      call: { args: { shell: "fish" }, rest: ["--not-a-flag", "x"] },
    });
  });
});

describe("parseCall rejects", () => {
  test("A flag's value joined by an equals sign", () => {
    const call = parseCall(manifest, "qsm-fix", [
      "echo",
      "bob",
      "--times=4",
      "--mode=remove",
      "--tag=x",
    ]);
    expect(call).toMatchObject({
      ok: true,
      call: { args: { times: 4, mode: "remove", tag: ["x"] } },
    });
    const bad = parseCall(manifest, "qsm-fix", ["echo", "bob", "--loud=yes"]);
    expect(bad).toMatchObject({ ok: false, message: "--loud takes no value" });
  });

  test("--json is accepted on every verb without being declared", () => {
    expect(parseCall(manifest, "qsm-fix", ["files", "--json"])).toMatchObject({
      ok: true,
      call: { json: true, noInput: true, args: {} },
    });
  });

  test("An unknown flag", () => {
    const cases: [string[], string][] = [
      [["nope"], "unknown verb nope"],
      [["echo", "bob", "--volume", "9"], "unknown flag --volume"],
      [["echo"], "missing required argument name"],
      [["echo", "bob", "--mode", "drop"], "--mode must be one of add, remove"],
      [["echo", "bob", "--times", "many"], "--times expects a number"],
      [["echo", "bob", "--times"], "--times expects a value"],
      [["echo", "bob", "--tag"], "--tag expects a value"],
      [["echo", "bob", "extra"], "unexpected argument extra"],
    ];
    for (const [argv, message] of cases) {
      const r = parseCall(manifest, "qsm-fix", argv);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.message).toBe(message);
      }
    }
  });

  test("help requests are their own result", () => {
    expect(parseCall(manifest, "qsm-fix", [])).toEqual({ ok: false, help: "bin", message: "" });
    expect(parseCall(manifest, "qsm-fix", ["--help"])).toEqual({
      ok: false,
      help: "bin",
      message: "",
    });
    expect(parseCall(manifest, "qsm-fix", ["echo", "--help"])).toEqual({
      ok: false,
      help: "echo",
      message: "",
    });
  });
});

describe("help text", () => {
  test("Help lists every declared verb", () => {
    const text = renderHelp(manifest, "qsm-fix");
    expect(text).toContain("usage: qsm-fix <verb> [args] [--json] [--no-input]");
    for (const verb of ["echo", "files", "run", "outcome"]) {
      expect(text).toContain(`  ${verb}`);
    }
    expect(text).toContain("print the parsed call back");
    expect(text.match(/^ {2}\S/gm)).toHaveLength(4);
  });

  test("verb help shows positionals, flags with types, choices, repeatable, passthrough", () => {
    const text = renderVerbHelp(manifest, "qsm-fix", "echo");
    expect(text).toContain("usage: qsm-fix echo <name> [flags] [--json] [--no-input]");
    expect(text).toContain("--times <number>");
    expect(text).toContain("--loud ");
    expect(text).toContain("--tag <string>");
    expect(text).toContain("repeatable");
    expect(text).toContain("add|remove");
    expect(renderVerbHelp(manifest, "qsm-fix", "run")).toContain("-- <args...>");
  });
});

describe("through the real surface", () => {
  test("ok with data: text mode prints the message, json prints the envelope", () => {
    const text = run("outcome", "ok");
    expect(text).toEqual({ exit: 0, stdout: "all good\n", stderr: "" });
    const json = run("outcome", "ok", "--json");
    expect(json.exit).toBe(0);
    expect(json.stderr).toBe("");
    expect(JSON.parse(json.stdout)).toMatchObject({ code: "ok", exit: 0, data: { fine: true } });
  });

  test("every non-ok code maps to its exit, warnings never change it", () => {
    for (const [code, exit] of [
      ["failed", 1],
      ["worse", 3],
      ["missing", 4],
      ["blocked", 5],
    ] as const) {
      const r = run("outcome", code, "--warn", "w1", "--warn", "w2");
      expect(r.exit).toBe(exit);
      expect(r.stdout).toBe("");
      expect(r.stderr).toBe(`${code}: asked for ${code}\nwarning: w1\nwarning: w2\n`);
    }
    const j = run("outcome", "worse", "--json", "--warn", "w1");
    expect(j.exit).toBe(3);
    expect(JSON.parse(j.stdout)).toMatchObject({ code: "worse", exit: 3, warnings: ["w1"] });
  });
});

/** The `data` of a --json envelope on stdout; a stdout that is not an envelope object fails loud. */
function dataOf(stdout: string): unknown {
  const envelope: unknown = JSON.parse(stdout);
  if (!isRecord(envelope)) {
    throw new Error(`stdout is not an envelope: ${stdout}`);
  }
  return envelope.data;
}

describe("through the real surface, usage and help", () => {
  test("usage error: text mode prints usage on stderr, exit 2, handler never runs", () => {
    const r = run("echo", "bob", "--volume", "9");
    expect(r.exit).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("usage: unknown flag --volume");
    expect(r.stderr).toContain("usage: qsm-fix echo <name>");
  });

  test("Usage error under --json", () => {
    const r = run("echo", "bob", "--volume", "9", "--json");
    expect(r.exit).toBe(2);
    expect(JSON.parse(r.stdout)).toMatchObject({
      code: "usage",
      exit: 2,
      message: "unknown flag --volume",
    });
    expect(r.stderr).toContain("usage: qsm-fix echo");
  });

  test("--help on stdout, exit 0", () => {
    const r = run("--help");
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain("usage: qsm-fix <verb>");
    expect(run("echo", "--help").stdout).toContain("usage: qsm-fix echo");
  });

  test("the handler sees typed args and the passthrough rest", () => {
    const r = run("run", "--shell", "fish", "--json", "--", "--flag", "v");
    expect(dataOf(r.stdout)).toEqual({ shell: "fish", rest: ["--flag", "v"] });
    const e = run("echo", "bob", "--times", "2", "--loud", "--json");
    expect(dataOf(e.stdout)).toEqual({ name: "bob", times: 2, loud: true });
  });
});

const call = (args: Call["args"]): Call => ({
  verb: "v",
  args,
  rest: [],
  json: true,
  noInput: true,
});

describe("typed arg accessors and the manifest parser", () => {
  test("each accessor reads what the parser delivers", () => {
    const c = call({ s: "x", n: 2, b: true, l: ["a", "b"] });
    expect([requiredString(c, "s"), optionalString(c, "none")]).toEqual(["x", undefined]);
    expect([requiredNumber(c, "n"), optionalNumber(c, "none")]).toEqual([2, undefined]);
    expect([flagArg(c, "b"), flagArg(c, "none")]).toEqual([true, false]);
    expect([stringList(c, "l"), stringList(c, "none")]).toEqual([["a", "b"], []]);
  });

  test("a required arg the handler finds missing is the usage outcome through runCli", async () => {
    const one = parseManifest({
      qsm: { bin: { "qsm-x": "x.ts" }, commands: { "qsm-x go": { description: "go" } } },
    });
    const out: string[] = [];
    const io = { stdout: (t: string) => void out.push(t), stderr: (t: string) => void out.push(t) };
    const code = await runCli(
      one,
      "qsm-x",
      { go: (c: Call) => ok(requiredString(c, "name")) },
      { argv: ["go", "--json"], io },
    );
    expect(code).toBe(2);
    expect(out.join("")).toContain('"code":"usage"');
  });

  test("a manifest of the wrong shape names the file and the field", () => {
    const bad = { qsm: { commands: { "qsm-x go": { description: 1 } } } };
    expect(() => parseManifest(bad, "plugins/x/qsm.json")).toThrow(
      /^plugins\/x\/qsm\.json: qsm\.commands\.qsm-x go\.description:/,
    );
  });
});

describe("multi-word verbs", () => {
  test("A two-word verb", () => {
    expect(parseCall(grouped, "qsm-g", ["toon", "encode", "a.json", "--table"])).toEqual({
      ok: true,
      call: {
        verb: "toon encode",
        args: { file: "a.json", table: true },
        rest: [],
        json: false,
        noInput: false,
      },
    });
    expect(parseCall(grouped, "qsm-g", ["gh", "pr", "submit-review", "12"])).toMatchObject({
      ok: true,
      call: { verb: "gh pr submit-review", args: { pr: 12 } },
    });
    expect(parseCall(grouped, "qsm-g", ["count", "toon", "encode"])).toMatchObject({
      ok: true,
      call: { verb: "count", args: { files: ["toon", "encode"] } },
    });
  });

  test("a group asks for help or names its verbs; an unknown word is an unknown verb", () => {
    expect(parseCall(grouped, "qsm-g", ["toon", "--help"])).toEqual({
      ok: false,
      help: "toon",
      message: "",
    });
    expect(parseCall(grouped, "qsm-g", ["toon"])).toEqual({
      ok: false,
      message: "toon needs a verb: encode, decode",
      verb: "toon",
    });
    expect(parseCall(grouped, "qsm-g", ["toon", "squash"])).toEqual({
      ok: false,
      message: "unknown verb toon squash",
    });
  });

  test("Help for a group", () => {
    const help = renderVerbHelp(grouped, "qsm-g", "toon");
    expect(help).toContain("usage: qsm-g toon <verb>");
    expect(help).toContain("encode  encode to TOON");
    expect(help).toContain("decode  decode TOON");
    expect(help).not.toContain("count");
    expect(renderHelp(grouped, "qsm-g")).toContain("gh pr submit-review");
  });
});
