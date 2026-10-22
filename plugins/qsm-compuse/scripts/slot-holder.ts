#!/usr/bin/env bun
// Holds one virtual pointer and one virtual keyboard open on a Wayland display until killed.
//
// A headless sway has no input device, so its seat advertises no pointer and no keyboard and a
// client (Qt) never creates wl_pointer or wl_keyboard. wlrctl and wtype each create their own
// virtual device and destroy it on exit, which is too short for a client to react to. This
// process keeps one of each alive so the capabilities stay on the seat. Plain wire protocol,
// no libraries: the protocols are tiny and nothing here may need installing.
import { createReadStream, openSync } from "node:fs";
import { createConnection } from "node:net";
import { runtimeDir } from "../../../lib/paths.ts";

const REGISTRY = 2;
const CALLBACK = 3;
const SEAT = 4;
const POINTER_MANAGER = 5;
const KEYBOARD_MANAGER = 6;
const POINTER = 7;

const word = (...values: number[]): Buffer => {
  const out = Buffer.alloc(values.length * 4);
  for (const [i, value] of values.entries()) out.writeUInt32LE(value, i * 4);
  return out;
};

const text = (value: string): Buffer => {
  const data = Buffer.from(`${value}\0`);
  return Buffer.concat([word(data.length), data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
};

// wl_fixed_t: signed 24.8.
const fixed = (value: number): number => Math.round(value * 256) >>> 0;

const message = (object: number, opcode: number, body: Buffer = Buffer.alloc(0)): Buffer =>
  Buffer.concat([word(object, ((8 + body.length) << 16) | opcode), body]);

// Registry globals as interface -> [name, version], read until the sync callback fires.
const globals = new Map<string, [number, number]>();

function onData(
  socket: ReturnType<typeof createConnection>,
  pending: { buf: Buffer },
  chunk: Buffer,
): void {
  pending.buf = Buffer.concat([pending.buf, chunk]);
  while (pending.buf.length >= 8) {
    const object = pending.buf.readUInt32LE(0);
    const header = pending.buf.readUInt32LE(4);
    const size = header >>> 16;
    if (pending.buf.length < size) return;
    const body = pending.buf.subarray(8, size);
    pending.buf = pending.buf.subarray(size);
    if (object === REGISTRY && (header & 0xffff) === 0) {
      const length = body.readUInt32LE(4);
      const version = body.readUInt32LE(8 + length + ((4 - (length % 4)) % 4));
      globals.set(body.toString("utf8", 8, 8 + length - 1), [body.readUInt32LE(0), version]);
    }
    if (object === CALLBACK) hold(socket);
  }
}

function bind(
  socket: ReturnType<typeof createConnection>,
  interfaceName: string,
  id: number,
): void {
  const found = globals.get(interfaceName);
  if (!found) {
    console.error(`slot-holder: compositor lacks ${interfaceName}`);
    process.exit(1);
  }
  socket.write(
    message(REGISTRY, 0, Buffer.concat([word(found[0]), text(interfaceName), word(found[1], id)])),
  );
}

function hold(socket: ReturnType<typeof createConnection>): void {
  bind(socket, "wl_seat", SEAT);
  bind(socket, "zwlr_virtual_pointer_manager_v1", POINTER_MANAGER);
  bind(socket, "zwp_virtual_keyboard_manager_v1", KEYBOARD_MANAGER);
  socket.write(message(POINTER_MANAGER, 0, word(SEAT, POINTER)));
  socket.write(message(KEYBOARD_MANAGER, 0, word(SEAT, 8)));
  console.log("holding");
  listen(socket);
}

// virtual_pointer opcodes: motion 0, motion_absolute 1, button 2, axis 3, frame 4, axis_source 5, axis_discrete 7.
const stamp = (): number => Date.now() >>> 0;

// One notch of a wheel is 15 units of axis value and one discrete step (value120 / 120).
function wheel(notches: number): Buffer {
  return Buffer.concat([
    message(POINTER, 5, word(0)),
    message(POINTER, 7, word(stamp(), 0, fixed(15 * notches), notches >>> 0)),
    message(POINTER, 4),
  ]);
}

// The control channel: `drive` writes one command per line to the FIFO `ctl` in the slot dir, and
// they reach the seat through the same virtual pointer that keeps its capability alive.
//   rel DX DY | abs X Y W H | btn LINUX_CODE 0|1 | wheel NOTCHES (positive = down)
const commands: Record<string, (n: number[]) => Buffer> = {
  rel: ([dx = 0, dy = 0]) => pointerEvent(0, fixed(dx), fixed(dy)),
  abs: ([x = 0, y = 0, w = 1, h = 1]) => pointerEvent(1, x, y, w, h),
  btn: ([code = 0, state = 0]) => pointerEvent(2, code, state),
  wheel: ([notches = 0]) => wheel(notches),
};

function pointerEvent(opcode: number, ...values: number[]): Buffer {
  return Buffer.concat([message(POINTER, opcode, word(stamp(), ...values)), message(POINTER, 4)]);
}

function command(line: string): Buffer | undefined {
  const [verb = "", ...args] = line.trim().split(/\s+/);
  const n = args.map(Number);
  return n.some(Number.isNaN) ? undefined : commands[verb]?.(n);
}

function listen(socket: ReturnType<typeof createConnection>): void {
  const dir = process.env.DRIVE_SLOT_ID;
  if (dir === undefined) return;
  // Read-write open: a FIFO opened only for reading reports end-of-file when the last writer leaves.
  const stream = createReadStream("", { fd: openSync(`${dir}/ctl`, "r+"), encoding: "utf8" });
  let rest = "";
  stream.on("data", (chunk) => {
    const lines = (rest + String(chunk)).split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) {
      const out = command(line);
      if (out) socket.write(out);
      else console.error(`slot-holder: bad command '${line}'`);
    }
  });
}

const runtime = runtimeDir(process.env);
const display = process.env.WAYLAND_DISPLAY;
if (runtime === undefined || display === undefined) {
  process.stderr.write("slot-holder: the session runtime dir and WAYLAND_DISPLAY must be set\n");
  process.exit(1);
}
// A display may be a path of its own (a desktop slot's sockets live in the slot's runtime dir).
const socket = createConnection(display.startsWith("/") ? display : `${runtime}/${display}`);
const pending = { buf: Buffer.alloc(0) };
socket.on("data", (chunk) => {
  onData(socket, pending, Buffer.from(chunk));
});
socket.on("close", () => process.exit(1));
socket.write(Buffer.concat([message(1, 1, word(REGISTRY)), message(1, 0, word(CALLBACK))]));
