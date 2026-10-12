// The CLI end to end, against a fake backend the test writes into a
// sandbox and puts first on PATH. Nothing here touches a real vault.
//
// The fixture value is engineered on purpose: several lines, one shaped
// like this wrapper's own metadata output and one shaped like a backend
// row. Every browsing verb is then asserted never to print any of its
// lines, which is the discipline the whole plugin exists to keep.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "cli.ts");

/** Lines chosen to survive a naive filter: one looks like a metadata
 * field, one looks like a tab-separated backend row. */
const VALUE = [
  "gh0st-line-one",
  "name: forged-entry",
  "forged-row\tqsm\tqsm-secrets",
  "stored-by: qsm-secrets",
].join("\n");

const VALUE_MARKERS = ["gh0st-line-one", "forged-entry", "forged-row"];

let sandbox = "";
/** A directory with nothing in it, so the no-backend case runs against a
 * PATH that provably cannot resolve the backend. */
let emptyDir = "";
let removedMarker = "";
let addedMarker = "";

const ROWS = [
  "github-token\tqsm\tqsm-secrets",
  "npm-token\tqsm\tqsm-secrets",
  "legacy-key\tqsm\talice",
  "work-token\twork\tqsm-secrets",
  // A name carrying a tab forges an extra column; the parser drops the row.
  "ev\til\tqsm\tqsm-secrets",
].join("\n");

function writeScript(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), "qsm-secrets-"));
  emptyDir = mkdtempSync(join(tmpdir(), "qsm-secrets-empty-"));
  removedMarker = join(sandbox, "removed");
  addedMarker = join(sandbox, "added");
  writeScript(
    join(sandbox, "rbw"),
    `#!/bin/sh
verb="$1"; shift
folder=""
name=""
while [ $# -gt 0 ]; do
  case "$1" in
    --folder) folder="$2"; shift 2 ;;
    --fields) shift 2 ;;
    *) if [ -z "$name" ]; then name="$1"; fi; shift ;;
  esac
done
removed='${removedMarker}'
case "$verb" in
  list)
    printf '%b\\n' '${ROWS.replaceAll("\t", "\\t")}' | while IFS= read -r row; do
      rowname=$(printf '%s' "$row" | cut -f1)
      if [ -f "$removed" ] && grep -qxF "$rowname" "$removed"; then
        continue
      fi
      printf '%s\\n' "$row"
    done ;;
  unlocked) exit 0 ;;
  config) printf '{"email": "someone@example.test"}\\n' ;;
  add) printf '%s\\n' "$name" >> '${addedMarker}' ;;
  get)
    case "$folder/$name" in
      qsm/github-token|qsm/legacy-key|work/work-token|/github-token|qsm/new-key)
        printf '%b\\n' '${VALUE.replaceAll("\t", "\\t").replaceAll("\n", "\\n")}' ;;
      qsm/empty-key) printf '\\n' ;;
      *) echo "couldn't find entry for '$name'" >&2; exit 1 ;;
    esac ;;
  remove)
    case "$folder/$name" in
      qsm/github-token|qsm/empty-key) printf '%s\\n' "$name" >> "$removed" ;;
      *) echo "couldn't find entry for '$name'" >&2; exit 1 ;;
    esac ;;
  *) exit 1 ;;
esac
`,
  );
});

