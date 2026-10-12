// The local server behind `qsm-builder lens`: the page rendered from the repository on every
// request, and one event stream that says when a file of the marketplace changed. It listens on
// 127.0.0.1 only.

import { serve } from "bun";
import { createEditTask, EditError, parseEdit } from "./edits.ts";
import { ModelError, readMarketplace } from "./model.ts";
import { renderDocument } from "./page.ts";
import { sha256Of } from "./tasks.ts";
import { watchMarketplace } from "./watch.ts";

export interface Served {
  readonly url: string;
  readonly port: number;
  readonly stop: () => void;
}

const encoder = new TextEncoder();

type Stream = ReadableStreamDefaultController<Uint8Array>;

/** The open event streams: a response for each client, a way to tell all, a way to end all. */
function eventStreams(): {
  open: () => Response;
  tell: () => void;
  end: () => void;
} {
  const streams = new Set<Stream>();
  const send = (s: Stream, text: string) => {
    try {
      s.enqueue(encoder.encode(text));
    } catch {
      streams.delete(s);
    }
  };
  return {
    open() {
      let mine: Stream | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          mine = controller;
          streams.add(controller);
          send(controller, ": open\n\n");
        },
        cancel() {
          if (mine !== undefined) {
            streams.delete(mine);
          }
        },
      });
      return new Response(body, {
        headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
      });
    },
    tell() {
      for (const s of streams) {
        send(s, "data: change\n\n");
      }
    },
    end() {
      for (const s of streams) {
        try {
          s.close();
        } catch {
          // already closed by the client
        }
      }
      streams.clear();
    },
  };
}

/** The page, read from the repository now. */
function page(root: string): Response {
  try {
    // The sha256 a pen carries is the file as this render read it.
    const sha = (rel: string) => sha256Of(root, rel);
    return new Response(
      renderDocument(readMarketplace(root), { live: true, edit: { sha, transport: "server" } }),
      {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      },
    );
  } catch (error) {
    if (error instanceof ModelError) {
      return new Response(`${error.code}: ${error.message}\n`, { status: 500 });
    }
    throw error;
  }
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/** The loopback hosts this server answers to; any other Host is a DNS name rebound to 127.0.0.1. */
const loopback = (port: number): ReadonlySet<string> =>
  new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

/**
 * A saved edit: one task, no file. Only the page this server sent may post it: a request without a
 * loopback Origin or without a JSON content type is refused, since any web page can reach 127.0.0.1.
 */
async function saveEdit(req: Request, root: string, port: number): Promise<Response> {
  const origin = req.headers
    .get("origin")
    ?.toLowerCase()
    .replace(/^http:\/\//, "");
  if (
    req.headers.get("content-type")?.split(";")[0] !== "application/json" ||
    origin === undefined ||
    !loopback(port).has(origin)
  ) {
    return json(403, { error: "edits come from the page this server sent" });
  }
  try {
    return json(200, await createEditTask(root, parseEdit(await req.json(), root)));
  } catch (error) {
    if (error instanceof EditError) {
      return json(error.status, { error: error.message });
    }
    if (error instanceof SyntaxError) {
      return json(400, { error: "the edit is not JSON" });
    }
    throw error;
  }
}

/** The server, or the reason it could not listen: a taken port names itself and `--port`. */
function listen(
  port: number,
  fetch: (req: Request) => Response | Promise<Response>,
): ReturnType<typeof serve> | Error {
  try {
    // An event stream is idle between changes; the default would cut it after ten seconds.
    return serve({ hostname: "127.0.0.1", port, idleTimeout: 0, fetch });
  } catch (error) {
    if ((error as { code?: string }).code === "EADDRINUSE") {
      return new ModelError(
        "failed",
        `port ${port} is taken; choose another with --port <number>`,
        {
          cause: error,
        },
      );
    }
    throw error;
  }
}

/** One request: a loopback Host only, since a page on a rebound DNS name reaches 127.0.0.1 too. */
function route(
  req: Request,
  root: string,
  streams: ReturnType<typeof eventStreams>,
  port: number,
): Response | Promise<Response> {
  if (!loopback(port).has(req.headers.get("host")?.toLowerCase() ?? "")) {
    return new Response("forbidden\n", { status: 403 });
  }
  const routes: Record<string, () => Response | Promise<Response>> = {
    "GET /": () => page(root),
    "GET /events": () => streams.open(),
    "POST /edit": () => saveEdit(req, root, port),
  };
  const handle = routes[`${req.method} ${new URL(req.url).pathname}`];
  return handle === undefined ? new Response("not found\n", { status: 404 }) : handle();
}

/** Starts the server; throws `ModelError` `failed` naming the port when it cannot listen there. */
export function serveLens(root: string, port: number): Served {
  const streams = eventStreams();
  // The real port is known only after listen; a `--port 0` server learns it here.
  const at = { port };
  const server = listen(port, (req) => route(req, root, streams, at.port));
  if (server instanceof Error) {
    throw server;
  }
  at.port = server.port ?? port;
  const unwatch = watchMarketplace(root, streams.tell);
  return {
    url: `http://127.0.0.1:${server.port}/`,
    port: server.port ?? port,
    stop() {
      unwatch();
      streams.end();
      server.stop(true);
    },
  };
}
