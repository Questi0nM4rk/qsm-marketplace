// The one installer every plugin runs.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fishCompletion, writeCompletion } from "./completions.ts";
import {
  cliMain,
  type InstallContext,
  type InstallFn,
  type InstallStatus,
  type Step,
} from "./install-contract.ts";
import { binDir, buildRecordPath, type Env, fishCompletionDir } from "./paths.ts";
import { loadManifest, type QsmManifest } from "./qsm-manifest.ts";

export interface UpstreamTool {
  /** what `command -v` must find */
  readonly cmd: string;
  /** present when any of these is on PATH, instead of `cmd`, which then only names the step: a
   * plugin that works with either of two tools */
  readonly anyOf?: readonly string[];
  /** run when the tool is missing; omit only when no command can do it
   * unattended (a system package manager, sudo, a login) */
  readonly install?: readonly string[];
  /** the exact command the user runs when we did not, or could not */
  readonly hint: string;
  /** the plugin's first command runs without it; missing is a suggestion,
   * not a missing prerequisite */
  readonly optional?: true;
}

export interface InstallBaseConfig {
  readonly pluginRoot: string;
  /** a function builds its row from the install env: a tool the user's settings name, whose
   * install command and hint change with that name */
  readonly upstream?: readonly (UpstreamTool | ((env: InstallContext["env"]) => UpstreamTool))[];
  /**
   * the plugin-specific steps, one or several, run last in the order returned: a download or a
   * link the plugin needs at run time, never an edit to a file the user owns
   */
  readonly extra?: (ctx: InstallContext) => ExtraSteps | Promise<ExtraSteps>;
}

type ExtraSteps = Step | readonly Step[];

/** The extra steps as a list, empty when the plugin has none. */
async function extraSteps(config: InstallBaseConfig, ctx: InstallContext): Promise<Step[]> {
  if (config.extra === undefined) {
    return [];
  }
  const extra = await config.extra(ctx);
  return isStepList(extra) ? [...extra] : [extra];
}

// Array.isArray does not narrow a readonly array out of a union.
function isStepList(extra: ExtraSteps): extra is readonly Step[] {
  return Array.isArray(extra);
}

/** What holds `target`: its link's destination, "" for a file that is not a link, undefined for
 * nothing. lstat, not exists: a dangling link from an earlier install is still there. */
function holder(target: string): string | undefined {
  const at = lstatSync(target, { throwIfNoEntry: false });
  if (at === undefined) {
    return undefined;
  }
  return at.isSymbolicLink() ? readlinkSync(target) : "";
}

/** Links `name` in the user's bin directory to `source`. A link into `source`'s own directory is
 * ours and is replaced; a link elsewhere, or a file, is the user's and stays as an error, unless
 * ctx.force replaces it. */
export function linkBin(ctx: InstallContext, name: string, source: string): Step {
  const step = `link ${name}`;
  const target = join(binDir(ctx.env), name);
  const there = holder(target);
  if (there === source) {
    return { name: step, status: "already", detail: `${target} unchanged` };
  }
  const foreign = there !== undefined && (there === "" || dirname(there) !== dirname(source));
  const what = there === "" ? "a file that is not a link" : `a link to ${there}`;
  if (foreign && ctx.force !== true) {
    const detail = `${target} is ${what}, not ours; run the install again with --force to replace it`;
    return { name: step, status: "error", detail };
  }
  if (ctx.dryRun) {
    return { name: step, status: "skipped", detail: `would link ${target} to ${source}` };
  }
  mkdirSync(binDir(ctx.env), { recursive: true });
  if (there !== undefined) {
    unlinkSync(target);
  }
  symlinkSync(source, target);
  const forced = foreign ? ` (--force replaced ${what})` : "";
  return { name: step, status: "installed", detail: `linked ${target} to ${source}${forced}` };
}

/** Removes the links in the bin directory that start with `prefix`, point at `source`, and are no
 * longer in `wanted`; each removal is a step, and a second run finds none. */
export function removeOwnedLinks(
  ctx: InstallContext,
  prefix: string,
  wanted: readonly string[],
  source: string,
): Step[] {
  const dir = binDir(ctx.env);
  const names = existsSync(dir) ? readdirSync(dir) : [];
  return names
    .filter((n) => n.startsWith(prefix) && !wanted.includes(n))
    .filter(
      (n) => lstatSync(join(dir, n)).isSymbolicLink() && readlinkSync(join(dir, n)) === source,
    )
    .map((n) => {
      if (!ctx.dryRun) {
        unlinkSync(join(dir, n));
      }
      const verb = ctx.dryRun ? "would remove" : "removed";
      return {
        name: `link ${n}`,
        status: ctx.dryRun ? "skipped" : "installed",
        detail: `${verb} the stale link ${join(dir, n)}`,
      };
    });
}

