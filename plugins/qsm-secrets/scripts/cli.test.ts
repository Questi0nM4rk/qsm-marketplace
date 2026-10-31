// The CLI end to end, against fake backends the test writes into a sandbox
// and puts first on PATH. Nothing here touches a real vault.
//
// One conformance suite runs once per backend, rbw against a fake rbw and
// libsecret against a fake secret-tool, with the same expectations: a verb
// that behaves differently on the two is a defect in one of them. The fixture
// values are checked never to appear in the output of a verb that must not
// print one, which is the discipline the whole plugin exists to keep.

import { beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { bareRuntimePath, fakeBin } from "../../../lib/fixtures/bin.ts";
import { isolatedEnv, runBin } from "../../../lib/fixtures/cli.ts";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { isRecord } from "../../../lib/outcome.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import { fakeQs } from "../lib/askpass/fake-qs.ts";

const CLI = resolve(import.meta.dir, "cli.ts");
const PANE = resolve(import.meta.dir, "../qml/askpass");

const VALUE = "gh0st-token-value-1";
const NPM_VALUE = "npm-value-1";
const WORK_VALUE = "work-value-1";
const CAPTURED_VALUE = "hunter2-x";
const VALUE_MARKERS = [VALUE, NPM_VALUE, WORK_VALUE, CAPTURED_VALUE, "s3cret-value", "other-value"];

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** With a backend: its directory first. Without one: the runtime alone, so no backend installed
 * on the machine running these tests can answer. */
function pathWith(bin: string | null): string {
  return bin === null ? bareRuntimePath() : `${bin}:${process.env.PATH ?? ""}`;
}

/** EDITOR is pinned rather than inherited: the doctor's editor check reads
 * it, and a test that passes only in a shell that happens to set it is not
 * proof of anything. */
const FIXED_ENV = { QSM_SECRETS_FOLDER: "qsm", EDITOR: "true" };

/** The environment of every child: the pinned one, then `env`; its HOME, else a fresh one. */
function childEnv(env: Record<string, string>): Record<string, string> {
  return isolatedEnv(env.HOME ?? sandboxDir("qsm-secrets-home-"), { ...FIXED_ENV, ...env });
}

/** The CLI with the pinned environment; `env` adds to it or overrides it. */
function cliRun(args: string[], env: Record<string, string> = {}, input?: string): Run {
  const r = runBin(CLI, args, { env: childEnv(env), ...(input === undefined ? {} : { input }) });
  return { code: r.exit, stdout: r.stdout, stderr: r.stderr };
}

/** Another program (a shell, `script`, `env`) under the same environment. */
function spawned(command: string, args: string[], env: Record<string, string> = {}): Run {
  const result = spawnSync(command, args, { encoding: "utf8", env: childEnv(env) });
  return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

/** The first fixture value found in either stream, or null. A value, not an
 * assertion, so a failure names the one that escaped. */
function leaked(run: Run): string | null {
  return (
    VALUE_MARKERS.find((marker) => run.stdout.includes(marker) || run.stderr.includes(marker)) ??
    null
  );
}

const isString = (value: unknown): value is string => typeof value === "string";

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item: unknown) => isString(item));

const isNamed = (value: unknown): value is { name: string }[] =>
  Array.isArray(value) && value.every((item: unknown) => isRecord(item) && isString(item.name));

const isListedIds = (value: unknown): value is { namespace: string; key: string }[] =>
  Array.isArray(value) &&
  value.every((item: unknown) => isRecord(item) && isString(item.namespace) && isString(item.key));

const isCaptured = (value: unknown): value is { id: string }[] =>
  Array.isArray(value) && value.every((item: unknown) => isRecord(item) && isString(item.id));

const isChecks = (value: unknown): value is { name: string; ok: boolean; fix: string | null }[] =>
  Array.isArray(value) &&
  value.every(
    (item: unknown) =>
      isRecord(item) &&
      isString(item.name) &&
      typeof item.ok === "boolean" &&
      (item.fix === null || isString(item.fix)),
  );

/** One field of an envelope's data, checked: a failure names the field instead of casting it. */
function field<T>(
  data: Record<string, unknown>,
  name: string,
  isShape: (value: unknown) => value is T,
): T {
  const value = data[name];
  if (!isShape(value)) {
    throw new Error(`data.${name} has an unexpected shape`);
  }
  return value;
}

/** The one JSON value the shared base prints on stdout under --json. */
function envelope(run: { readonly stdout: string }): {
  code: string;
  exit: number;
  message: string;
  data: Record<string, unknown>;
} {
  const parsed: unknown = JSON.parse(run.stdout);
  if (!isRecord(parsed) || !isString(parsed.code) || typeof parsed.exit !== "number") {
    throw new Error(`not an outcome envelope: ${run.stdout.slice(0, 200)}`);
  }
  return {
    code: parsed.code,
    exit: parsed.exit,
    message: isString(parsed.message) ? parsed.message : "",
    data: isRecord(parsed.data) ? parsed.data : {},
  };
}

/** The placeholder text, built here so no literal one sits in this file. */
const placeholderOf = (id: string): string => ["{{", "secret", ":", id, "}}"].join("");

/** A secret-tool over `store`: `search` prints the `secret =` line on stdout and the attributes on
 * stderr, in a different order per item. Without a terminal `store` reads stdin; with one it
 * stands in for the prompt and takes FAKE_TYPED. FAKE_LOCKED names the one key whose value cannot
 * be read, as a locked vault answers. */
function fakeSecretTool(store: string): string {
  return `store='${store}'
verb="$1"; shift
case "$verb" in
  search)
    [ -n "$FAKE_LIST_FAILS" ] && { echo "secret-tool: Cannot create an item in a locked collection" >&2; exit 1; }
    n=0
    for f in "$store"/*; do
      [ -f "$f" ] || continue
      n=$((n+1))
      base=$(basename "$f"); ns=\${base%%__*}; key=\${base#*__}
      printf '[/fake/%s]\\nlabel = qsm %s/%s\\nsecret = ' "$n" "$ns" "$key"
      cat "$f"; printf '\\nschema = org.freedesktop.Secret.Generic\\n'
      if [ "$ns" = "none" ]; then
        printf 'attribute.key = %s\\nattribute.service = qsm\\n' "$key" >&2
      elif [ $((n % 2)) = 0 ]; then
        printf 'attribute.key = %s\\nattribute.namespace = %s\\nattribute.service = qsm\\n' "$key" "$ns" >&2
      else
        printf 'attribute.service = qsm\\nattribute.namespace = %s\\nattribute.key = %s\\n' "$ns" "$key" >&2
      fi
    done ;;
  lookup)
    ns=""
    while [ $# -gt 0 ]; do
      case "$1" in namespace) ns="$2" ;; key) key="$2" ;; esac; shift
    done
    [ "$key" = "$FAKE_LOCKED" ] && exit 1
    if [ -z "$ns" ]; then
      for f in "$store"/*__"$key"; do [ -f "$f" ] && { cat "$f"; exit 0; }; done; exit 1
    fi
    [ -f "$store/\${ns}__\${key}" ] && cat "$store/\${ns}__\${key}" || exit 1 ;;
  store)
    ns=none
    while [ $# -gt 0 ]; do
      case "$1" in namespace) ns="$2" ;; key) key="$2" ;; esac; shift
    done
    if [ -t 0 ]; then printf '%s' "$FAKE_TYPED" > "$store/\${ns}__\${key}"; else cat > "$store/\${ns}__\${key}"; fi ;;
  clear)
    ns=""
    while [ $# -gt 0 ]; do
      case "$1" in namespace) ns="$2" ;; key) key="$2" ;; esac; shift
    done
    if [ -z "$ns" ]; then rm -f "$store"/*__"$key"; else rm -f "$store/\${ns}__\${key}"; fi ;;
  *) exit 1 ;;
esac
`;
}

/** A stateful rbw over `store`: one file per folder__name, and `<file>.user` when the row's user is
 * not this wrapper. `add` takes the value from stdin, or from FAKE_TYPED where stdin is a terminal.
 * FAKE_LOCKED names the one entry `get` cannot read. */
