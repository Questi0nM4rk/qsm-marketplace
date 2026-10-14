// `qsm-builder lens` through its real surface: the binary serves a marketplace, a page is
// fetched, a file changes and the event stream says so.
import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sleep, spawn, spawnSync, which } from "bun";
import { isRecord } from "../../../../lib/outcome.ts";
import { listOf } from "../guards.ts";
import { sandboxDir, writeIn as write } from "../../../../lib/fixtures/sandbox.ts";
import { type Issue, issuesOf } from "./tasks.ts";

const CLI = resolve(import.meta.dir, "../../scripts/cli.ts");

function marketplace(): string {
  const root = sandboxDir("qsm-builder-serve-");
  write(
    root,
    ".claude-plugin/marketplace.json",
    JSON.stringify({ name: "fix", plugins: [{ name: "qsm-a", source: "./plugins/qsm-a" }] }),
  );
  write(root, "plugins/qsm-a/.claude-plugin/plugin.json", '{"name":"qsm-a"}');
  write(
    root,
    "plugins/qsm-a/README.md",
    "# qsm-a\n\n## Why it exists\n\nA exists. It refuses more.\n",
  );
  write(
    root,
    "plugins/qsm-a/skills/one/SKILL.md",
    '---\nname: one\ndescription: "Use when x."\n---\n\nOpening words about zork and nothing else.\n',
  );
  write(root, "plugins/qsm-builder/references.txt", "# the list\nother\n");
  return root;
}

const running: { stop: () => Promise<void> }[] = [];
afterEach(async () => {
  for (const s of running.splice(0)) {
    await s.stop();
  }
});