/** The one line for a plugin that installs nothing, dry run or real. */
export const NOTHING = "nothing to install";

/** worst first */
const SEVERITY: readonly InstallStatus[] = [
  "error",
  "missing-prereq",
  "suggested",
  "installed",
  "already",
  "skipped",
];

function worst(steps: readonly Step[]): InstallStatus {
  return SEVERITY.find((s) => steps.some((st) => st.status === s)) ?? "already";
}

export function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** What the bin farm last compiled, read by `qsm-setup doctor` and `relink`. */
export interface BuildRecord {
  readonly bins: Readonly<Record<string, { readonly plugin: string; readonly sha256: string }>>;
}

/** A JSON object: not null, not an array. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isBuildRecord(v: unknown): v is BuildRecord {
  return (
    isRecord(v) &&
    isRecord(v["bins"]) &&
    Object.values(v["bins"]).every(
      (b) => isRecord(b) && typeof b["plugin"] === "string" && typeof b["sha256"] === "string",
    )
  );
}

export function readRecord(path: string): BuildRecord | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isBuildRecord(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeRecord(path: string, record: BuildRecord): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
}

/** Whoever compiles a bin records its hash, so the record is current after any install. */
function recordBin(env: Env, plugin: string, bin: string, binPath: string): void {
  const path = buildRecordPath(env);
  const bins = { ...readRecord(path)?.bins, [bin]: { plugin, sha256: sha256(binPath) } };
  writeRecord(path, { bins });
}

/** The last line of a failed command's stderr, the cause an error step names. */
function lastLine(stderr: string): string {
  return stderr.trim().split("\n").at(-1) ?? "";
}

/** A plugin with a package.json has npm dependencies of its own. */
function hasDeps(pluginRoot: string): boolean {
  return existsSync(join(pluginRoot, "package.json"));
}

/** The plugin's own npm dependencies, installed from its lockfile before anything compiles. */
function dependencyStep(pluginRoot: string): Step | null {
  if (!hasDeps(pluginRoot)) {
    return null;
  }
  const name = "dependencies";
  // bun install leaves an empty hidden file in its temp directory, so it gets one of its own.
  const scratch = mkdtempSync(join(tmpdir(), "qsm-bun-install-"));
  const done = spawnSync("bun", ["install", "--frozen-lockfile"], {
    cwd: pluginRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, TMPDIR: scratch },
  });
  rmSync(scratch, { recursive: true, force: true });
  if (done.status !== 0) {
    const detail = `bun install failed in ${pluginRoot}: ${lastLine(done.stderr)}; run \`bun install\` in the plugin and commit its bun.lock`;
    return { name, status: "error", detail };
  }
  // bun prints "(no changes)" when node_modules already matched the lockfile.
  if (done.stdout.includes("(no changes)")) {
    return { name, status: "already", detail: "node_modules matches bun.lock" };
  }
  return { name, status: "installed", detail: "ran bun install --frozen-lockfile" };
}

/** Compiles `entry` to `outFile`, replacing it only when the bytes differ. */
function compile(pluginRoot: string, entry: string, outFile: string): Step {
  const name = basename(outFile);
  const source = resolve(pluginRoot, entry);
  if (!existsSync(source)) {
    return { name, status: "error", detail: `missing entry ${entry}` };
  }
  mkdirSync(resolve(outFile, ".."), { recursive: true });
  // The build goes through a temporary file because the binary being replaced may be the one
  // running us.
  const tmp = `${outFile}.tmp`;
  const built = spawnSync(
    "bun",
    ["build", "--compile", "--target", "bun", "--outfile", tmp, source],
    { stdio: ["ignore", "ignore", "pipe"], cwd: pluginRoot, encoding: "utf8" },
  );
  if (built.status !== 0) {
    if (existsSync(tmp)) {
      unlinkSync(tmp);
    }
    return {
      name,
      status: "error",
      detail: `bun build failed for ${entry}: ${lastLine(built.stderr)}`,
    };
  }
  if (existsSync(outFile) && sha256(outFile) === sha256(tmp)) {
    unlinkSync(tmp);
    return { name, status: "already", detail: `${outFile} unchanged` };
  }
  renameSync(tmp, outFile);
  return { name, status: "installed", detail: `compiled ${entry} to ${outFile}` };
}

/** Every `command` string anywhere inside a parsed hooks.json. */
function commandStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(commandStrings);
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([key, inner]) =>
    key === "command" && typeof inner === "string" ? [inner] : commandStrings(inner),
  );
}