function fakeRbw(store: string): string {
  return `store='${store}'
verb="$1"; shift
folder=""; name=""; user=""
while [ $# -gt 0 ]; do
  case "$1" in
    --folder) folder="$2"; shift 2 ;;
    --fields) shift 2 ;;
    *) if [ -z "$name" ]; then name="$1"; elif [ -z "$user" ]; then user="$1"; fi; shift ;;
  esac
done
case "$verb" in
  list)
    [ -n "$FAKE_LIST_FAILS" ] && { echo "the agent is locked" >&2; exit 1; }
    for f in "$store"/*; do
      [ -f "$f" ] || continue
      case "$f" in *.user) continue ;; esac
      base=$(basename "$f")
      owner=qsm-secrets; [ -f "$f.user" ] && owner=$(cat "$f.user")
      printf '%s\\t%s\\t%s\\n' "\${base#*__}" "\${base%%__*}" "$owner"
    done ;;
  unlocked) exit 0 ;;
  config) printf '{"email": "someone@example.test"}\\n' ;;
  get) [ "$name" = "$FAKE_LOCKED" ] && { echo "vault is locked" >&2; exit 1; }
       [ -f "$store/\${folder}__\${name}" ] || { echo "couldn't find entry for '$name'" >&2; exit 1; }
       cat "$store/\${folder}__\${name}"; echo ;;
  add) if [ -t 0 ]; then printf '%s' "$FAKE_TYPED" > "$store/\${folder}__\${name}"; else cat > "$store/\${folder}__\${name}"; fi ;;
  remove) [ -f "$store/\${folder}__\${name}" ] || { echo "couldn't find entry for '$name'" >&2; exit 1; }
          rm -f "$store/\${folder}__\${name}" ;;
  *) exit 1 ;;
esac
`;
}

interface Flavor {
  readonly name: "rbw" | "libsecret";
  readonly fake: (store: string) => string;
  /** What the backend off PATH says: the message and the install step it names. */
  readonly absent: readonly [string, string];
  /** How many prerequisites `doctor` probes when all is well, and when the binary is gone. */
  readonly checks: readonly [number, number];
  /** What storing a value of several lines does: rbw keeps one line, libsecret keeps all. */
  readonly multiline: "refused" | "stored";
}

const FLAVORS: readonly Flavor[] = [
  {
    name: "rbw",
    fake: fakeRbw,
    absent: ["rbw is not on PATH", "cargo install rbw"],
    checks: [7, 7],
    multiline: "refused",
  },
  {
    name: "libsecret",
    fake: fakeSecretTool,
    absent: ["secret-tool is not on PATH", "install libsecret"],
    checks: [5, 4],
    multiline: "stored",
  },
];

/** A fixed pty for the one verb that requires a terminal. `script` runs the command under it and
 * exits with the command's own status; both streams come back merged, as a person sees them. */
function terminal(command: string, env: Record<string, string>): Run {
  return spawned("script", ["-qec", command, "/dev/null"], env);
}

describe("the shared CLI base", () => {
  const cli = (args: string[]): Run => cliRun(args, { PATH: pathWith(null) });

  test("--help lists every verb qsm.json declares", () => {
    const run = cli(["--help"]);
    expect(run.code).toBe(0);
    const declared = Object.keys(
      parseManifest(
        JSON.parse(readFileSync(resolve(import.meta.dir, "../qsm.json"), "utf8")),
        "qsm-secrets/qsm.json",
      ).qsm.commands,
    ).map((name) => name.replace("qsm-secrets ", ""));
    expect(declared.length).toBeGreaterThan(18);
    for (const verb of declared) {
      expect(run.stdout).toMatch(new RegExp(`^  ${verb} {2,}\\S`, "m"));
    }
  });

  test("an unknown flag is a usage error, exit 2", () => {
    const run = cli(["list", "--all"]);
    expect(run.code).toBe(2);
    expect(run.stderr).toContain("unknown flag --all");
  });

  test("a usage error under --json is still one envelope", () => {
    const run = cli(["list", "--all", "--json"]);
    expect(run.code).toBe(2);
    expect(envelope(run)).toMatchObject({ code: "usage", exit: 2 });
  });

  test("mask --all with no backend chosen returns every string unchanged", () => {
    const home = sandboxDir("qsm-secrets-nochoice-");
    const rows = ["tok=hunter2", "plain"];
    const run = cliRun(
      ["mask", "--all", "--json"],
      { PATH: pathWith(null), HOME: home, XDG_CONFIG_HOME: home },
      JSON.stringify(rows),
    );
    expect(run.code).toBe(0);
    expect(envelope(run).data.texts).toEqual(rows);
  });

  test("clean without a runtime directory is ok and removes nothing", () => {
    const run = cliRun(["clean", "--session", "s1", "--json"], {
      PATH: pathWith(null),
      XDG_RUNTIME_DIR: "",
    });
    expect(run.code).toBe(0);
    expect(envelope(run).data).toEqual({ dir: null });
  });
});

