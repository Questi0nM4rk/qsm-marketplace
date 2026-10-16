// doctor: the two things a skill cannot settle by reading its own files.

import { spawnSync } from "node:child_process";
import { type Dirent, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type DoctorSections = Record<string, readonly string[]>;

/** The upstream npm package this plugin drives. One constant, so the command
 * the report prints is the command the installer ran. */
export const UPSTREAM_PACKAGE = "@fission-ai/openspec";

/** The command that puts the upstream CLI on PATH. Named in the report so
 * a missing binary carries its own fix. */
export const INSTALL_COMMAND = `bun add -g ${UPSTREAM_PACKAGE}`;

/** No generated prompt hides in these, and walking them is slow. */
const SKIPPED = new Set(["node_modules", "dist", "build", "target", ".git"]);

/**
 * Agent configuration sits within a few levels of the repository root
 * (`.<harness>/skills/openspec-...`), and a deep walk of a large repository for a report nobody
 * asked to wait for is the wrong trade.
 */
const MAX_DEPTH = 6;

export function isDir(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/** The repository `cwd` sits in: the nearest directory holding `.git`. */
export function repositoryRoot(cwd: string): string {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    if (dirname(dir) === dir) {
      return resolve(cwd);
    }
  }
}

const alphabetical = (a: string, b: string): number => a.localeCompare(b);

/** A directory named `openspec-*` directly under a `skills` directory, or a
 * file named `opsx*` directly under a `commands` directory: the two shapes
 * `openspec init` writes when it is allowed to generate prompts. */
function isGeneratedPrompt(parent: string, name: string, directory: boolean): boolean {
  if (directory) {
    return parent === "skills" && name.startsWith("openspec-");
  }
  return parent === "commands" && name.startsWith("opsx");
}

/** A directory's entries, or none when it cannot be read. */
function entriesOf(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function scan(dir: string, parent: string, depth: number, found: string[]): void {
  if (depth > MAX_DEPTH || !isDir(dir)) {
    return;
  }
  for (const entry of entriesOf(dir).toSorted((a, b) => alphabetical(a.name, b.name))) {
    if (SKIPPED.has(entry.name)) {
      continue;
    }
    const path = join(dir, entry.name);
    if (isGeneratedPrompt(parent, entry.name, entry.isDirectory())) {
      found.push(path);
      continue;
    }
    if (entry.isDirectory()) {
      scan(path, entry.name, depth + 1, found);
    }
  }
}

/** Every upstream-generated openspec prompt in the project, sorted. */
export function generatedPrompts(root: string): string[] {
  const found: string[] = [];
  scan(root, "", 0, found);
  return found.toSorted(alphabetical);
}

export interface DoctorInput {
  /** The repository the report is about. */
  readonly root: string;
  /** What the upstream CLI answered to `--version`, or null when it is not
   * reachable. A missing binary reports missing and no version. */
  readonly version: string | null;
}

export function doctorSections(input: DoctorInput): DoctorSections {
  const sections: Record<string, readonly string[]> = {
    "openspec cli":
      input.version === null
        ? [`not on PATH; install it with: ${INSTALL_COMMAND}`]
        : [`version ${input.version}`],
  };
  const prompts = generatedPrompts(input.root);
  if (prompts.length > 0) {
    sections["upstream prompts"] = [
      "this project was initialised with generated prompts; each verb now exists twice",
      ...prompts.map((path) => `${path} (remove it: rm -rf ${path})`),
      "initialise without them next time: openspec init --tools none",
    ];
  }
  return sections;
}

/** The one impure function here: asks the upstream CLI what it is. */
export function openspecVersion(): string | null {
  const probe = spawnSync("openspec", ["--version"], { encoding: "utf8" });
  if (probe.status !== 0) {
    return null;
  }
  const version = (probe.stdout ?? "").trim();
  return version.length === 0 ? null : version;
}