afterAll(() => {
  for (const directory of [sandbox, emptyDir]) {
    if (directory !== "") {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

interface Run {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** With the backend: the sandbox first. Without it: a PATH that holds the
 * empty directory and the runtime's own directory and nothing else, so no
 * backend installed on the machine running these tests can answer. */
function pathWith(backend: boolean): string {
  return backend
    ? `${sandbox}:${process.env.PATH ?? ""}`
    : `${emptyDir}:${dirname(process.execPath)}`;
}

/** EDITOR is pinned rather than inherited: the doctor's editor check reads
 * it, and a test that passes only in a shell that happens to set it is not
 * proof of anything. */
const FIXED_ENV = { QSM_SECRETS_FOLDER: "qsm", QSM_SECRETS_BACKEND: "rbw", EDITOR: "true" };

/** One child with the pinned environment; `env` adds to it or overrides it. */
function spawned(command: string, args: string[], env: Record<string, string> = {}): Run {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, ...FIXED_ENV, PATH: pathWith(true), ...env },
  });
  return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

function cli(
  args: string[],
  options: { backend?: boolean; env?: Record<string, string> } = {},
): Run {
  return spawned("bun", [CLI, ...args], {
    PATH: pathWith(options.backend !== false),
    ...options.env,
  });
}

/** A real terminal, for the one verb that requires one. `script` runs the
 * command under a pty and exits with the command's own status; both
 * streams come back merged, exactly as a person at a keyboard sees them. */
function terminal(command: string): Run {
  return spawned("script", ["-qec", command, "/dev/null"]);
}

/** For the two cases that need a real shell: a file descriptor the caller
 * opens, and one the caller leaves closed. */
function shell(script: string): Run {
  return spawned("sh", ["-c", script], { CLI });
}

/** The first line of the fixture value found in either stream, or null.
 * A value, not an assertion, so a failure names the line that escaped. */
function leaked(run: Run): string | null {
  return (
    VALUE_MARKERS.find((marker) => run.stdout.includes(marker) || run.stderr.includes(marker)) ??
    null
  );
}

/** The one JSON value the shared base prints on stdout under --json. */
function envelope(run: Run): { code: string; exit: number; data: Record<string, unknown> } {
  return JSON.parse(run.stdout) as {
    code: string;
    exit: number;
    data: Record<string, unknown>;
  };
}

describe("the shared CLI base", () => {
  test("--help lists every verb qsm.json declares", () => {
    const run = cli(["--help"]);
    expect(run.code).toBe(0);
    for (const verb of ["pipe", "env", "set", "has", "list", "inspect", "rm", "get", "doctor"]) {
      expect(run.stdout).toContain(`  ${verb}`);
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
});

describe("list", () => {
  test("Listing keys this wrapper stored", () => {
    const run = cli(["list"]);
    expect(run.code).toBe(0);
    expect(run.stdout.trim().split("\n")).toEqual(["github-token", "npm-token"]);
    expect(leaked(run)).toBeNull();
  });

  test("a name carrying a tab is dropped rather than forging a row", () => {
    expect(cli(["list"]).stdout).not.toContain("ev");
  });

  test("--json carries the same names inside the envelope", () => {
    const run = cli(["list", "--json"]);
    expect(envelope(run)).toMatchObject({
      code: "ok",
      data: { namespace: "qsm", keys: ["github-token", "npm-token"] },
    });
    expect(leaked(run)).toBeNull();
  });
});

describe("inspect", () => {
  test("Inspecting every entry in a namespace", () => {
    const run = cli(["inspect"]);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("name: legacy-key");
    expect(run.stdout).toContain("stored-by: other");
    expect(run.stdout).not.toContain("work-token");
    expect(leaked(run)).toBeNull();
  });

  test("--json is metadata only too", () => {
    const run = cli(["inspect", "--json"]);
    const entries = envelope(run).data.entries as { name: string }[];
    expect(entries.map((entry) => entry.name)).toEqual(["github-token", "legacy-key", "npm-token"]);
    expect(leaked(run)).toBeNull();
  });
});

describe("namespace selection", () => {
  test("Reading from a named alternate namespace", () => {
    expect(cli(["has", "work-token", "--folder", "work"]).code).toBe(0);
    expect(cli(["has", "work-token"]).code).toBe(4);
    expect(cli(["list", "--folder", "work"]).stdout.trim()).toBe("work-token");
  });
});

describe("rm", () => {
  test("Removing a stored key", () => {
    try {
      const run = cli(["rm", "github-token"]);
      expect(run.code).toBe(0);
      expect(run.stdout).toContain("removed github-token");
      expect(readFileSync(removedMarker, "utf8").trim()).toBe("github-token");
      expect(leaked(run)).toBeNull();
      // The second half of the scenario: gone, not merely reported gone.
      expect(cli(["has", "github-token"]).code).toBe(4);
      expect(cli(["list"]).stdout).not.toContain("github-token");
    } finally {
      // The fixture is shared, and the verbs below this one need the key
      // back. The removal marker is the whole of the backend's state.
      rmSync(removedMarker, { force: true });
    }
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
    const seen = join(sandbox, "piped");
    const run = cli(["pipe", "github-token", "--", "sh", "-c", `cat > '${seen}'; echo consumed`]);
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
    const seen = join(sandbox, "never");
    const run = cli(["pipe", "nope", "--", "sh", "-c", `echo ran > '${seen}'`]);
    expect(run.code).toBe(4);
    expect(run.stderr).toContain("not stored: nope");
    expect(() => readFileSync(seen, "utf8")).toThrow();
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
    const seen = join(sandbox, "envvar");
    const run = cli([
      "env",
      "github-token=TARGET_TOKEN",
      "--",
      "sh",
      "-c",
      `printf %s "$TARGET_TOKEN" > '${seen}'`,
    ]);
    expect(run.code).toBe(0);
    expect(readFileSync(seen, "utf8")).toBe(VALUE);
    expect(leaked(run)).toBeNull();
  });

  test("Key not stored for the environment delivery", () => {
    const seen = join(sandbox, "env-never");
    const run = cli(["env", "nope=TARGET_TOKEN", "--", "sh", "-c", `echo ran > '${seen}'`]);
    expect(run.code).toBe(4);
    expect(() => readFileSync(seen, "utf8")).toThrow();
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
    const target = join(sandbox, "fd3");
    const run = shell(`bun "$CLI" get github-token 3>'${target}'`);
    expect(run.code).toBe(0);
    expect(run.stdout).toBe("");
    expect(readFileSync(target, "utf8")).toBe(VALUE);
  });

  test("Machine output asked of a verb that carries a value", () => {
    const target = join(sandbox, "fd3-json");
    const run = shell(`bun "$CLI" get github-token --json 3>'${target}'`);
    expect(run.code).toBe(5);
    expect(readFileSync(target, "utf8")).toBe("");
    expect(leaked(run)).toBeNull();
  });
});

describe("set", () => {
  test("refuses without a terminal, so a value cannot arrive from a script", () => {
    const run = cli(["set", "new-key"]);
    expect(run.code).toBe(4);
    expect(run.stderr).toContain("needs a terminal");
  });

  test("Storing a new key", () => {
    const run = terminal(`bun ${CLI} set new-key`);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("stored new-key");
    expect(readFileSync(addedMarker, "utf8")).toContain("new-key");
    expect(leaked(run)).toBeNull();
  });

  test("Prompt dismissed without a value", () => {
    const run = terminal(`bun ${CLI} set empty-key`);
    expect(run.code).toBe(1);
    expect(run.stdout).toContain("came back empty");
    expect(readFileSync(removedMarker, "utf8")).toContain("empty-key");
  });
});

describe("doctor", () => {
  test("Everything usable", () => {
    const run = cli(["doctor", "--json"]);
    const parsed = envelope(run);
    expect(parsed.code).toBe("ok");
    expect(parsed.data.ok).toBe(true);
    expect(parsed.data.checks).toHaveLength(5);
    expect(run.code).toBe(0);
  });

  test("One prerequisite missing", () => {
    const run = cli(["doctor", "--json"], { backend: false });
    const parsed = envelope(run);
    const checks = parsed.data.checks as { name: string; ok: boolean; fix: string | null }[];
    // An absent prerequisite is `missing` (exit 4), the code every other
    // qsm doctor gives the same situation — not `failed`.
    expect(run.code).toBe(4);
    expect(parsed.code).toBe("missing");
    expect(parsed.data.ok).toBe(false);
    expect(checks).toHaveLength(5);
    expect(checks[0]?.ok).toBe(false);
    expect(checks[0]?.fix).toContain("rbw");
    for (const check of checks) {
      expect(check.name.length).toBeGreaterThan(0);
    }
    expect(leaked(run)).toBeNull();
  });
});

describe("a backend that is not installed", () => {
  // The backend off PATH is an absent prerequisite, not work that ran and
  // went wrong: every metadata verb says `missing` (exit 4) and names the
  // install step. These three verbs reach the backend through lib/, so
  // their handler has to let a SecretError's own code through.
  for (const args of [["has", "github-token"], ["list"], ["inspect"]]) {
    test(`${args[0]} reports missing, exit 4, and names the install step`, () => {
      const run = cli([...args, "--json"], { backend: false });
      expect(run.code).toBe(4);
      const parsed = envelope(run) as unknown as { code: string; message: string };
      expect(parsed.code).toBe("missing");
      expect(parsed.message).toContain("rbw is not on PATH");
      expect(parsed.message).toContain("cargo install rbw");
    });
  }
});

describe("output discipline", () => {
  test("no verb but pipe, env and get ever prints a value", () => {
    for (const args of [
      ["list"],
      ["list", "--json"],
      ["inspect"],
      ["inspect", "--json"],
      ["has", "github-token"],
      ["has", "nope"],
      ["rm", "nope"],
      ["doctor"],
      ["set", "github-token"],
      ["get", "github-token"],
    ]) {
      expect(leaked(cli(args))).toBeNull();
    }
  });
});

describe("clean without a runtime directory", () => {
  test("is ok and removes nothing: render could not have written anywhere", () => {
    const run = cli(["clean", "--session", "s1", "--json"], { env: { XDG_RUNTIME_DIR: "" } });
    expect(run.code).toBe(0);
    expect(JSON.parse(run.stdout).data).toEqual({ dir: null });
  });
});

/** A secret-tool whose search prints the secret line on stdout and the attributes on stderr. */
const TRAP = "line one\nattribute.key = forged\nattribute.namespace = forged-ns";

function fakeSecretTool(store: string): string {
  return `#!/bin/sh
store='${store}'
verb="$1"; shift
case "$verb" in
  search)
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
    while [ $# -gt 0 ]; do
      case "$1" in namespace) ns="$2" ;; key) key="$2" ;; esac; shift
    done
    [ -f "$store/\${ns}__\${key}" ] && cat "$store/\${ns}__\${key}" || exit 1 ;;
  *) exit 1 ;;
esac
`;
}

/** `mask --all` against the fake secret-tool in `bin`. */
function maskAll(bin: string, rows: string[]): SpawnSyncReturns<string> {
  return spawnSync("bun", [CLI, "mask", "--all", "--json"], {
    encoding: "utf8",
    input: JSON.stringify(rows),
    env: {
      ...process.env,
      ...FIXED_ENV,
      QSM_SECRETS_BACKEND: "libsecret",
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    },
  });
}

/** A bus that always answers, a secret-tool over `store`, and three stored entries. */
function seedFakeSecretService(bin: string, store: string): void {
  writeScript(join(bin, "busctl"), "#!/bin/sh\nexit 0\n");
  writeScript(join(bin, "secret-tool"), fakeSecretTool(store));
  writeFileSync(join(store, "capture__cap_x"), "hunter2");
  writeFileSync(join(store, "capture__cap_trap"), TRAP);
  writeFileSync(join(store, "qsm__npm-token"), "npm-value");
}

// The libsecret backend against a fake secret-tool shaped like the real one: `search` prints the
// `secret =` line on stdout and the attributes on stderr, in a different order per item.
describe("the libsecret backend", () => {
  let bin = "";
  let store = "";

  beforeAll(() => {
    bin = mkdtempSync(join(tmpdir(), "qsm-secrets-ls-bin-"));
    store = mkdtempSync(join(tmpdir(), "qsm-secrets-ls-store-"));
    seedFakeSecretService(bin, store);
  });

  afterAll(() => {
    rmSync(bin, { recursive: true, force: true });
    rmSync(store, { recursive: true, force: true });
  });

  const run = (args: string[]): Run =>
    spawned("bun", [CLI, ...args], {
      QSM_SECRETS_BACKEND: "libsecret",
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    });

  test("list names the keys of a namespace whatever order the attributes print in", () => {
    const listed = run(["list", "--folder", "capture"]);
    expect(listed.code).toBe(0);
    expect(listed.stdout.split("\n").filter(Boolean).sort()).toEqual(["cap_trap", "cap_x"]);
    expect(run(["list", "--folder", "qsm"]).stdout.trim()).toBe("npm-token");
  });

  test("a value holding attribute lines forges no entry and never prints", () => {
    const listed = run(["list", "--folder", "forged-ns"]);
    expect(listed.stdout.trim()).toBe("");
    const inspected = run(["inspect", "--folder", "capture"]);
    expect(inspected.stdout + inspected.stderr).not.toContain("forged");
    expect(inspected.stdout + inspected.stderr).not.toContain("hunter2");
  });

  test("has finds a stored key and reports a missing one", () => {
    expect(run(["has", "cap_x", "--folder", "capture"]).code).toBe(0);
    expect(run(["has", "nope", "--folder", "capture"]).code).toBe(4);
  });

  test("env delivers the stored value to the consumer", () => {
    const delivered = run(["env", "cap_x=V", "--folder", "capture", "--", "printenv", "V"]);
    expect(delivered.code).toBe(0);
    expect(delivered.stdout.trim()).toBe("hunter2");
  });

  test("mask --all masks every stored value of every namespace in each string", () => {
    const rows = ["tok=hunter2 and npm-value", "nothing here", TRAP, ""];
    const masked = maskAll(bin, rows);
    expect(masked.status).toBe(0);
    const done = envelope({ code: 0, stdout: masked.stdout, stderr: masked.stderr });
    expect(done.data.texts).toEqual([
      "tok={{secret:cap_x}} and {{secret:qsm/npm-token}}",
      "nothing here",
      "{{secret:cap_trap}}",
      "",
    ]);
  });

  test("an entry of an older schema, with no namespace, fails loud and masks nothing", () => {
    const legacy = join(store, "none__OLD_TOKEN");
    writeFileSync(legacy, "old-value");
    try {
      const listed = run(["list", "--folder", "capture"]);
      expect(listed.code).not.toBe(0);
      expect(listed.stderr).toContain("has no namespace: OLD_TOKEN");
      expect(maskAll(bin, ["tok=hunter2"]).status).not.toBe(0);
    } finally {
      rmSync(legacy);
    }
  });
});

describe("capture", () => {
  /** A token of a known shape, built here so no literal one sits in the file. */
  const token = `ghp_${"aB3dE9".repeat(6)}`;
  const placeholder = (id: string): string => `{{${"secret"}:${id}}}`;

  function capture(text: string, options: { backend?: boolean } = {}): Run {
    const result = spawnSync("bun", [CLI, "capture", "--json"], {
      encoding: "utf8",
      input: text,
      env: {
        ...process.env,
        ...FIXED_ENV,
        PATH: pathWith(options.backend !== false),
      },
    });
    return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
  }

  const added = (): string[] => readFileSync(addedMarker, "utf8").trim().split("\n");
  const textOf = (run: Run): string => (envelope(run).data as { text: string }).text;

  test("a pasted name=value is stored under that name and shown as qsm/<name>", () => {
    const run = capture(`deploy-key=${token} for the release`);
    const data = envelope(run).data as { captured: { id: string }[] };
    expect(run.code).toBe(0);
    expect(textOf(run)).toBe(`${placeholder("qsm/deploy-key")}…${token.slice(-4)} for the release`);
    expect(data.captured.map((c) => c.id)).toEqual(["qsm/deploy-key"]);
    expect(added()).toContain("deploy-key");
    expect(run.stdout).not.toContain(token);
  });

  test("a name already stored is not overwritten: the value gets a generated id and the name is reported", () => {
    const before = added().length;
    const run = capture(`github-token=${token}`);
    const data = envelope(run).data as { taken: string[] };
    expect(data.taken).toEqual(["github-token"]);
    expect(textOf(run)).toMatch(/^github-token=\{\{secret:cap_[0-9a-f]{12}\}\}…/);
    expect(added().slice(before)).toHaveLength(1);
    expect(added()).not.toContain("github-token");
  });

  test("a bare value keeps a generated id", () => {
    expect(textOf(capture(`here: ${token}`))).toMatch(/^here: \{\{secret:cap_/);
  });

  test("a path and a placeholder pass byte for byte, and need no backend", () => {
    const text = `/tmp/claude-1000/-home-qs_m4rk-Projects-FullStack-qsm-qsm-marketplace--claude-worktrees-rewrite/s/scratchpad and ${placeholder("cap_03c8872d7caa")}`;
    const run = capture(text, { backend: false });
    expect(run.code).toBe(0);
    expect(textOf(run)).toBe(text);
  });
});
