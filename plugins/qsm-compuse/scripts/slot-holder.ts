#!/usr/bin/env bun
// Holds one virtual pointer and one virtual keyboard open on a Wayland display until killed.
//
// A headless sway has no input device, so its seat advertises no pointer and no keyboard and a
// client (Qt) never creates wl_pointer or wl_keyboard. wlrctl and wtype each create their own
// virtual device and destroy it on exit, which is too short for a client to react to. This
// process keeps one of each alive so the capabilities stay on the seat. Plain wire protocol,
// no libraries: the protocols are tiny and nothing here may need installing.
import { createConnection } from "node:net";
import { runtimeDir } from "../../../lib/paths.ts";

const REGISTRY = 2;
const CALLBACK = 3;
const SEAT = 4;
const POINTER_MANAGER = 5;
const KEYBOARD_MANAGER = 6;

const word = (...values: number[]): Buffer => {
  const out = Buffer.alloc(values.length * 4);
  for (const [i, value] of values.entries()) out.writeUInt32LE(value, i * 4);
  return out;
};

const text = (value: string): Buffer => {
  const data = Buffer.from(`${value}\0`);
  return Buffer.concat([word(data.length), data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
};

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
  socket.write(message(POINTER_MANAGER, 0, word(SEAT, 7)));
  socket.write(message(KEYBOARD_MANAGER, 0, word(SEAT, 8)));
  console.log("holding");
}

const runtime = runtimeDir(process.env);
const display = process.env.WAYLAND_DISPLAY;
if (runtime === undefined || display === undefined) {
  process.stderr.write("slot-holder: XDG_RUNTIME_DIR and WAYLAND_DISPLAY must be set\n");
  process.exit(1);
}
const socket = createConnection(`${runtime}/${display}`);
const pending = { buf: Buffer.alloc(0) };
socket.on("data", (chunk) => {
  onData(socket, pending, Buffer.from(chunk));
});
socket.on("close", () => process.exit(1));
socket.write(Buffer.concat([message(1, 1, word(REGISTRY)), message(1, 0, word(CALLBACK))]));