for (const flavor of FLAVORS) {
  describe(`conformance: ${flavor.name}`, () => {
    let bin = "";
    let store = "";
    let home = "";
    let runtime = "";
    const file = (folder: string, key: string): string => join(store, `${folder}__${key}`);
    const put = (folder: string, key: string, value: string): void => {
      writeFileSync(file(folder, key), value);
    };

    const environment = (extra: Record<string, string> = {}): Record<string, string> => ({
      QSM_SECRETS_BACKEND: flavor.name,
      PATH: pathWith(bin),
      HOME: home,
      XDG_RUNTIME_DIR: runtime,
      ...extra,
    });
    const cli = (
      args: string[],
      options: { backend?: boolean; input?: string; env?: Record<string, string> } = {},
    ): Run =>
      cliRun(
        args,
        environment({
          ...(options.backend === false ? { PATH: pathWith(null) } : {}),
          ...options.env,
        }),
        options.input,
      );
    /** For the cases that need a real shell: a descriptor the caller opens, or leaves closed. */
    const shell = (script: string): Run => spawned("sh", ["-c", script], environment({ CLI }));

    beforeEach(() => {
      bin = sandboxDir("qsm-secrets-bin-");
      store = sandboxDir("qsm-secrets-store-");
      home = sandboxDir("qsm-secrets-home-");
      runtime = sandboxDir("qsm-secrets-run-");
      if (flavor.name === "libsecret") {
        fakeBin(bin, "busctl", "exit 0");
        fakeBin(bin, "secret-tool", flavor.fake(store));
      } else {
        fakeBin(bin, "rbw", flavor.fake(store));
      }
      fakeQs(bin);
      const project = join(home, ".claude", "projects", "p");
      mkdirSync(project, { recursive: true });
      writeFileSync(join(project, "s.jsonl"), `{"text":"${placeholderOf("cap_used")}"}\n`);
      put("qsm", "github-token", VALUE);
      put("qsm", "npm-token", NPM_VALUE);
      put("work", "work-token", WORK_VALUE);
      put("capture", "cap_x", CAPTURED_VALUE);
    });

    describe("has", () => {
      test("Key exists", () => {
        const run = cli(["has", "github-token"]);
        expect(run.code).toBe(0);
        expect(run.stdout).toBe("");
        expect(run.stderr).toBe("");
      });

      test("Key missing", () => {
        const run = cli(["has", "nope"]);
        expect(run.code).toBe(4);
        expect(run.stderr).toContain("not stored: nope");
        expect(leaked(run)).toBeNull();
      });

      test("--json answers with data, never a value", () => {
        const run = cli(["has", "github-token", "--json"]);
        expect(envelope(run)).toMatchObject({ code: "ok", data: { key: "github-token" } });
        expect(leaked(run)).toBeNull();
      });

      test("a named alternate namespace is the only one read", () => {
        expect(cli(["has", "work-token", "--folder", "work"]).code).toBe(0);
        expect(cli(["has", "work-token"]).code).toBe(4);
      });
    });

    describe("list", () => {
      test("Listing keys of a namespace", () => {
        const run = cli(["list"]);
        expect(run.code).toBe(0);
        expect(
          run.stdout
            .trim()
            .split("\n")
            .toSorted((a, b) => a.localeCompare(b)),
        ).toEqual(["github-token", "npm-token"]);
        expect(leaked(run)).toBeNull();
        expect(cli(["list", "--folder", "work"]).stdout.trim()).toBe("work-token");
      });

      test("with no --folder and no QSM_SECRETS_FOLDER lists every namespace, capture included", () => {
        const run = spawned("env", ["-u", "QSM_SECRETS_FOLDER", "bun", CLI, "list"], environment());
        expect(run.code).toBe(0);
        expect(
          run.stdout
            .trim()
            .split("\n")
            .toSorted((a, b) => a.localeCompare(b)),
        ).toEqual(["capture/cap_x", "qsm/github-token", "qsm/npm-token", "work/work-token"]);
        expect(leaked(run)).toBeNull();
      });

      test("--json carries the same names inside the envelope", () => {
        const run = cli(["list", "--json"]);
        const data = envelope(run).data;
        expect(data.namespace).toBe("qsm");
        expect([...field(data, "keys", isStrings)].toSorted((a, b) => a.localeCompare(b))).toEqual([
          "github-token",
          "npm-token",
        ]);
        expect(leaked(run)).toBeNull();
      });
    });

    describe("inspect", () => {
      test("Inspecting every entry in a namespace", () => {
        const run = cli(["inspect"]);
        expect(run.code).toBe(0);
        expect(run.stdout).toContain("name: github-token");
        expect(run.stdout).toContain("stored-by: qsm-secrets");
        expect(run.stdout).not.toContain("work-token");
        expect(leaked(run)).toBeNull();
      });

      test("--json is metadata only too", () => {
        const run = cli(["inspect", "--json"]);
        const entries = field(envelope(run).data, "entries", isNamed);
        expect(entries.map((entry) => entry.name).toSorted((a, b) => a.localeCompare(b))).toEqual([
          "github-token",
          "npm-token",
        ]);
        expect(leaked(run)).toBeNull();
      });
    });

    describe("rm", () => {
      test("Removing a stored key", () => {
        const run = cli(["rm", "github-token"]);
        expect(run.code).toBe(0);
        expect(run.stdout).toContain("removed github-token");
        expect(leaked(run)).toBeNull();
        // The second half of the scenario: gone, not merely reported gone.
        expect(cli(["has", "github-token"]).code).toBe(4);
        expect(cli(["list"]).stdout).not.toContain("github-token");
      });

      test("Removing a key that was never stored", () => {
        const run = cli(["rm", "nope"]);
        expect(run.code).toBe(4);
        expect(run.stderr).toContain("not stored: nope");
        expect(leaked(run)).toBeNull();
      });
    });

    describe("pipe", () => {
      test("Piping a stored key to a consumer", () => {
        const seen = join(runtime, "piped");
        const run = cli([
          "pipe",
          "github-token",
          "--",
          "sh",
          "-c",
          `cat > '${seen}'; echo consumed`,
        ]);
        expect(run.code).toBe(0);
        expect(run.stdout).toBe("consumed\n");
        expect(readFileSync(seen, "utf8")).toBe(VALUE);
        expect(leaked(run)).toBeNull();
      });

      test("the consumer's own failure is reported, not swallowed", () => {
        const run = cli(["pipe", "github-token", "--", "sh", "-c", "exit 7"]);
        expect(run.code).toBe(1);
        expect(run.stderr).toContain("exited 7");
      });

      test("Key not stored", () => {
        const seen = join(runtime, "never");
        const run = cli(["pipe", "nope", "--", "sh", "-c", `echo ran > '${seen}'`]);
        expect(run.code).toBe(4);
        expect(run.stderr).toContain("not stored: nope");
        expect(existsSync(seen)).toBe(false);
      });

      test("a missing -- is a usage error, not a guess", () => {
        expect(cli(["pipe", "github-token", "echo"]).code).toBe(2);
      });

      test("--json is refused rather than mixing a consumer's output into an envelope", () => {
        const run = cli(["pipe", "github-token", "--json", "--", "true"]);
        expect(run.code).toBe(5);
        expect(envelope(run)).toMatchObject({ code: "blocked", exit: 5 });
        expect(leaked(run)).toBeNull();
      });
    });

    describe("env", () => {
      test("Running a consumer with the value as one env var", () => {
        const run = cli(["env", "github-token=V", "--", "printenv", "V"]);
        expect(run.code).toBe(0);
        expect(run.stdout).toBe(`${VALUE}\n`);
      });

      test("a named namespace is read for the delivery", () => {
        const run = cli(["env", "cap_x=V", "--folder", "capture", "--", "printenv", "V"]);
        expect(run.code).toBe(0);
        expect(run.stdout.trim()).toBe(CAPTURED_VALUE);
      });

      test("Key not stored for the environment delivery", () => {
        const seen = join(runtime, "env-never");
        const run = cli(["env", "nope=V", "--", "sh", "-c", `echo ran > '${seen}'`]);
        expect(run.code).toBe(4);
        expect(existsSync(seen)).toBe(false);
      });

      test("a variable name a shell would not accept is refused", () => {
        expect(cli(["env", "github-token=2BAD", "--", "true"]).code).toBe(2);
      });
    });

    describe("get", () => {
      test("Caller did not open the channel", () => {
        const run = shell(`exec 3>&-; bun "$CLI" get github-token`);
        expect(run.code).toBe(5);
        expect(run.stderr).toContain("qsm-secrets pipe");
        expect(leaked(run)).toBeNull();
      });

      test("Caller opened the channel", () => {
        const target = join(runtime, "fd3");
        const run = shell(`bun "$CLI" get github-token 3>'${target}'`);
        expect(run.code).toBe(0);
        expect(run.stdout).toBe("");
        expect(readFileSync(target, "utf8")).toBe(VALUE);
      });

      test("Machine output asked of a verb that carries a value", () => {
        const target = join(runtime, "fd3-json");
        const run = shell(`bun "$CLI" get github-token --json 3>'${target}'`);
        expect(run.code).toBe(5);
        expect(readFileSync(target, "utf8")).toBe("");
        expect(leaked(run)).toBeNull();
      });
    });

    describe("set", () => {
      const typed = (key: string, value: string): Run =>
        terminal(`bun ${CLI} set ${key}`, environment({ FAKE_TYPED: value }));

      test("refuses without a terminal, so a value cannot arrive from a script", () => {
        const run = cli(["set", "new-key"]);
        expect(run.code).toBe(4);
        expect(run.stderr).toContain("needs a terminal");
      });

      test("Storing a new key", () => {
        const run = typed("new-key", "typed-value-1");
        expect(run.code).toBe(0);
        expect(run.stdout).toContain("stored new-key");
        expect(readFileSync(file("qsm", "new-key"), "utf8")).toBe("typed-value-1");
        expect(cli(["has", "new-key"]).code).toBe(0);
      });

      test("Prompt dismissed without a value", () => {
        const run = typed("empty-key", "");
        expect(run.code).toBe(1);
        expect(run.stdout).toContain("came back empty");
        expect(cli(["has", "empty-key"]).code).toBe(4);
      });
    });

    describe("set --gui", () => {
      const gui = (key: string, extra: Record<string, string>): Run =>
        cli(["set", key, "--gui"], {
          env: { QSM_ASKPASS_QML: PANE, FAKE_QS_LOG: join(runtime, "qs.log"), ...extra },
        });

      test("stores what the pane sends, and the value is in no output and no request", () => {
        const run = gui("gui-key", { FAKE_ACTION: "allow", FAKE_VALUE: "gui-value-1" });
        expect(run.code).toBe(0);
        expect(run.stdout).toBe("stored gui-key\n");
        expect(readFileSync(file("qsm", "gui-key"), "utf8").trim()).toBe("gui-value-1");
        expect(run.stdout + run.stderr).not.toContain("gui-value-1");
        expect(readFileSync(join(runtime, "qs.log"), "utf8")).not.toContain("gui-value-1");
        expect(cli(["has", "gui-key"]).code).toBe(0);
        expect(existsSync(join(runtime, "qsm-askpass"))).toBe(false);
      });

      test("cancel in the pane stores nothing and fails with the reason", () => {
        const run = gui("gui-key", { FAKE_ACTION: "cancel" });
        expect(run.code).toBe(1);
        expect(run.stderr).toContain("cancelled by the person");
        expect(cli(["has", "gui-key"]).code).toBe(4);
      });

      test("an empty answer stores nothing", () => {
        const run = gui("gui-key", { FAKE_ACTION: "allow", FAKE_VALUE: "" });
        expect(run.code).toBe(1);
        expect(cli(["has", "gui-key"]).code).toBe(4);
      });

      test("without qs it is missing and asks nothing", () => {
        const run = cli(["set", "gui-key", "--gui"], {
          backend: false,
          env: { QSM_ASKPASS_QML: PANE },
        });
        expect(run.code).toBe(4);
        expect(run.stderr).toContain("quickshell (qs) is not on PATH");
      });
    });

    describe("mask", () => {
      test("--id swaps each named id's stored value for its placeholder", () => {
        const run = cli(["mask", "--id", "cap_x", "--id", "qsm/npm-token"], {
          input: `a ${CAPTURED_VALUE} b ${NPM_VALUE}`,
        });
        expect(run.code).toBe(0);
        expect(run.stdout.trimEnd()).toBe(
          `a ${placeholderOf("cap_x")} b ${placeholderOf("qsm/npm-token")}`,
        );
      });

      test("--id of a key that is not stored is missing", () => {
        expect(cli(["mask", "--id", "nope"], { input: "x" }).code).toBe(4);
      });

      test("--id of a stored key that cannot be read is blocked, not missing", () => {
        const run = cli(["mask", "--id", "cap_x"], { input: "x", env: { FAKE_LOCKED: "cap_x" } });
        expect(run.code).toBe(5);
        expect(run.stderr).toContain("cap_x");
      });

      test("--all masks every stored value of every namespace in each string", () => {
        const rows = [`tok=${CAPTURED_VALUE} and ${NPM_VALUE}`, "nothing here", ""];
        const run = cli(["mask", "--all", "--json"], { input: JSON.stringify(rows) });
        expect(run.code).toBe(0);
        expect(envelope(run).data.texts).toEqual([
          `tok=${placeholderOf("cap_x")} and ${placeholderOf("qsm/npm-token")}`,
          "nothing here",
          "",
        ]);
      });

      test("--all answers a subagent prompt over 64 KiB whole through the pipe", () => {
        const prompt = `${"x".repeat(300_000)} tok=${CAPTURED_VALUE}`;
        const run = cli(["mask", "--all", "--json"], { input: JSON.stringify([prompt]) });
        expect(run.code).toBe(0);
        expect(envelope(run).data.texts).toEqual([
          `${"x".repeat(300_000)} tok=${placeholderOf("cap_x")}`,
        ]);
      });

      test("--all refuses what is not a JSON array of strings", () => {
        expect(cli(["mask", "--all"], { input: '{"a":1}' }).code).toBe(2);
      });
    });

    describe("scrub", () => {
      test("swaps every stored value in the transcript and its subagents, named or not", () => {
        const project = join(home, ".claude", "projects", "scrub");
        mkdirSync(join(project, "s1", "subagents"), { recursive: true });
        const row = `{"attachment":{"content":"note ${NPM_VALUE}"}}\n`;
        writeFileSync(join(project, "s1.jsonl"), row);
        writeFileSync(join(project, "s1", "subagents", "agent-a.jsonl"), row);
        const run = cli(["scrub", "s1"]);
        expect(run.code).toBe(0);
        const masked = `{"attachment":{"content":"note ${placeholderOf("qsm/npm-token")}"}}\n`;
        expect(readFileSync(join(project, "s1.jsonl"), "utf8")).toBe(masked);
        expect(readFileSync(join(project, "s1", "subagents", "agent-a.jsonl"), "utf8")).toBe(
          masked,
        );
        expect(leaked(run)).toBeNull();
      });

      test("a stored value equal to a structural id is left in the structure and swapped in the text", () => {
        const project = join(home, ".claude", "projects", "scrub");
        mkdirSync(project, { recursive: true });
        const row = (v: string): string =>
          `${JSON.stringify({ sessionId: NPM_VALUE, cwd: `/x/${NPM_VALUE}`, message: { content: `id ${NPM_VALUE}` } })}\n`.replaceAll(
            NPM_VALUE,
            v,
          );
        writeFileSync(join(project, "s2.jsonl"), row(NPM_VALUE));
        expect(cli(["scrub", "s2"]).code).toBe(0);
        const done: unknown = JSON.parse(readFileSync(join(project, "s2.jsonl"), "utf8"));
        expect(done).toMatchObject({
          sessionId: NPM_VALUE,
          cwd: `/x/${NPM_VALUE}`,
          message: { content: `id ${placeholderOf("qsm/npm-token")}` },
        });
      });
    });

    describe("render", () => {
      const template = (text: string): string => {
        const path = join(runtime, "template");
        writeFileSync(path, text);
        return path;
      };

      test("writes the template with its ids replaced, readable by its owner only", () => {
        const run = cli([
          "render",
          template(`token=${placeholderOf("qsm/npm-token")} id=${placeholderOf("cap_x")}`),
          "--out",
          "config",
          "--session",
          "s1",
        ]);
        expect(run.code).toBe(0);
        const path = run.stdout.trim();
        expect(path).toBe(join(runtime, "qsm-secrets", "s1", "config"));
        expect(readFileSync(path, "utf8")).toBe(`token=${NPM_VALUE} id=${CAPTURED_VALUE}`);
        expect(statSync(path).mode & 0o777).toBe(0o600);
        expect(leaked(run)).toBeNull();
      });

      test("an id that is not stored is missing and writes nothing", () => {
        const run = cli([
          "render",
          template(placeholderOf("qsm/nope")),
          "--out",
          "config",
          "--session",
          "s1",
        ]);
        expect(run.code).toBe(4);
        expect(existsSync(join(runtime, "qsm-secrets", "s1", "config"))).toBe(false);
      });
    });

    describe("clean", () => {
      test("removes the session's directory with every rendered file, and a second run is ok", () => {
        const template = join(runtime, "template");
        writeFileSync(template, `token=${placeholderOf("qsm/npm-token")}`);
        for (const out of ["one", "two"]) {
          expect(cli(["render", template, "--out", out, "--session", "s9"]).code).toBe(0);
        }
        const session = join(runtime, "qsm-secrets", "s9");
        expect(readdirSync(session).toSorted((a, b) => a.localeCompare(b))).toEqual(["one", "two"]);
        const other = join(runtime, "qsm-secrets", "s10");
        mkdirSync(other, { recursive: true });
        const run = cli(["clean", "--session", "s9", "--json"]);
        expect(run.code).toBe(0);
        expect(envelope(run).data).toEqual({ dir: session });
        expect(existsSync(session)).toBe(false);
        expect(existsSync(other)).toBe(true);
        expect(leaked(run)).toBeNull();
        expect(cli(["clean", "--session", "s9"]).code).toBe(0);
      });
    });

    describe("scrub", () => {
      // Outside the projects directory, or prune would count its placeholders as named.
      const transcript = (): string => join(runtime, "scrub.jsonl");
      const line = (): string =>
        `{"text":"${CAPTURED_VALUE} ${placeholderOf("cap_x")} ${NPM_VALUE} ${placeholderOf("qsm/npm-token")} ${placeholderOf("cap_gone")}"}\n`;
      beforeEach(() => {
        writeFileSync(transcript(), line());
      });

      test("swaps every stored value still in the transcript for its placeholder, once", () => {
        const run = cli(["scrub", transcript(), "--json"]);
        expect(run.code).toBe(0);
        expect(envelope(run).data).toMatchObject({ scrubbed: 1 });
        expect(leaked(run)).toBeNull();
        const text = readFileSync(transcript(), "utf8");
        expect(text).not.toContain(CAPTURED_VALUE);
        expect(text).not.toContain(NPM_VALUE);
        expect(text).toContain(placeholderOf("cap_x"));
        expect(envelope(cli(["scrub", transcript(), "--json"])).data).toMatchObject({
          scrubbed: 0,
        });
      });

      test("a stored value that cannot be read is blocked, names the key, and changes nothing", () => {
        const run = cli(["scrub", transcript(), "--json"], { env: { FAKE_LOCKED: "cap_x" } });
        expect(run.code).toBe(5);
        const body = envelope(run);
        expect(body.code).toBe("blocked");
        expect(body.message).toContain("capture/cap_x");
        expect(readFileSync(transcript(), "utf8")).toBe(line());
      });
    });

    describe("a value of several lines", () => {
      const multi = "first line of it\nsecond line of it";
      beforeEach(() => {
        put("qsm", "multi", multi);
      });

      test(`is ${flavor.multiline} by ${flavor.name} when rename copies it`, () => {
        const run = cli(["rename", "multi", "moved-multi"]);
        if (flavor.multiline === "stored") {
          expect(run.code).toBe(0);
          expect(readFileSync(file("qsm", "moved-multi"), "utf8").trim()).toBe(multi);
          expect(existsSync(file("qsm", "multi"))).toBe(false);
        } else {
          expect(run.code).toBe(1);
          expect(run.stderr).toContain("stores one line");
          expect(run.stderr).toContain("use libsecret");
          expect(existsSync(file("qsm", "moved-multi"))).toBe(false);
          expect(readFileSync(file("qsm", "multi"), "utf8")).toBe(multi);
        }
        expect(leaked(run)).toBeNull();
      });
    });

    describe("rename", () => {
      beforeEach(() => {
        put("qsm", "old-name", "s3cret-value");
        put("qsm", "taken", "other-value");
      });

      test("moves the value, prints no value and removes the old name", () => {
        const done = cli(["rename", "old-name", "new-name"]);
        expect(done.code).toBe(0);
        expect(done.stdout).toContain("renamed qsm/old-name to qsm/new-name");
        expect(leaked(done)).toBeNull();
        expect(readFileSync(file("qsm", "new-name"), "utf8").trim()).toBe("s3cret-value");
        expect(cli(["has", "old-name"]).code).toBe(4);
      });

      test("refuses an existing target and changes nothing", () => {
        const refused = cli(["rename", "old-name", "taken"]);
        expect(refused.code).toBe(5);
        expect(refused.stderr).toContain("already stored: qsm/taken");
        expect(readFileSync(file("qsm", "taken"), "utf8").trim()).toBe("other-value");
        expect(cli(["has", "old-name"]).code).toBe(0);
      });

      test("a missing key is missing, and one name to itself is usage", () => {
        expect(cli(["rename", "nope", "x"]).code).toBe(4);
        expect(cli(["rename", "old-name", "old-name"]).code).toBe(2);
      });

      test("--to-folder moves it to another folder", () => {
        const moved = cli(["rename", "old-name", "moved", "--to-folder", "work"]);
        expect(moved.code).toBe(0);
        expect(readFileSync(file("work", "moved"), "utf8").trim()).toBe("s3cret-value");
        expect(cli(["has", "old-name"]).code).toBe(4);
      });
    });

    describe("check", () => {
      test("reports the probe's exit code and prints nothing of the probe", () => {
        const good = cli(["check", "github-token=V", "--", "sh", "-c", 'echo "$V"; test -n "$V"']);
        expect(good.code).toBe(0);
        expect(leaked(good)).toBeNull();
        const bad = cli(["check", "github-token=V", "--", "sh", "-c", 'echo "$V" >&2; exit 7']);
        expect(bad.code).toBe(1);
        expect(bad.stderr).toContain("exited 7");
        expect(leaked(bad)).toBeNull();
      });

      test("ok when the probe accepts the value, failed when it rejects it, in either case silent", () => {
        const accepts = ["sh", "-c", `test "$V" = ${VALUE}`];
        const ok = cli(["check", "github-token=V", "--", ...accepts]);
        expect(ok.code).toBe(0);
        expect(ok.stdout.trim()).toBe("ok: sh");
        expect(ok.stderr).toBe("");
        const revoked = cli(["check", "npm-token=V", "--", ...accepts]);
        expect(revoked.code).toBe(1);
        expect(revoked.stderr).toContain("exited 1");
        expect(cli(["check", "github-token=V", "--", "true"]).code).toBe(0);
        expect(cli(["check", "github-token=V", "--", "false"]).code).toBe(1);
        expect(leaked(revoked)).toBeNull();
      });

      test("a probe that prints the value prints nothing to the caller", () => {
        const loud = cli(["check", "github-token=V", "--", "sh", "-c", 'echo "$V"; echo "$V" >&2']);
        expect(loud.code).toBe(0);
        expect(leaked(loud)).toBeNull();
        expect(loud.stdout.trim()).toBe("ok: sh");
        expect(loud.stderr).toBe("");
      });

      test("a key that is not stored is missing and the probe never runs", () => {
        const run = cli([
          "check",
          "nope=V",
          "--",
          "sh",
          "-c",
          `echo ran > ${join(runtime, "ran")}`,
        ]);
        expect(run.code).toBe(4);
        expect(existsSync(join(runtime, "ran"))).toBe(false);
      });
    });

    describe("prune", () => {
      beforeEach(() => {
        put("capture", "cap_used", "used-value");
        put("capture", "cap_stale", "stale-value");
        put("qsm", "cap_stale", "not-a-capture");
      });

      test("--dry-run lists the unnamed capture id and removes nothing", () => {
        const listed = cli(["prune", "--dry-run"]);
        expect(listed.code).toBe(0);
        // cap_x is a capture id too, and no transcript names it.
        expect(
          listed.stdout
            .trim()
            .split("\n")
            .toSorted((a, b) => a.localeCompare(b)),
        ).toEqual(["cap_stale", "cap_x"]);
        expect(cli(["has", "cap_stale", "--folder", "capture"]).code).toBe(0);
      });

      test("removes it, leaves other namespaces alone, and a second run removes nothing", () => {
        const first = cli(["prune"]);
        expect(
          first.stdout
            .trim()
            .split("\n")
            .toSorted((a, b) => a.localeCompare(b)),
        ).toEqual(["cap_stale", "cap_x"]);
        expect(first.stdout + first.stderr).not.toContain("stale-value");
        expect(cli(["has", "cap_stale", "--folder", "capture"]).code).toBe(4);
        expect(cli(["has", "cap_used", "--folder", "capture"]).code).toBe(0);
        expect(cli(["has", "cap_stale", "--folder", "qsm"]).code).toBe(0);
        const second = cli(["prune"]);
        expect(second.code).toBe(0);
        expect(second.stdout.trim()).toBe("");
      });

      test("with no transcript to check refuses", () => {
        const empty = sandboxDir("qsm-secrets-vb-empty-");
        const refused = cli(["prune"], { env: { HOME: empty } });
        expect(refused.code).toBe(4);
        expect(refused.stderr).toContain("no transcript");
      });
    });

    describe("doctor", () => {
      test("Everything usable", () => {
        const run = cli(["doctor", "--json"]);
        const parsed = envelope(run);
        expect(parsed.code).toBe("ok");
        expect(parsed.data.ok).toBe(true);
        expect(parsed.data.checks).toHaveLength(flavor.checks[0]);
        expect(run.code).toBe(0);
      });

      test("One prerequisite missing", () => {
        const run = cli(["doctor", "--json"], { backend: false });
        const parsed = envelope(run);
        const checks = field(parsed.data, "checks", isChecks);
        // An absent prerequisite is `missing` (exit 4), the code every other
        // qsm doctor gives the same situation, not `failed`.
        expect(run.code).toBe(4);
        expect(parsed.code).toBe("missing");
        expect(parsed.data.ok).toBe(false);
        expect(checks).toHaveLength(flavor.checks[1]);
        expect(checks[0]?.ok).toBe(false);
        expect(checks[0]?.fix).toContain(flavor.name);
        expect(leaked(run)).toBeNull();
      });
    });

    describe("a backend that is not installed", () => {
      // An absent backend is an absent prerequisite, not work that ran and went wrong: every verb
      // that reaches it says `missing` (exit 4) and names the install step. `set` (needs a terminal)
      // and `get` (needs a caller-opened fd 3) refuse before the backend and have their own cases.
      const token = `ghp_${"aB3dE9".repeat(6)}`;
      const template = (): string => {
        const path = join(runtime, "template");
        writeFileSync(path, `x ${placeholderOf("qsm/github-token")}`);
        return path;
      };
      const absent: Record<string, () => { args: string[]; input: string }> = {
        has: () => ({ args: ["has", "github-token"], input: "" }),
        list: () => ({ args: ["list"], input: "" }),
        inspect: () => ({ args: ["inspect"], input: "" }),
        rm: () => ({ args: ["rm", "github-token"], input: "" }),
        rename: () => ({ args: ["rename", "github-token", "other"], input: "" }),
        prune: () => ({ args: ["prune"], input: "" }),
        pipe: () => ({ args: ["pipe", "github-token", "--", "cat"], input: "" }),
        env: () => ({ args: ["env", "github-token=V", "--", "true"], input: "" }),
        check: () => ({ args: ["check", "github-token=V", "--", "true"], input: "" }),
        "mask --id": () => ({ args: ["mask", "--id", "github-token"], input: "x" }),
        "mask --all": () => ({ args: ["mask", "--all"], input: "[]" }),
        scrub: () => ({ args: ["scrub", "s"], input: "" }),
        render: () => ({
          args: ["render", template(), "--out", "o", "--session", "s1"],
          input: "",
        }),
        capture: () => ({ args: ["capture"], input: `deploy-key=${token}` }),
      };
      for (const [verb, build] of Object.entries(absent)) {
        test(`${verb} reports missing, exit 4, and names the install step`, () => {
          const { args, input } = build();
          // No --json: pipe and env refuse it, and exit 4 is `missing` for every verb.
          const run = cli(args, { backend: false, input });
          expect(run.code).toBe(4);
          expect(run.stderr).toContain(flavor.absent[0]);
          expect(run.stderr).toContain(flavor.absent[1]);
        });
      }
    });

    describe("capture", () => {
      /** A token of a known shape, built here so no literal one sits in the file. */
      const token = `ghp_${"aB3dE9".repeat(6)}`;
      const capture = (text: string, options: { backend?: boolean } = {}): Run =>
        cli(["capture", "--json"], { input: text, backend: options.backend !== false });
      const textOf = (run: Run): string => field(envelope(run).data, "text", isString);

      test("a pasted name=value is stored under that name and shown as qsm/<name>", () => {
        const run = capture(`deploy-key=${token} for the release`);
        const captured = field(envelope(run).data, "captured", isCaptured);
        expect(run.code).toBe(0);
        expect(textOf(run)).toBe(
          `${placeholderOf("qsm/deploy-key")}…${token.slice(-4)} for the release`,
        );
        expect(captured.map((c) => c.id)).toEqual(["qsm/deploy-key"]);
        expect(readFileSync(file("qsm", "deploy-key"), "utf8")).toBe(token);
        expect(run.stdout).not.toContain(token);
      });

      test("a name already stored is not overwritten: the value gets a generated id and the name is reported", () => {
        const before = readdirSync(store).length;
        const run = capture(`github-token=${token}`);
        const taken = field(envelope(run).data, "taken", isStrings);
        expect(taken).toEqual(["github-token"]);
        expect(textOf(run)).toMatch(/^github-token=\{\{secret:cap_[0-9a-f]{12}\}\}…/);
        expect(readdirSync(store)).toHaveLength(before + 1);
        expect(readFileSync(file("qsm", "github-token"), "utf8")).toBe(VALUE);
      });

      test("a bare value keeps a generated id", () => {
        expect(textOf(capture(`here: ${token}`))).toMatch(/^here: \{\{secret:cap_/);
      });

      test("a path and a placeholder pass byte for byte, and need no backend", () => {
        const text = `/tmp/claude-1000/-home-qs_m4rk-Projects-FullStack-qsm-qsm-marketplace--claude-worktrees-rewrite/s/scratchpad and ${placeholderOf("cap_03c8872d7caa")}`;
        const run = capture(text, { backend: false });
        expect(run.code).toBe(0);
        expect(textOf(run)).toBe(text);
      });
    });

    describe("the capture index", () => {
      const token = `ghp_${"aB3dE9".repeat(6)}`;
      const other = `ghp_${"Zq7Wm2".repeat(6)}`;
      const indexFile = (): string => join(home, "data", "qsm-secrets", "captures.json");
      /** `capture --session s1 --cwd /p` of `text`; the id it stored. */
      const captured = (text: string): string => {
        const run = cli(["capture", "--session", "s1", "--cwd", "/p", "--json"], { input: text });
        const [first] = field(envelope(run).data, "captured", isCaptured);
        return first?.id ?? "";
      };
      const listed = (): unknown => envelope(cli(["captures", "--json"])).data.rows;
      const ids = (): string[] =>
        field({ rows: listed() }, "rows", isListedIds).map((row) => `${row.namespace}/${row.key}`);

      test("a capture writes its row with no byte of the value", () => {
        const id = captured(`here: ${token}`);
        const text = readFileSync(indexFile(), "utf8");
        expect(text).not.toContain(token);
        expect(text).not.toContain(token.slice(-4));
        expect(listed()).toMatchObject([
          { namespace: "capture", key: id, kind: "github-pat", session: "s1", cwd: "/p" },
        ]);
      });

      test("two captures started together both keep their row", async () => {
        const start = (text: string, session: string): Promise<number> =>
          Bun.spawn([process.execPath, CLI, "capture", "--session", session, "--json"], {
            env: childEnv(environment()),
            stdin: new TextEncoder().encode(text),
            stdout: "ignore",
            stderr: "ignore",
          }).exited;
        expect(await Promise.all([start(`a: ${token}`, "sa"), start(`b: ${other}`, "sb")])).toEqual(
          [0, 0],
        );
        expect(ids()).toHaveLength(2);
      });

      test("a row whose entry was removed outside the wrapper is dropped with a warning", () => {
        const id = captured(`here: ${token}`);
        rmSync(file("capture", id));
        const run = cli(["captures", "--json"]);
        expect(envelope(run).data.rows).toEqual([]);
        expect(run.stdout).toContain(`capture/${id} is no longer stored`);
        expect(readFileSync(indexFile(), "utf8")).not.toContain(id);
      });

      test("a listing that fails forgets no row", () => {
        const id = captured(`here: ${token}`);
        const run = cli(["captures", "--json"], { env: { FAKE_LIST_FAILS: "1" } });
        expect(run.code).not.toBe(0);
        expect(readFileSync(indexFile(), "utf8")).toContain(id);
        expect(ids()).toEqual([`capture/${id}`]);
      });

      test("an index that cannot be written fails the capture naming the file, and doctor flags it", () => {
        mkdirSync(join(home, "data", "qsm-secrets"), { recursive: true });
        writeFileSync(indexFile(), '{"x": 1}');
        const run = cli(["capture"], { input: `here: ${token}` });
        expect(run.code).not.toBe(0);
        expect(run.stderr).toContain("the capture index was not written");
        expect(run.stderr).toContain(indexFile());
        expect(run.stderr).toContain("qsm-secrets doctor");
        const doctor = cli(["doctor"]);
        expect(doctor.code).toBe(4);
        expect(doctor.stdout + doctor.stderr).toContain(
          `fail  capture index: ${indexFile()} is not a capture index`,
        );
      });

      test("rm whose index update fails still reports the removal, with a warning naming the index", () => {
        const id = captured(`here: ${token}`);
        writeFileSync(indexFile(), '{"x": 1}');
        const run = cli(["rm", id, "--folder", "capture", "--json"]);
        expect(envelope(run).code).toBe("ok");
        expect(run.stdout).toContain(`the capture index ${indexFile()} was not updated`);
        expect(existsSync(file("capture", id))).toBe(false);
      });

      test("rm and prune remove the row", () => {
        const removed = captured(`one: ${token}`);
        const pruned = captured(`two: ${other}`);
        expect(cli(["rm", removed, "--folder", "capture"]).code).toBe(0);
        expect(ids()).toEqual([`capture/${pruned}`]);
        expect(cli(["prune"]).code).toBe(0);
        expect(ids()).toEqual([]);
      });

      test("rename files the row under the new name, kind, session and cwd kept", () => {
        const id = captured(`here: ${token}`);
        expect(cli(["rename", id, "kept", "--folder", "capture"]).code).toBe(0);
        expect(listed()).toMatchObject([
          { namespace: "capture", key: "kept", kind: "github-pat", session: "s1", cwd: "/p" },
        ]);
      });

      test("set of a key the capture stored drops its row: the value is the person's now", () => {
        expect(captured(`deploy-key=${token}`)).toBe("qsm/deploy-key");
        expect(ids()).toEqual(["qsm/deploy-key"]);
        const run = terminal(`bun ${CLI} set deploy-key`, environment({ FAKE_TYPED: "typed-1" }));
        expect(run.code).toBe(0);
        expect(ids()).toEqual([]);
      });
    });
  });
}

// What only one backend can show. rbw rows carry a user, so an entry another tool stored is listed
// as `other`; libsecret prints attributes in hash-table order and holds multi-line values, so a
// value that looks like attributes must forge no entry and an entry of an older schema must fail.
describe("rbw: an entry another tool stored", () => {
  let bin = "";
  let store = "";

  beforeEach(() => {
    bin = sandboxDir("qsm-secrets-rbw-bin-");
    store = sandboxDir("qsm-secrets-rbw-store-");
    fakeBin(bin, "rbw", fakeRbw(store));
    writeFileSync(join(store, "qsm__github-token"), VALUE);
    writeFileSync(join(store, "qsm__legacy-key"), "legacy-value");
    writeFileSync(join(store, "qsm__legacy-key.user"), "alice");
  });

  test("is not listed as ours, and inspect shows it as stored by another", () => {
    const env = { QSM_SECRETS_BACKEND: "rbw", PATH: pathWith(bin) };
    expect(cliRun(["list"], env).stdout.trim()).toBe("github-token");
    const inspected = cliRun(["inspect"], env);
    expect(inspected.stdout).toContain("name: legacy-key");
    expect(inspected.stdout).toContain("stored-by: other");
    expect(leaked(inspected)).toBeNull();
  });

  test("rename --legacy finds nothing: rbw entries always have a folder", () => {
    const env = { QSM_SECRETS_BACKEND: "rbw", PATH: pathWith(bin) };
    expect(cliRun(["rename", "legacy-key", "x", "--legacy"], env).code).toBe(4);
  });
});

/** `search` stdout carries the secret line, so a value shaped like attribute lines is the trap. */
const TRAP = "line one\nattribute.key = forged\nattribute.namespace = forged-ns";

describe("libsecret: the shape of secret-tool's output", () => {
  let bin = "";
  let store = "";

  beforeEach(() => {
    bin = sandboxDir("qsm-secrets-ls-bin-");
    store = sandboxDir("qsm-secrets-ls-store-");
    fakeBin(bin, "busctl", "exit 0");
    fakeBin(bin, "secret-tool", fakeSecretTool(store));
    writeFileSync(join(store, "capture__cap_x"), "hunter2");
    writeFileSync(join(store, "capture__cap_trap"), TRAP);
    writeFileSync(join(store, "qsm__npm-token"), "npm-value");
  });

  const run = (args: string[], input?: string): Run =>
    cliRun(args, { QSM_SECRETS_BACKEND: "libsecret", PATH: pathWith(bin) }, input);

  test("a value holding attribute lines forges no entry and never prints", () => {
    expect(
      run(["list", "--folder", "capture"])
        .stdout.split("\n")
        .filter(Boolean)
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(["cap_trap", "cap_x"]);
    expect(run(["list", "--folder", "forged-ns"]).stdout.trim()).toBe("");
    const inspected = run(["inspect", "--folder", "capture"]);
    expect(inspected.stdout + inspected.stderr).not.toContain("forged");
    expect(inspected.stdout + inspected.stderr).not.toContain("hunter2");
  });

  test("mask --all masks a multi-line value as one", () => {
    const rows = ["tok=hunter2 and npm-value", TRAP];
    const masked = run(["mask", "--all", "--json"], JSON.stringify(rows));
    expect(masked.code).toBe(0);
    expect(envelope(masked).data.texts).toEqual([
      `tok=${placeholderOf("cap_x")} and ${placeholderOf("qsm/npm-token")}`,
      placeholderOf("cap_trap"),
    ]);
  });

  test("an entry of an older schema, with no namespace, fails loud and masks nothing", () => {
    const legacy = join(store, "none__OLD_TOKEN");
    writeFileSync(legacy, "old-value");
    try {
      const listed = run(["list", "--folder", "capture"]);
      expect(listed.code).not.toBe(0);
      expect(listed.stderr).toContain("has no namespace: OLD_TOKEN");
      expect(listed.stderr).toContain("qsm-secrets rename OLD_TOKEN <new> --legacy");
      expect(listed.stderr).not.toContain("secret-tool clear");
      expect(run(["mask", "--all"], JSON.stringify(["tok=hunter2"])).code).not.toBe(0);
    } finally {
      rmSync(legacy);
    }
  });

  describe("rename --legacy moves an entry that has no namespace", () => {
    const legacy = (key: string): string => join(store, `none__${key}`);

    test("into the default namespace, under the same or a new name, with the value intact", () => {
      writeFileSync(legacy("OLD_TOKEN"), "old-value");
      try {
        const done = run(["rename", "OLD_TOKEN", "OLD_TOKEN", "--legacy"]);
        expect(done.code).toBe(0);
        expect(done.stdout).toContain("renamed legacy/OLD_TOKEN to qsm/OLD_TOKEN");
        expect(done.stdout + done.stderr).not.toContain("old-value");
        expect(existsSync(legacy("OLD_TOKEN"))).toBe(false);
        expect(readFileSync(join(store, "qsm__OLD_TOKEN"), "utf8")).toBe("old-value");
        expect(run(["list", "--folder", "capture"]).code).toBe(0);
      } finally {
        rmSync(join(store, "qsm__OLD_TOKEN"), { force: true });
      }
    });

    test("with --to-folder and a new name", () => {
      writeFileSync(legacy("OLD_TOKEN"), "old-value");
      try {
        expect(run(["rename", "OLD_TOKEN", "fresh", "--legacy", "--to-folder", "work"]).code).toBe(
          0,
        );
        expect(readFileSync(join(store, "work__fresh"), "utf8")).toBe("old-value");
      } finally {
        rmSync(join(store, "work__fresh"), { force: true });
      }
    });

    test("is blocked when the name is also stored in a namespace, and changes nothing", () => {
      writeFileSync(legacy("npm-token"), "old-value");
      try {
        const blocked = run(["rename", "npm-token", "x", "--legacy"]);
        expect(blocked.code).toBe(5);
        expect(blocked.stderr).toContain("also stored in namespace qsm");
        expect(readFileSync(legacy("npm-token"), "utf8")).toBe("old-value");
        expect(readFileSync(join(store, "qsm__npm-token"), "utf8")).toBe("npm-value");
      } finally {
        rmSync(legacy("npm-token"), { force: true });
      }
    });

    test("with the same name, the value is never held only in the process", () => {
      writeFileSync(legacy("OLD_TOKEN"), "old-value");
      writeFileSync(join(store, "qsm__OLD_TOKEN.qsm-rename"), "leftover");
      try {
        const blocked = run(["rename", "OLD_TOKEN", "OLD_TOKEN", "--legacy"]);
        expect(blocked.code).toBe(5);
        expect(readFileSync(legacy("OLD_TOKEN"), "utf8")).toBe("old-value");
      } finally {
        rmSync(legacy("OLD_TOKEN"), { force: true });
        rmSync(join(store, "qsm__OLD_TOKEN.qsm-rename"), { force: true });
      }
    });

    test("a name that is not a legacy entry is missing, and --folder cannot join --legacy", () => {
      expect(run(["rename", "npm-token", "x", "--legacy"]).code).toBe(4);
      expect(run(["rename", "a", "b", "--legacy", "--folder", "qsm"]).code).toBe(2);
    });
  });
});

describe("guard", () => {
  const channel = (target: string): string => `3>${target}`;
  let data = "";
  let runtime = "";

  beforeEach(() => {
    data = sandboxDir("qsm-guard-data-");
    runtime = sandboxDir("qsm-guard-run-");
    mkdirSync(join(data, "keyrings"));
    writeFileSync(join(data, "keyrings", "login.keyring"), "x");
    symlinkSync(join(data, "keyrings", "login.keyring"), join(data, "harmless-name"));
  });

  /** The verdict on a command: its refusal code, or null when it may run. */
  function verdict(command: string): string | null {
    const result = cliRun(
      ["guard", "--json"],
      {
        HOME: "/home/guard",
        XDG_DATA_HOME: data,
        XDG_RUNTIME_DIR: runtime,
        PASSWORD_STORE_DIR: join(data, "pass"),
      },
      command,
    );
    const body = envelope(result);
    if (body.code === "blocked") {
      return isString(body.data.code) ? body.data.code : "?";
    }
    return body.code === "ok" ? null : body.code;
  }

  const keyrings = "$XDG_DATA_HOME/keyrings";
  const rendered = "$XDG_RUNTIME_DIR/qsm-secrets/s1/kubeconfig";
  const passStore = "$HOME/.password-store";

  test.each([
    ["rbw get github-token", "vault-reader"],
    ["bw get password x", "vault-reader"],
    ["pass show work/token", "vault-reader"],
    ["secret-tool lookup service qsm key token", "vault-reader"],
    ["secret-tool store --label x service qsm", "vault-reader"],
    ["sudo -u root rbw get x", "vault-reader"],
    ["env A=1 nice -n 5 timeout 5 rbw get x", "vault-reader"],
    ["command rbw get x", "vault-reader"],
    ["echo a | xargs -I{} rbw get {}", "vault-reader"],
    ["(cd /tmp && secret-tool lookup a b)", "vault-reader"],
    ["echo $(rbw get x)", "vault-reader"],
    ["bash -c 'echo hi; rbw get x'", "vault-reader"],
    ['sudo bash -c "nice rbw get x"', "vault-reader"],
    ["gopass show work/token", "vault-reader"],
    ["keepassxc-cli show db.kdbx entry", "vault-reader"],
    ["kwallet-query -r entry kdewallet", "vault-reader"],
    ["op read op://vault/item/field", "vault-reader"],
    ["secret-tool search --all service qsm", "vault-reader"],
    ["secret-tool clear service qsm key x", "vault-reader"],
    ["sudo -u root gopass show x", "vault-reader"],
    [`gpg -d ${passStore}/work/token.gpg`, "keyring-files"],
    ["gpg -d ~/.password-store/work/token.gpg", "keyring-files"],
    [`cat $PASSWORD_STORE_DIR/work/token.gpg`, "keyring-files"],
    [`gpg -d < ${passStore}/work/token.gpg`, "keyring-files"],
    [`cd ${passStore} && gpg -d work/token.gpg`, "keyring-files"],
    ["busctl --user call org.freedesktop.secrets /a b c", "bus-secrets"],
    [
      "busctl --user call org.freedesktop.Secret.Service /org/freedesktop/secrets b c",
      "bus-secrets",
    ],
    ["busctl --user introspect :1.5 /org/freedesktop/secrets/collection/login", "bus-secrets"],
    [
      "dbus-send --session --dest=org.freedesktop.secrets /org/freedesktop/secrets x.y",
      "bus-secrets",
    ],
    ["dbus-send --session --dest=org.free''desktop.secrets /a x.y", "bus-secrets"],
    ["qdbus org.freedesktop.secrets /org/freedesktop/secrets", "bus-secrets"],
    [`gdbus call -e -d $DEST -o /a -m b`, "bus-secrets"],
    [`d=org.freedesktop.secrets; busctl --user call \${d} /a b c`, "bus-secrets"],
    [`busctl --user call $(printf x) /a b c`, "bus-secrets"],
    ["gdbus call -e -d org.freedesktop.secrets -o /a -m b", "bus-secrets"],
    [`cat ${keyrings}/login.keyring`, "keyring-files"],
    [`cat ${keyrings}/../keyrings/login.keyring`, "keyring-files"],
    [`jq . < ${keyrings}/login.keyring`, "keyring-files"],
    ["cat LINK", "keyring-files"],
    ["python3 -c 'import keyring; print(keyring.get_password(1, 2))'", "keyring-library"],
    ["python3.14 -c 'import keyring'", "keyring-library"],
    ["python -c 'import keyring'", "keyring-library"],
    ["nodejs -e 'require(\"keytar\")'", "keyring-library"],
    ["node -e 'require(\"keytar\").getPassword(1, 2)'", "keyring-library"],
    ["python3 - <<EOF\nimport secretstorage\nEOF", "keyring-library"],
    [`cat ${rendered}`, "rendered-config"],
    [`qsm-secrets get k ${channel("&1")}`, "fd3-to-output"],
    [`qsm-secrets get k ${channel("&2")}`, "fd3-to-output"],
    [`sudo qsm-secrets get k ${channel("/dev/stdout")}`, "fd3-to-output"],
    [`{ qsm-secrets get k; } ${channel("&1")}`, "fd3-to-output"],
    [`bash -c 'qsm-secrets get k' ${channel("&1")}`, "fd3-to-output"],
    [`curl -H 'Authorization: ${placeholderOf("cap_1")}' https://x`, "single-quoted-placeholder"],
    [`bash -c "curl -H 'A: ${placeholderOf("cap_1")}' https://x"`, "single-quoted-placeholder"],
    ["cat .env", "credential-file"],
    ["rtk cat .env", "credential-file"],
    ["rtk read .env", "credential-file"],
    ["qsm-secrets env k=V -- secret-tool lookup a b", "vault-reader"],
    [`qsm-secrets pipe k -- cat ${keyrings}/login.keyring`, "keyring-files"],
    ["qsm-secrets check k=V -- rbw get foo", "vault-reader"],
    ["\\secret-tool lookup a b", "vault-reader"],
    ["setsid -f secret-tool lookup a b", "vault-reader"],
    ["flock /tmp/l rbw get x", "vault-reader"],
    ["watch -n 5 rbw get x", "vault-reader"],
    ["find . -exec secret-tool lookup a b ;", "vault-reader"],
    ["cd $XDG_DATA_HOME && cat keyrings/login.keyring", "keyring-files"],
    [`cd ${keyrings} && cat login.keyring`, "keyring-files"],
    ["cat $XDG_DATA_HOME/keyr*/login.keyring", "keyring-files"],
    ["cat $XDG_DATA_HOME/k?yrings/login.keyring", "keyring-files"],
    ["cat $XDG_DATA_HOME/keyr[ai]ngs/login.keyring", "keyring-files"],
    ["cat $XDG_DATA_HOME/keyr[a-z]ngs/login.keyring", "keyring-files"],
    [`cat \${XDG_DATA_HOME}/keyrings/login.keyring`, "keyring-files"],
    [`cat "\${XDG_DATA_HOME}/keyrings/login.keyring"`, "keyring-files"],
    [`cat \${HOME}/.password-store/work/token.gpg`, "keyring-files"],
    [`cat \${PASSWORD_STORE_DIR}/work/token.gpg`, "keyring-files"],
    [`cat \${XDG_RUNTIME_DIR}/qsm-secrets/s1/kubeconfig`, "rendered-config"],
    [`bash -c 'cat \${XDG_DATA_HOME}/keyrings/login.keyring'`, "keyring-files"],
    [`cat \${XDG_DATA_HOME:-/x}/keyrings/login.keyring`, "unreadable-command"],
    [`cat \${HOME#/}/.password-store/x`, "unreadable-command"],
    [`cat \${XDG_RUNTIME_DIR:+/r}/qsm-secrets/s1/kubeconfig`, "unreadable-command"],
    [`cat \${PASSWORD_STORE_DIR-/p}/x`, "unreadable-command"],
    ["qs ipc -p /x call askpass show '{}'", "askpass-pane"],
    ["env A=1 quickshell ipc call askpass dismiss n", "askpass-pane"],
    ["bash -c 'qs -p /x ipc call askpass show {}'", "askpass-pane"],
    ['qsm-askpass-sudo "[sudo] password: "', "askpass-pane"],
    ["env A=1 ~/.local/bin/qsm-askpass-decide", "askpass-pane"],
    ['qsm-secrets askpass sudo -- "[sudo] password: "', "askpass-pane"],
    ["qsm-secrets --folder x askpass sudo -- x", "askpass-pane"],
    ["qsm-secrets askpass --folder x sudo -- x", "askpass-pane"],
    ["qsm-secrets askpass --folder=x --kind=git", "askpass-pane"],
    ["qsm-secrets askpass -- sudo x", "askpass-pane"],
    ["qsm-secrets -- askpass sudo x", "askpass-pane"],
    ["sudo qsm-secrets askpass ssh -- Passphrase:", "askpass-pane"],
    ["qs ipc -p /x call ask$(echo pass) request x", "askpass-pane"],
    [`nc -U $XDG_RUNTIME_DIR/qsm-askpass/abc/reply.sock`, "askpass-pane"],
    [`ls $XDG_RUNTIME_DIR/qsm-askpass`, "askpass-pane"],
  ])("%s is refused as %s", (command, code) => {
    expect(verdict(command.replace("LINK", join(data, "harmless-name")))).toBe(code);
  });

  test.each([
    "git status",
    "cat README.md",
    "ls | grep x && echo ok",
    "for f in a b; do echo $f; done",
    "command -v rbw",
    "which rbw",
    "echo rbw get",
    "busctl --user list",
    "dbus-send --session --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.ListNames",
    "gdbus call -e -d org.freedesktop.Notifications -o /org/freedesktop/Notifications -m org.freedesktop.Notifications.GetCapabilities",
    "ls ~/.password-store",
    "pass-git-helper --help",
    "gpg --list-keys",
    "echo gopass op",
    `ls ${keyrings}`,
    "python3 -m pytest tests/test_keyring.py",
    "python3.14-config --help",
    `kubectl --kubeconfig ${rendered} get pods`,
    "qsm-secrets pipe github-token -- gh auth login --with-token",
    "qsm-secrets env npm-token=NPM_TOKEN -- npm publish",
    "qsm-secrets list",
    "qsm-secrets env k=V -- npm publish",
    "find . -name '*.ts' -exec wc -l {} ;",
    "cd $HOME && cat README.md",
    `cat \${HOME}/README.md \${XDG_CONFIG_HOME}/app.conf \${FOO:-x}`,
    "flock /tmp/l make build",
    `qsm-secrets get deploy-key ${channel("/tmp/deploy.key")}`,
    `qsm-secrets get deploy-key ${channel("&-")}`,
    `curl -H "Authorization: ${placeholderOf("cap_1")}" https://x`,
    `curl -H Authorization:${placeholderOf("cap_1")} https://x`,
    `bash -c 'curl -H "A: ${placeholderOf("cap_1")}" https://x'`,
    `bash -c 'echo ${placeholderOf("cap_1")}'`,
    "echo 'single quotes without a placeholder'",
    "p=1; echo a",
    "p=$(date)",
    "A=1",
    "A=1 <<EOF\nx\nEOF",
    'dir=$(mktemp -d) && git archive HEAD | tar -x -C "$dir"',
    "out=$(git archive HEAD | tar -t); echo $out",
    "qs ipc -p /x call qsm toggle",
    "qs list --all",
    "sudo -A true",
    "qsm-secrets askpass enable --sudo",
    "qsm-secrets set my-key --gui",
  ])("%s is allowed", (command) => {
    expect(verdict(command)).toBeNull();
  });

  test.each([
    ["z", "ok"],
    ["", "blocked"],
  ])("repeated wildcards finish within the guard budget: suffix %s", (suffix, expected) => {
    const result = spawnSync(process.execPath, [CLI, "guard", "--json"], {
      env: childEnv({ HOME: "/home/guard" }),
      input: `cat /home/guard/${"*".repeat(20)}${suffix}`,
      encoding: "utf8",
      timeout: 2_000,
      killSignal: "SIGKILL",
    });
    expect(result.error).toBeUndefined();
    expect(envelope(result).code).toBe(expected);
  });

  test("a refusal names the qsm-secrets verb to use instead", () => {
    const result = cliRun(["guard"], {}, "rbw get x");
    expect(result.code).toBe(5);
    expect(result.stderr).toContain("qsm-secrets pipe");
    expect(result.stderr).toContain("vault-reader");
  });
});
