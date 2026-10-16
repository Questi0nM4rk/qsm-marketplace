// The platform accessibility tree on Linux, read through gdbus: AT-SPI lives on its own bus, whose
// address the session bus hands out, and every application answers on it for itself.

import { QsmError } from "../../../lib/qsm-error.ts";
import { run } from "./run.ts";

export const KEY_SENDER = "wtype";
export const KEY_SENDER_HINT = "sudo pacman -S wtype";
const REGISTRY = "org.a11y.atspi.Registry";
const ROOT_PATH = "/org/a11y/atspi/accessible/root";
const ACCESSIBLE = "org.a11y.atspi.Accessible";
const RESTART_HINT = "systemctl --user restart at-spi-dbus-bus.service";

// AT-SPI state bits: the three an audit reads on every node.
const STATE_FOCUSABLE = 11;
const STATE_FOCUSED = 12;
const STATE_SHOWING = 25;
const WORD_BITS = 32;

interface NodeRef {
  readonly bus: string;
  readonly path: string;
}

export interface TreeNode {
  readonly role: string;
  readonly name: string;
  readonly focused: boolean;
  readonly focusable: boolean;
  readonly showing: boolean;
  readonly children: readonly TreeNode[];
}

function exec(address: string, ref: NodeRef, method: string, extra: readonly string[] = []) {
  return run([
    "gdbus",
    "call",
    "--address",
    address,
    "--dest",
    ref.bus,
    "--object-path",
    ref.path,
    "--method",
    method,
    ...extra,
  ]);
}

function call(address: string, ref: NodeRef, method: string, extra: readonly string[] = []) {
  const done = exec(address, ref, method, extra);
  if (done.exitCode !== 0) {
    throw new QsmError("failed", `${method} on ${ref.bus} failed: ${done.stderr.trim()}`);
  }
  return done.stdout;
}

/** The AT-SPI bus address, or the sentence naming what to do. Throws a `missing` error. */
function busAddress(): string {
  const done = run([
    "gdbus",
    "call",
    "--session",
    "--dest",
    "org.a11y.Bus",
    "--object-path",
    "/org/a11y/bus",
    "--method",
    "org.a11y.Bus.GetAddress",
  ]);
  const address = /'([^']+)'/.exec(done.stdout)?.[1];
  if (done.exitCode !== 0 || address === undefined) {
    throw new QsmError(
      "missing",
      `no AT-SPI bus address from the session bus: ${done.stderr.trim()}; start it with ${RESTART_HINT}`,
    );
  }
  return address;
}

const registry: NodeRef = { bus: REGISTRY, path: ROOT_PATH };

/** One call on the registry root: proves the socket behind the address answers. */
function checkBus(address: string): void {
  const done = exec(address, registry, "org.freedesktop.DBus.Properties.Get", [
    ACCESSIBLE,
    "ChildCount",
  ]);
  if (done.exitCode !== 0) {
    throw new QsmError(
      "missing",
      `the AT-SPI address ${address} does not answer (${done.stderr.trim()}); restart it with ${RESTART_HINT}`,
    );
  }
}

/** The doctor's finding: null when the bus answers, else what is wrong and the remedy. */
export function busFinding(): string | null {
  try {
    checkBus(busAddress());
    return null;
  } catch (error) {
    if (error instanceof QsmError) {
      return error.message;
    }
    throw error;
  }
}

/** The text between the first and the last single quote of a gdbus reply. */
function quoted(out: string): string {
  return out.slice(out.indexOf("'") + 1, out.lastIndexOf("'")).replaceAll(/\\(.)/g, "$1");
}

function childrenOf(address: string, ref: NodeRef): NodeRef[] {
  // the reply is an array of (bus name, object path) pairs: every quoted string, two by two
  const strings = [
    ...call(address, ref, `${ACCESSIBLE}.GetChildren`).matchAll(/'([^']*)'/g),
  ].flatMap((m) => (m[1] === undefined ? [] : [m[1]]));
  const pairs: NodeRef[] = [];
  for (let i = 0; i + 1 < strings.length; i += 2) {
    const bus = strings[i];
    const path = strings[i + 1];
    if (bus === undefined || path === undefined) {
      throw new QsmError("failed", "a gdbus children reply held a name without its path");
    }
    pairs.push({ bus, path });
  }
  return pairs;
}

function nameOf(address: string, ref: NodeRef): string {
  return quoted(call(address, ref, "org.freedesktop.DBus.Properties.Get", [ACCESSIBLE, "Name"]));
}

function roleOf(address: string, ref: NodeRef): string {
  return quoted(call(address, ref, `${ACCESSIBLE}.GetRoleName`));
}

function stateOf(address: string, ref: NodeRef): (bit: number) => boolean {
  const reply = call(address, ref, `${ACCESSIBLE}.GetState`);
  // `([uint32 4096, 0],)`: the first word carries its type name, the others do not
  const words = reply
    .slice(reply.indexOf("[") + 1, reply.indexOf("]"))
    .split(",")
    .map((part) => Number(part.trim().split(/\s+/).pop()));
  return (bit) =>
    Math.floor((words[Math.floor(bit / WORD_BITS)] ?? 0) / 2 ** (bit % WORD_BITS)) % 2 === 1;
}

function walk(address: string, ref: NodeRef, depth: number): TreeNode {
  const has = stateOf(address, ref);
  return {
    role: roleOf(address, ref),
    name: nameOf(address, ref),
    focused: has(STATE_FOCUSED),
    focusable: has(STATE_FOCUSABLE),
    showing: has(STATE_SHOWING),
    children: depth > 0 ? childrenOf(address, ref).map((c) => walk(address, c, depth - 1)) : [],
  };
}

/** Every application on the bus, or the one whose name contains `app` (case-insensitive), each
 * walked `depth` levels down. Throws `missing` when the bus is unreachable, `failed` when no
 * application matches. */
export function accessibilityTree(app: string | undefined, depth: number): TreeNode[] {
  const address = busAddress();
  checkBus(address);
  const wanted = app?.toLowerCase();
  const found: TreeNode[] = [];
  for (const ref of childrenOf(address, registry)) {
    const name = nameOf(address, ref);
    if (wanted === undefined || name.toLowerCase().includes(wanted)) {
      found.push(walk(address, ref, depth));
    }
  }
  if (app !== undefined && found.length === 0) {
    throw new QsmError(
      "failed",
      `no accessible application named "${app}" on the AT-SPI bus; a Qt app registers only when launched with QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1`,
    );
  }
  return found;
}

/** One line per node: indent, role, quoted name, and the audit states that hold. */
export function renderTree(nodes: readonly TreeNode[], indent = 0): string[] {
  return nodes.flatMap((node) => {
    const states = [
      node.focused ? "focused" : "",
      node.focusable ? "focusable" : "",
      node.showing ? "showing" : "",
    ].filter((s) => s !== "");
    const line = `${"  ".repeat(indent)}${node.role} ${JSON.stringify(node.name)} [${states.join(",")}]`;
    return [line, ...renderTree(node.children, indent + 1)];
  });
}
