// The purge: everything an older qsm version left on the machine, removed before an install or
// relink writes, and reported by doctor when it is still there. One walk serves both: `check`
// reports what is found, otherwise the same walk removes it.
import {
  existsSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { binDir, claudeDir, type Env, fishCompletionDir, home } from "../../../lib/paths.ts";
import { isLink, purgeFarm } from "../../../lib/legacy-farm.ts";

export interface PurgeReport {
  /** removed, or with `check` what would be removed: one sentence each */
  readonly found: readonly string[];
  /** left alone because it holds something we did not put there */
  readonly blocked: readonly string[];
}

export interface PurgeOptions {
  readonly env: Env;
  /** the marketplace checkout; a symlink into it is an old link farm */
  readonly root: string;
  readonly marketplace: string;
  readonly plugins: ReadonlySet<string>;
  readonly check: boolean;
}

/** A `# qsm: ... PATH` comment and the one statement under it: a single line, or an
 * `if`/`for`/`while` through its `end`/`fi`/`done`. Nothing else is touched. */
function stripPathBlocks(text: string): string {
  const out: string[] = [];
  let pending = false;
  let depth = 0;
  for (const line of text.split("\n")) {
    if (/^\s*# qsm:.*PATH/.test(line)) {
      pending = true;
      continue;
    }
    if (pending || depth > 0) {
      pending = false;
      depth += /^\s*(if|for|while)\b/.test(line) ? 1 : 0;
      depth -= /^\s*(end|fi|done)\b/.test(line) ? 1 : 0;
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function purgeRcBlocks(files: readonly string[], o: PurgeOptions, found: string[]) {
  for (const file of files) {
    if (!existsSync(file)) {
      continue;
    }
    const text = readFileSync(file, "utf8");
    const next = stripPathBlocks(text);
    if (next === text) {
      continue;
    }
    found.push(`qsm PATH block in ${file}`);
    if (!o.check) {
      writeFileSync(file, next);
    }
  }
}

/** Where a link in the bin directory really points. */
function linkTarget(path: string): string {
  const raw = readlinkSync(path);
  return isAbsolute(raw) ? raw : resolve(dirname(path), raw);
}

/** Why a link in the bin directory is ours to remove: it points into the checkout, or into a uv tool
 * a retired qsm tool installed (`uvTool` is that tool's directory, removed with the link). */
function oldLink(path: string, root: string): { why: string; uvTool?: string } | null {
  const target = linkTarget(path);
  const at = target.indexOf("/uv/tools/qsm-");
  const uvTool =
    at < 0 ? undefined : target.slice(0, target.indexOf("/", at + "/uv/tools/".length));
  if (uvTool !== undefined) {
    return { why: `the uv tool ${uvTool}`, uvTool };
  }
  return target.startsWith(`${root}/`) ? { why: `a link into ${root}` } : null;
}

function purgeLinks(bins: string, o: PurgeOptions, found: string[]) {
  const names = existsSync(bins) ? readdirSync(bins) : [];
  for (const path of names.map((n) => join(bins, n)).filter(isLink)) {
    const old = oldLink(path, o.root);
    if (old === null) {
      continue;
    }
    found.push(`${path}, ${old.why}`);
    if (!o.check) {
      rmSync(path);
      rmSync(old.uvTool ?? path, { recursive: true, force: true });
    }
  }
}

/** Claude Code makes `plugins/data/<plugin>-<marketplace>` and never removes it. */
function purgeDataDirs(claudeHome: string, o: PurgeOptions, found: string[]) {
  const data = join(claudeHome, "plugins", "data");
  if (!existsSync(data)) {
    return;
  }
  const pattern = new RegExp(`^(qsm-.+?)-(${o.marketplace}|inline)$`);
  for (const name of readdirSync(data)) {
    const plugin = name.match(pattern)?.[1];
    const path = join(data, name);
    if (plugin === undefined || o.plugins.has(plugin) || readdirSync(path).length > 0) {
      continue;
    }
    found.push(`empty data directory ${path} of ${plugin}, which the marketplace does not list`);
    if (!o.check) {
      rmdirSync(path);
    }
  }
}

export function purge(o: PurgeOptions): PurgeReport {
  const h = home(o.env);
  const r = { found: [] as string[], blocked: [] as string[] };
  const confDir = join(dirname(fishCompletionDir(o.env)), "conf.d");
  const fishFiles = existsSync(confDir)
    ? readdirSync(confDir)
        .filter((n) => n.endsWith(".fish"))
        .map((n) => join(confDir, n))
    : [];
  const zdot = o.env.ZDOTDIR ?? h;
  const farm = purgeFarm(o.env, o.check);
  r.found.push(...farm.found);
  r.blocked.push(...farm.blocked);
  purgeRcBlocks([...fishFiles, join(zdot, ".zshenv"), join(zdot, ".zshrc")], o, r.found);
  purgeLinks(binDir(o.env), o, r.found);
  purgeDataDirs(claudeDir(o.env), o, r.found);
  return r;
}