/** `${CLAUDE_PLUGIN_ROOT}/dist/<name>` in hooks/hooks.json means hooks/<name>.ts. */
function declaredHooks(
  pluginRoot: string,
): readonly { readonly name: string; readonly entry: string }[] {
  const path = join(pluginRoot, "hooks", "hooks.json");
  if (!existsSync(path)) {
    return [];
  }
  // Read the commands as JSON strings: every real hooks.json quotes the path
  // ("\"${CLAUDE_PLUGIN_ROOT}/dist/<name>\""), so a pattern over the raw file text that expected
  // the name to end at a quote matched none of them.
  const commands = commandStrings(JSON.parse(readFileSync(path, "utf8")));
  const names = new Set<string>();
  for (const command of commands) {
    for (const m of command.matchAll(/\/dist\/([a-z0-9-]+)/g)) {
      const name = m[1];
      if (name !== undefined) {
        names.add(name);
      }
    }
  }
  return [...names].map((name) => ({ name, entry: `hooks/${name}.ts` }));
}

/** What dist/ holds that hooks.json no longer names: a binary of a hook that left is 90 MB. */
function staleDist(pluginRoot: string): string[] {
  const dist = join(pluginRoot, "dist");
  if (!existsSync(dist)) {
    return [];
  }
  const kept = new Set(declaredHooks(pluginRoot).map((h) => h.name));
  return readdirSync(dist).filter((name) => !kept.has(name));
}

function pruneSteps(pluginRoot: string): Step[] {
  const stale = staleDist(pluginRoot);
  const dist = join(pluginRoot, "dist");
  for (const name of stale) {
    rmSync(join(dist, name), { recursive: true, force: true });
  }
  if (stale.length > 0 && readdirSync(dist).length === 0) {
    rmdirSync(dist);
  }
  return stale.map((name) => ({
    name: `prune dist/${name}`,
    status: "installed",
    detail: `removed dist/${name}`,
  }));
}

type Missing = Pick<Step, "status" | "detail">;

function upstreamRows(config: InstallBaseConfig, env: InstallContext["env"]): UpstreamTool[] {
  return (config.upstream ?? []).map((row) => (typeof row === "function" ? row(env) : row));
}

/** An upstream tool's step: already when probed on PATH, else what `whenMissing` says. */
function upstreamStep(ctx: InstallContext, tool: UpstreamTool, whenMissing: () => Missing): Step {
  const name = `upstream ${tool.cmd}`;
  return (tool.anyOf ?? [tool.cmd]).some((c) => ctx.probe(c))
    ? { name, status: "already", detail: `${tool.cmd} on PATH` }
    : { name, ...whenMissing() };
}

/** The real run: install the tool, or say the command the user runs. */
function installUpstream(ctx: InstallContext, tool: UpstreamTool): Step {
  return upstreamStep(ctx, tool, () => {
    const [cmd, ...args] = tool.install ?? [];
    const optional = tool.optional === true;
    if (cmd === undefined) {
      const status = optional ? "suggested" : "missing-prereq";
      return { status, detail: `${tool.cmd} is not on PATH: ${tool.hint}` };
    }
    const exit = ctx.run(cmd, args);
    if (exit === 0) {
      return { status: "installed", detail: `ran ${[cmd, ...args].join(" ")}` };
    }
    const failed = `${[cmd, ...args].join(" ")} exited ${exit}; run it yourself: ${tool.hint}`;
    return { status: optional ? "suggested" : "error", detail: failed };
  });
}

/** The dry run: probed like the real run, so a plan reader (doctor) sees whether the tool is
 * there and, when not, the command that fixes it. */
function planUpstream(ctx: InstallContext, tool: UpstreamTool): Step {
  return upstreamStep(ctx, tool, () => ({
    status: tool.optional === true ? "suggested" : "missing-prereq",
    detail:
      tool.install === undefined
        ? `would need ${tool.cmd}: ${tool.hint}`
        : `would run ${tool.install.join(" ")}`,
  }));
}

function completionStep(dir: string, bin: string, manifest: QsmManifest): Step {
  const name = `completion ${bin}`;
  const outcome = writeCompletion(dir, bin, fishCompletion(bin, manifest.qsm.commands));
  const path = join(dir, `${bin}.fish`);
  if (outcome === "foreign") {
    return { name, status: "already", detail: `${path} is not ours, left alone` };
  }
  return outcome === "written"
    ? { name, status: "installed", detail: `wrote ${path}` }
    : { name, status: "already", detail: `${path} unchanged` };
}

