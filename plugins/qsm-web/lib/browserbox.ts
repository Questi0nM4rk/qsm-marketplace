// The browser rung's container plane: what to name an instance, which port its live view gets, and
// the exact argument vector that starts it.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

export const IMAGE = "qsm-browserbox";
export const LABEL = "qsm.browserbox";
/** The image label that records which docker context it was built from. */
const SOURCE_LABEL = "qsm.browserbox.source";
/** One live-view port per instance. */
export const PORT_LOW = 11_000;
export const PORT_HIGH = 11_100;

export type Runtime = "docker" | "podman";

/**
 * The container runtime to drive: `QSM_CONTAINER_RUNTIME` when set, else whichever of docker and
 * podman is on PATH.
 */
export function chooseRuntime(
  env: Record<string, string | undefined>,
  probe: (cmd: string) => boolean,
): Runtime | null {
  const named = env.QSM_CONTAINER_RUNTIME;
  if (named === "docker" || named === "podman") {
    return named;
  }
  if (named !== undefined && named.length > 0) {
    return null;
  }
  if (probe("docker")) {
    return "docker";
  }
  if (probe("podman")) {
    return "podman";
  }
  return null;
}

export function instanceName(port: number): string {
  return `bbox-${port}`;
}

/** The address a human opens to watch and drive this instance's browser. */
export function liveViewUrl(port: number): string {
  return `http://127.0.0.1:${port}/`;
}

/** The lowest free port in the block, or null when every one is taken. */
export function pickPort(used: readonly number[]): number | null {
  const taken = new Set(used);
  for (let p = PORT_LOW; p <= PORT_HIGH; p += 1) {
    if (!taken.has(p)) {
      return p;
    }
  }
  return null;
}

export interface Instance {
  readonly name: string;
  readonly port: number;
  readonly liveView: string;
}

/** Read the runtime's `ps` output: one `<name> <port>` line per instance. */
export function parseInstances(psOutput: string): Instance[] {
  const out: Instance[] = [];
  for (const line of psOutput.split("\n")) {
    const m = line.trim().match(/^(\S+)\s+(\d+)$/);
    if (m?.[1] === undefined || m[2] === undefined) {
      continue;
    }
    const port = Number(m[2]);
    out.push({ name: m[1], port, liveView: liveViewUrl(port) });
  }
  return out;
}

/** Where an instance writes the artifacts it captures. The directory is
 * bind-mounted at /out, so a path in a result is a path on the host. */
export function outDir(
  env: Record<string, string | undefined>,
  home: string,
  name: string,
): string {
  const root = env.QSM_BROWSERBOX_OUT;
  return join(
    root !== undefined && root.length > 0 ? root : join(home, ".cache", "qsm-browserbox"),
    name,
  );
}

export interface StartSpec {
  readonly name: string;
  readonly port: number;
  readonly outDir: string;
  readonly liveView: string;
  /** The invoking user's `uid:gid`, so a file the instance writes to the mount is the user's own. */
  readonly user: string;
}

/** The exact argument vector that starts one isolated instance. */
export function runDefinition(spec: StartSpec): string[] {
  return [
    "run",
    "--detach",
    "--rm",
    "--name",
    spec.name,
    "--label",
    `${LABEL}=1`,
    // The host's network, so the browser reaches servers on the host's loopback. The live view
    // listens on the instance's own port, on loopback only.
    "--network",
    "host",
    // Firefox needs far more than the default 64 MB of shared memory.
    "--shm-size=2g",
    "--user",
    spec.user,
    "--env",
    `QSM_BROWSERBOX_LIVE_VIEW=${spec.liveView}`,
    "--env",
    `QSM_BROWSERBOX_PORT=${spec.port}`,
    "--volume",
    `${spec.outDir}:/out`,
    IMAGE,
  ];
}

export function listDefinition(): string[] {
  return ["ps", "--filter", `label=${LABEL}=1`, "--format", "{{.Names}} {{.Labels}}"];
}

export function stopDefinition(name: string): string[] {
  return ["rm", "--force", name];
}

export function buildDefinition(contextDir: string, source: string): string[] {
  return ["build", "--tag", IMAGE, "--label", `${SOURCE_LABEL}=${source}`, contextDir];
}

/** Prints the source hash the image was built from, or fails when there is no image. */
export function imageSourceDefinition(): string[] {
  return ["image", "inspect", "--format", `{{ index .Config.Labels "${SOURCE_LABEL}" }}`, IMAGE];
}

/**
 * The sha256 of every file under the docker context, path and content, in path order: the image
 * is current only when it was built from exactly these files.
 */
export function contextHash(dir: string): string {
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && !e.parentPath.includes("__pycache__"))
    .map((e) => join(e.parentPath, e.name))
    .toSorted();
  const hasher = new Bun.CryptoHasher("sha256");
  for (const file of files) {
    hasher.update(`${relative(dir, file)}\0`);
    hasher.update(readFileSync(file));
  }
  return hasher.digest("hex");
}

/**
 * How a job reaches the browser: one JSON object on the driver's stdin, one JSON object back on
 * its stdout.
 */
export function execDefinition(name: string): string[] {
  return ["exec", "--interactive", name, "/opt/venv/bin/python", "/opt/driver/ctl.py"];
}

/** A command line as a reader would type it, for --dry-run output. */
export function renderCommand(runtime: string, argv: readonly string[]): string {
  const quoted = argv.map((a) =>
    /[^\w@%+=:,./-]/.test(a) ? `'${a.replaceAll("'", "'\\''")}'` : a,
  );
  return [runtime, ...quoted].join(" ");
}