/** Starts the binary and waits for the line that names its URL. */
async function start(root: string): Promise<string> {
  const proc = spawn(["bun", CLI, "lens", root, "--port", "0"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  running.push({
    stop: async () => {
      proc.kill("SIGINT");
      await proc.exited;
    },
  });
  const reader = proc.stderr.getReader();
  let text = "";
  for (let n = 0; n < 50 && !/http:\/\/127\.0\.0\.1:\d+\//.test(text); n += 1) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    text += new TextDecoder().decode(value);
  }
  const url = /http:\/\/127\.0\.0\.1:\d+\//.exec(text)?.[0];
  if (url === undefined) {
    throw new Error(`the server did not announce a URL: ${text}`);
  }
  return url;
}

function streamOf(res: Response): ReadableStream<Uint8Array> {
  if (res.body === null) {
    throw new Error("the response has no body");
  }
  return res.body;
}

/** What the event stream said up to the first `data:` line after `trigger` ran. */
async function nextEvent(url: string, trigger: () => void): Promise<string> {
  const res = await fetch(`${url}events`);
  const reader = streamOf(res).getReader();
  let seen = "";
  const first = await reader.read();
  seen += new TextDecoder().decode(first.value);
  trigger();
  const deadline = Date.now() + 5000;
  while (!seen.includes("data:") && Date.now() < deadline) {
    const { value, done } = await Promise.race([
      reader.read(),
      sleep(5000).then(() => ({ value: undefined, done: true })),
    ]);
    if (done) {
      break;
    }
    seen += new TextDecoder().decode(value);
  }
  await reader.cancel();
  return seen;
}

test("a name added to references.txt while the page is open shows in the graph, no restart", async () => {
  const root = marketplace();
  const url = await start(root);
  const before = await (await fetch(url)).text();
  expect(before).toContain("<title>fix marketplace lens</title>");
  expect(before).not.toContain(">zork</text>");
  const said = await nextEvent(url, () => {
    appendFileSync(join(root, "plugins/qsm-builder/references.txt"), "zork\n");
  });
  expect(said).toContain("data: change");
  const after = await (await fetch(url)).text();
  expect(after).toContain(">zork</text>");
});

test("generated and ignored files never wake the page", async () => {
  const root = marketplace();
  write(root, "plugins/qsm-a/evals/.keep", "");
  const url = await start(root);
  const res = await fetch(`${url}events`);
  const reader = streamOf(res).getReader();
  await reader.read();
  write(root, ".qsm/lens.html", "x");
  write(root, "plugins/qsm-a/evals/results/run/aggregate-result.json", "{}");
  const got = await Promise.race([reader.read(), sleep(700).then(() => "quiet" as const)]);
  await reader.cancel();
  expect(got).toBe("quiet");
});

test("a taken port is failed, names the port and suggests --port", async () => {
  const root = marketplace();
  const url = await start(root);
  const { port } = new URL(url);
  const r = spawnSync(["bun", CLI, "lens", root, "--port", port]);
  expect(r.exitCode).toBe(1);
  const err = r.stderr.toString();
  expect(err).toContain(`port ${port} is taken`);
  expect(err).toContain("--port");
});

/** The tasks the task tool holds in `root`, newest first. */
function tasksIn(root: string): Issue[] {
  return issuesOf(spawnSync(["br", "list", "--json"], { cwd: root }).stdout.toString());
}

/** A text field of a JSON body, or a thrown error naming what was missing. */
function textField(body: unknown, key: string): string {
  const value = isRecord(body) ? body[key] : undefined;
  if (typeof value !== "string") {
    throw new TypeError(`the body has no text ${key}`);
  }
  return value;
}

/** What the page tells the pen of one text: where it is and what it holds. */
interface Pen {
  readonly kind?: string;
  readonly where: string;
  readonly file: string;
  readonly sha: string;
  readonly section: string;
  readonly what: string;
  readonly fields: readonly { readonly value: string }[];
}

function parsePen(text: string): Pen {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) {
    throw new Error(`the pen is not an object: ${text}`);
  }
  return {
    ...(typeof value.kind === "string" ? { kind: value.kind } : {}),
    where: textField(value, "where"),
    file: textField(value, "file"),
    sha: textField(value, "sha"),
    section: textField(value, "section"),
    what: textField(value, "what"),
    fields: listOf(value.fields).map((f: unknown) => ({ value: textField(f, "value") })),
  };
}

/** Whether the page shows `label` before and after `change` runs. */
async function shownAround(url: string, label: string, change: () => void): Promise<boolean[]> {
  const before = (await (await fetch(url)).text()).includes(label);
  change();
  return [before, (await (await fetch(url)).text()).includes(label)];
}

/** A fresh marketplace served, with its first page. */
async function served(): Promise<{ root: string; url: string; html: string }> {
  const root = marketplace();
  const url = await start(root);
  return { root, url, html: await (await fetch(url)).text() };
}

const unescapeHtml = (s: string): string =>
  s
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

test("the served page puts a pen on a skill's description, with the file's sha256 as rendered", async () => {
  const { root, html } = await served();
  const m =
    /data-key="plugins\/qsm-a\/skills\/one\/SKILL\.md\|frontmatter description" data-pen="([^"]*)"/.exec(
      html,
    );
  const pen = parsePen(unescapeHtml(m?.[1] ?? "null"));
  const file = readFileSync(join(root, "plugins/qsm-a/skills/one/SKILL.md"));
  expect(pen.where).toBe("qsm-a:one");
  expect(pen.fields[0]?.value).toBe("Use when x.");
  expect(pen.sha).toBe(createHash("sha256").update(file).digest("hex"));
  // The why-it-exists section of the plugin gets one too, as a text box for the section.
  expect(html).toContain('data-key="plugins/qsm-a/README.md|Why it exists"');
});

/** Every file of the marketplace but the task store and the generated page, with its sha256. */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== ".beads" && e.name !== ".qsm") {
          walk(path);
        }
      } else {
        out[path.slice(root.length)] = createHash("sha256")
          .update(readFileSync(path))
          .digest("hex");
      }
    }
  };
  walk(root);
  return out;
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${url}edit`, {
    method: "POST",
    // A browser sends the page's own origin on a POST; the server refuses one without it.
    headers: { "content-type": "application/json", origin: url.replace(/\/$/, ""), ...headers },
    body: JSON.stringify(body),
  });

/** The pen of a text on the served page, as the page rendered it. */
async function penOf(url: string, key: string): Promise<Pen> {
  const html = await (await fetch(url)).text();
  const at = html.indexOf(`data-key="${key}" data-pen="`);
  const raw = html.slice(at).match(/data-pen="([^"]*)"/)?.[1] ?? "null";
  return parsePen(unescapeHtml(raw));
}