function plan(config: InstallBaseConfig, manifest: QsmManifest, ctx: InstallContext): Step[] {
  // the extra steps are asked too, with ctx.dryRun set, so their plan lines land here
  const bins = binDir(ctx.env);
  const lines = [
    ...(hasDeps(config.pluginRoot) ? ["would run bun install --frozen-lockfile"] : []),
    ...Object.entries(manifest.qsm.bin ?? {}).map(
      ([bin, entry]) => `would compile ${entry} to ${join(bins, bin)}`,
    ),
    ...declaredHooks(config.pluginRoot).map((h) => `would compile ${h.entry} to dist/${h.name}`),
    ...staleDist(config.pluginRoot).map((name) => `would remove dist/${name}`),
  ];
  const completions = Object.keys(manifest.qsm.bin ?? {}).map(
    (bin) => `would write ${join(fishCompletionDir(ctx.env), `${bin}.fish`)}`,
  );
  return [
    ...lines.map(planStep),
    ...upstreamRows(config, ctx.env).map((t) => planUpstream(ctx, t)),
    ...completions.map(planStep),
  ];
}

function planStep(detail: string): Step {
  return { name: "plan", status: "skipped", detail };
}

/** What the plugin compiles: its binaries into the bin directory, its
 * classic hooks into dist/. */
function compileSteps(config: InstallBaseConfig, manifest: QsmManifest, env: Env): Step[] {
  const binSteps = Object.entries(manifest.qsm.bin ?? {}).map(([bin, entry]) => {
    const outFile = join(binDir(env), bin);
    const step = compile(config.pluginRoot, entry, outFile);
    if (step.status === "installed" || step.status === "already") {
      recordBin(env, basename(config.pluginRoot), bin, outFile);
    }
    return { ...step, name: `bin ${bin}` };
  });
  const hookSteps = declaredHooks(config.pluginRoot).map((h) => ({
    ...compile(config.pluginRoot, h.entry, join(config.pluginRoot, "dist", h.name)),
    name: `hook ${h.name}`,
  }));
  return [...binSteps, ...hookSteps];
}

async function run(
  config: InstallBaseConfig,
  manifest: QsmManifest,
  ctx: InstallContext,
): Promise<Step[]> {
  const completionDir = fishCompletionDir(ctx.env);
  const deps = dependencyStep(config.pluginRoot);
  // a plugin that cannot install its dependencies cannot compile either; stop at the cause
  if (deps?.status === "error") {
    return [deps];
  }
  const steps: Step[] = [
    ...(deps === null ? [] : [deps]),
    ...compileSteps(config, manifest, ctx.env),
    ...pruneSteps(config.pluginRoot),
    ...upstreamRows(config, ctx.env).map((t) => installUpstream(ctx, t)),
    ...Object.keys(manifest.qsm.bin ?? {}).map((bin) =>
      completionStep(completionDir, bin, manifest),
    ),
    ...(await extraSteps(config, ctx)),
  ];
  return steps;
}

function summarise(steps: readonly Step[], status: InstallStatus): string {
  if (steps.length === 0) {
    return NOTHING;
  }
  const telling = steps.filter((s) => s.status === status);
  return telling.map((s) => `${s.name}: ${s.detail}`).join("; ");
}

export function installBase(config: InstallBaseConfig): InstallFn {
  const manifest: QsmManifest = existsSync(join(config.pluginRoot, "qsm.json"))
    ? loadManifest(config.pluginRoot)
    : { qsm: { commands: {} } };
  const tool = manifest.name ?? basename(config.pluginRoot);
  return async (ctx) => {
    if (ctx.dryRun) {
      const steps = [
        ...plan(config, manifest, ctx),
        ...(await extraSteps(config, ctx)).map((s) => planStep(s.detail)),
      ];
      // A plugin with nothing to plan answers what the real run answers.
      if (steps.length === 0) {
        return { tool, status: "already", detail: NOTHING, steps: [] };
      }
      const lines = steps.map((st) => st.detail);
      return { tool, status: "skipped", detail: `[dry-run] ${lines.join("; ")}`, steps };
    }
    if (!ctx.probe("bun")) {
      const step: Step = {
        name: "bun",
        status: "missing-prereq",
        detail: "bun is not on PATH (https://bun.sh)",
      };
      return { tool, status: step.status, detail: step.detail, steps: [step] };
    }
    const steps = await run(config, manifest, ctx);
    const status = worst(steps);
    return { tool, status, detail: summarise(steps, status), steps };
  };
}

/**
 * The whole of a plugin's `scripts/install.ts`: the plugin root is the parent of the script's
 * directory, and run as a script (`import.meta.main`) it installs and exits with the outcome's
 * code. The script exports the result so its own test can call it.
 */
export function installScript(
  meta: Pick<ImportMeta, "dir" | "main">,
  config: Omit<InstallBaseConfig, "pluginRoot"> = {},
): InstallFn {
  const install = installBase({ ...config, pluginRoot: resolve(meta.dir, "..") });
  if (meta.main) {
    void cliMain(install).then((code) => process.exit(code));
  }
  return install;
}
