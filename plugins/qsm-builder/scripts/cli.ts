#!/usr/bin/env bun

// qsm-builder: what the builder knows about this marketplace, as verbs. `lens export` writes the
// static page, `lens readme` the root README's block and banners, `lens` serves it live, `lens pull`
// takes the edits saved on a published page.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { which } from "bun";
import {
  flagArg,
  type Handler,
  optionalNumber,
  optionalString,
  runCli,
} from "../../../lib/cli-base.ts";
import { fail, ok } from "../../../lib/outcome.ts";
import { parseManifest } from "../../../lib/qsm-manifest.ts";
import { briefOf } from "../lib/lens/brief.ts";
import { readMarketplace } from "../lib/lens/model.ts";
import { renderDocument } from "../lib/lens/page.ts";
import { artifactRows, pullEdits } from "../lib/lens/pull.ts";
import { generatedFiles } from "../lib/lens/readme.ts";
import { serveLens } from "../lib/lens/serve.ts";
import { sha256Of } from "../lib/lens/tasks.ts";
import { marketplaceView, viewOf } from "../lib/lens/view.ts";
// A static import: bun's compiler inlines JSON imports into the binary, so
// `--help` works with no checkout in the room (AGENTS.md law 9).
import manifestJson from "../qsm.json" with { type: "json" };

const manifest = parseManifest(manifestJson, "qsm-builder/qsm.json");

const lensExport: Handler = (call) => {
  const root = resolve(optionalString(call, "dir") ?? process.cwd());
  // Regenerated on each run into the marketplace's own gitignored .qsm directory.
  const target = optionalString(call, "out") ?? join(root, ".qsm", "lens.html");
  const marketplace = readMarketplace(root);
  // A full document, so the file opens right in a browser from disk; an artifact publish wraps
  // its own skeleton around it and ignores the leading lines.
  const html = renderDocument(marketplace, {
    edit: { sha: (rel) => sha256Of(root, rel), transport: "artifact" },
  });
  const file = resolve(target);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  return ok(
    { file, bytes: Buffer.byteLength(html), plugins: marketplace.plugins.length },
    `wrote ${file}: ${marketplace.plugins.length} plugins, ${Buffer.byteLength(html)} bytes`,
  );
};

const lensReadme: Handler = (call) => {
  const root = resolve(optionalString(call, "dir") ?? process.cwd());
  const readmeFile = join(root, "README.md");
  const readme = existsSync(readmeFile) ? readFileSync(readmeFile, "utf8") : "";
  const files = generatedFiles(readMarketplace(root), readme);
  const differs = Object.entries(files).filter(
    ([path, text]) =>
      !existsSync(join(root, path)) || readFileSync(join(root, path), "utf8") !== text,
  );
  const names = differs.map(([path]) => path);
  if (flagArg(call, "check")) {
    return names.length === 0
      ? ok({ files: [] }, "README.md and the banners are what the lens would write")
      : fail(
          "worse",
          `${names.join(", ")} differ from what the lens would write: run qsm-builder lens readme`,
          { files: names },
        );
  }
  for (const [path, text] of differs) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return ok(
    { files: names },
    names.length === 0 ? "nothing to write" : `wrote ${names.join(", ")}`,
  );
};

const lensTasks: Handler = (call) => {
  const plugin = optionalString(call, "plugin");
  const root = process.cwd();
  const market = readMarketplace(root);
  if (market.plugins.every((p) => p.tasks === null)) {
    return fail("missing", market.tasksNote);
  }
  const chosen = market.plugins.filter((p) => plugin === undefined || p.name === plugin);
  if (chosen.length === 0) {
    return fail("usage", `${String(plugin)} is not a plugin of ${root}`);
  }
  // One plugin: its own tasks and the ones that name it. All: each task under its own plugin only.
  const lines = chosen.map((p) => ({
    plugin: p.name,
    tasks: (p.tasks ?? []).filter((t) => plugin !== undefined || t.source === "title prefix"),
  }));
  const text = lines
    .flatMap((l) =>
      l.tasks.map(
        (t) =>
          `${l.plugin}  ${t.id}  ${t.kind}  ${{ true: "stale", false: "current", null: "-" }[String(t.stale)]}  ${t.title}`,
      ),
    )
    .join("\n");
  return ok(lines, text === "" ? "no open tasks" : text);
};