// A temporary marketplace with its own task store: nothing here touches this repository's .beads.
test("saving an edit makes one task and writes no plugin file; the task is stale once its file changes", async () => {
  if (which("br") === null) {
    process.stderr.write("skipped: br is not on PATH\n");
    return;
  }
  const root = marketplace();
  expect(spawnSync(["br", "init"], { cwd: root }).exitCode).toBe(0);
  const url = await start(root);
  const files = snapshot(root);
  const pen = await penOf(url, "plugins/qsm-a/skills/one/SKILL.md|frontmatter description");

  const saved = await post(url, {
    where: pen.where,
    file: pen.file,
    sha: pen.sha,
    section: pen.section,
    what: pen.what,
    before: "Use when x.",
    after: "Use when x, or y.",
    note: "y is a real case",
  });
  expect(saved.status).toBe(200);
  const id = textField(await saved.json(), "id");

  const issues = tasksIn(root);
  expect(issues.map((i) => i.id)).toEqual([id]);
  expect(issues[0]?.title).toBe("qsm-a:one: edit frontmatter description");
  const description = issues[0]?.description ?? "";
  expect(description).toContain("file: plugins/qsm-a/skills/one/SKILL.md");
  expect(description).toContain(`sha256: ${pen.sha}`);
  expect(description).toContain(
    "--- before\nUse when x.\n--- after\nUse when x, or y.\n--- note\ny is a real case",
  );
  // No plugin file changed.
  expect(snapshot(root)).toEqual(files);

  // The page lists the task as current, then as stale once its file changed.
  expect(
    await shownAround(url, "stale: its file changed", () => {
      appendFileSync(join(root, "plugins/qsm-a/skills/one/SKILL.md"), "\nmore\n");
    }),
  ).toEqual([false, true]);
});

test("an edit from another origin, no origin, another content type, a rebound host or a made-up plugin is refused", async () => {
  const root = marketplace();
  const url = await start(root);
  const edit = {
    where: "qsm-a",
    file: "README.md",
    sha: "missing",
    section: "s",
    what: "w",
    before: "",
    after: "x",
    note: "",
  };
  expect((await post(url, edit, { origin: "http://evil.example" })).status).toBe(403);
  const plain = await fetch(`${url}edit`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify(edit),
  });
  expect(plain.status).toBe(403);
  const noOrigin = await fetch(`${url}edit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(edit),
  });
  expect(noOrigin.status).toBe(403);
  // A DNS name rebound to 127.0.0.1 arrives with its own Host and gets nothing, not even the page.
  expect((await fetch(url, { headers: { host: "evil.example" } })).status).toBe(403);
  expect((await post(url, { ...edit, where: "qsm-nope" })).status).toBe(400);
  expect((await post(url, { ...edit, file: "../../etc/passwd" })).status).toBe(400);
});

test("a new skill is saved as one task of kind new and refused without an eval case; no file is made", async () => {
  const { root, url, html } = await served();
  expect(html).toContain('data-route="new"');
  expect(html).toContain("New skill");
  expect(html).toContain('id="lens-index"');
  const pen = await penOf(url, "plugins/{plugin}/skills/{name}/SKILL.md|new skill");
  expect(pen.kind).toBe("new");
  expect(pen.sha).toBe("missing");

  const files = snapshot(root);
  const fresh = {
    kind: "new",
    where: "qsm-a",
    file: "plugins/qsm-a/skills/two/SKILL.md",
    sha: "missing",
    section: "new skill",
    what: "new skill two",
    before: "",
    note: "",
  };
  const noEval = await post(url, {
    ...fresh,
    after: "Name: two\nWhat the eval does: \nWhat the grader expects: ",
  });
  expect(noEval.status).toBe(400);
  expect(textField(await noEval.json(), "error")).toContain("eval case");
  const taken = await post(url, {
    ...fresh,
    file: "plugins/qsm-a/skills/one/SKILL.md",
    after: "What the eval does: a\nWhat the grader expects: b",
  });
  expect(textField(await taken.json(), "error")).toContain("already exists");

  if (which("br") === null) {
    process.stderr.write("skipped the task part: br is not on PATH\n");
    return;
  }
  expect(spawnSync(["br", "init"], { cwd: root }).exitCode).toBe(0);
  const saved = await post(url, {
    ...fresh,
    after: "Name: two\nWhat the eval does: asks for x\nWhat the grader expects: it loads the skill",
  });
  expect(saved.status).toBe(200);
  const issues = tasksIn(root);
  expect(issues[0]?.title).toBe("qsm-a: new skill two");
  expect(issues[0]?.description).toContain("kind: new\nfile: plugins/qsm-a/skills/two/SKILL.md");
  expect(snapshot(root)).toEqual(files);
  // The task reads as new, and stale only once its file exists.
  expect(
    await shownAround(url, "stale: its file now exists", () => {
      write(root, "plugins/qsm-a/skills/two/SKILL.md", "---\nname: two\n---\n");
    }),
  ).toEqual([false, true]);
});