const lensPlugin: Handler = (call) => {
  const plugin = optionalString(call, "plugin");
  if (plugin === undefined || plugin === "") {
    return fail("usage", "plugin needs a name: qsm-builder lens plugin <name> [--dir <root>]");
  }
  const root = resolve(optionalString(call, "dir") ?? process.cwd());
  const view = viewOf(readMarketplace(root), plugin);
  return view === null
    ? fail("usage", `${plugin} is not a plugin of ${root}`)
    : ok(
        view,
        `${view.plugin}: ${view.items.length} skills and agents, ${view.tasks?.length ?? "?"} open tasks`,
      );
};

const lensMarketplace: Handler = (call) => {
  const root = resolve(optionalString(call, "dir") ?? process.cwd());
  const view = marketplaceView(readMarketplace(root));
  return ok(view, `${view.name}: ${view.plugins.length} plugins`);
};

const lensBrief: Handler = (call) => {
  const file = optionalString(call, "file");
  if (file === undefined || !file.startsWith("/")) {
    return fail("usage", "brief needs an absolute file path: qsm-builder lens brief <file>");
  }
  const brief = briefOf(file);
  return ok(brief, brief?.text ?? "no open edits or feedback to tell");
};

const lensPull: Handler = async (call) => {
  const url = optionalString(call, "url");
  if (url === undefined || url === "") {
    return fail("usage", "pull needs the artifact URL: qsm-builder lens pull <artifact-url>");
  }
  const root = process.cwd();
  readMarketplace(root);
  const pulled = await pullEdits(root, url, artifactRows);
  const lines = [
    ...pulled.unmarked.map((u) => `NOT MARKED row ${u.row}: ${u.reason}`),
    ...pulled.created.map((c) => `task ${c.task}  ${c.title}`),
    ...pulled.rejected.map((r) => `refused row ${r.row}: ${r.reason}`),
  ];
  const summary = `${pulled.created.length} tasks made, ${pulled.rejected.length} refused, ${pulled.taken} already taken${lines.length > 0 ? `\n${lines.join("\n")}` : ""}`;
  return pulled.unmarked.length > 0
    ? fail(
        "failed",
        `${summary}\nthe rows above would be pulled again: mark them taken by hand`,
        pulled,
      )
    : ok(pulled, summary);
};

const DEFAULT_PORT = 4747;

const lensServe: Handler = async (call) => {
  const root = resolve(optionalString(call, "dir") ?? process.cwd());
  readMarketplace(root);
  const served = serveLens(root, optionalNumber(call, "port") ?? DEFAULT_PORT);
  // Status goes to stderr: stdout stays the outcome, as under --json.
  process.stderr.write(`serving ${root} on ${served.url} (Ctrl-C stops it)\n`);
  await new Promise<void>((done) => {
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
  });
  await served.stop();
  return ok({ url: served.url }, `stopped ${served.url}`);
};

const doctor: Handler = () =>
  which("br") === null
    ? fail(
        "missing",
        "br is not on PATH: install qsm-tasks, which the lens needs to read tasks and to save an edit as one",
      )
    : ok({ br: true }, "qsm-builder runs; br is on PATH, so the lens reads and makes tasks");

if (import.meta.main) {
  process.exit(
    await runCli(manifest, "qsm-builder", {
      lens: lensServe,
      "lens export": lensExport,
      "lens readme": lensReadme,
      "lens brief": lensBrief,
      "lens pull": lensPull,
      "lens tasks": lensTasks,
      "lens marketplace": lensMarketplace,
      "lens plugin": lensPlugin,
      doctor,
    }),
  );
}
