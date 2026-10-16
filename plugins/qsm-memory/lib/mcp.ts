// The MCP server: five tools, each calling the lib function the CLI verb calls and printing the
// same text.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { QsmError } from "../../../lib/qsm-error.ts";
import { addNote, currentNotes, dropNote, formatNotes, NOTE_DEFAULT_DAYS } from "./notes.ts";
import { projectOf } from "./project.ts";
import { projectsDir, unsavedTranscripts } from "./save.ts";
import { formatHits, search } from "./search.ts";
import { bounded, formatList, listSessions, show } from "./sessions.ts";
import { openArchive } from "./store.ts";

// The SDK's own CallToolResult carries an index signature; a plain
// `{content, isError?}` interface is structurally narrower, so TS rejects it.
interface ToolText {
  readonly [x: string]: unknown;
  readonly content: [{ readonly type: "text"; readonly text: string }];
  readonly isError?: true;
}

function text(value: string): ToolText {
  return { content: [{ type: "text", text: value }] };
}

/** Runs a tool body, turning a `QsmError` into `<code>: <message>` and, with a next step,
 * `\n  next: <next>`, with `isError`. Any other error is the SDK's to report. */
function guarded(run: () => string): ToolText {
  try {
    return text(run());
  } catch (error) {
    if (error instanceof QsmError) {
      const next = error.next === undefined ? "" : `\n  next: ${error.next}`;
      return {
        content: [{ type: "text", text: `${error.code}: ${error.message}${next}` }],
        isError: true,
      };
    }
    throw error;
  }
}

const since = z.string().optional().describe("7d, or an ISO date");
const project = z.string().optional().describe("a project root path");

function registerSearch(server: McpServer): void {
  server.registerTool(
    "search",
    {
      description:
        "Full-text search over what was said in every saved session on this machine; prefix and stem matching. Returns hit lines or 'no session matches'.",
      inputSchema: {
        query: z.string(),
        limit: z.number().int().positive().optional(),
        since,
        project,
      },
    },
    (args) => guarded(() => formatHits(search(openArchive(process.env), args.query, args))),
  );
}

function registerShow(server: McpServer): void {
  server.registerTool(
    "show",
    {
      description:
        "One saved session's conversation text; full reads the transcript file instead, tool calls and results included; lines a-b windows by turn.",
      inputSchema: {
        session: z.string().describe("a session id or its prefix"),
        full: z.boolean().optional(),
        lines: z
          .string()
          .regex(/^\d+-\d+$/)
          .optional(),
      },
    },
    (args) =>
      guarded(() => {
        const lines = args.lines === undefined ? undefined : parseLines(args.lines);
        return show(openArchive(process.env), args.session, {
          full: args.full,
          ...(lines === undefined ? {} : { lines }),
        });
      }),
  );
}

export function parseLines(spec: string): readonly [number, number] {
  const [a, b] = spec.split("-").map(Number);
  return [a ?? 1, b ?? a ?? 1];
}

function registerList(server: McpServer): void {
  server.registerTool(
    "list",
    {
      description:
        "One line per saved session, newest first: date, project, id, turns, title; at most limit lines (default 20), then 'N more'. unsaved lists transcripts on disk the archive lacks.",
      inputSchema: {
        since,
        project,
        unsaved: z.boolean().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    (args) =>
      guarded(() => {
        const db = openArchive(process.env);
        if (args.unsaved === true) {
          const paths = unsavedTranscripts(db, projectsDir(process.env));
          return paths.length === 0 ? "nothing unsaved" : bounded(paths, args.limit);
        }
        return formatList(listSessions(db, args), args.limit);
      }),
  );
}

function registerNotes(server: McpServer): void {
  server.registerTool(
    "notes",
    {
      description:
        "The current short-term notes for this project and the global ones, newest first, each with its from-date and expiry.",
      inputSchema: { all: z.boolean().optional().describe("every project's notes") },
    },
    (args) =>
      guarded(() => {
        const rows = currentNotes(openArchive(process.env), projectOf(process.cwd()), args);
        return formatNotes(rows, args.all === true);
      }),
  );
  server.registerTool(
    "note",
    {
      description:
        "Write a short-term note for this project (a handoff starts with the task id; expires in 14 days unless keep), or drop one by id.",
      inputSchema: {
        text: z.string().optional(),
        expires: z.number().int().positive().optional().describe("days"),
        keep: z.boolean().optional(),
        global: z.boolean().optional(),
        drop: z.string().optional().describe("the id of a note to remove"),
      },
    },
    (args) =>
      guarded(() => {
        const db = openArchive(process.env);
        if (args.drop !== undefined) {
          dropNote(db, args.drop);
          return `dropped ${args.drop}`;
        }
        const row = addNote(db, {
          text: args.text ?? "",
          project: args.global === true ? null : projectOf(process.cwd()),
          expiresDays: args.keep === true ? null : (args.expires ?? NOTE_DEFAULT_DAYS),
        });
        return `noted ${row.id}`;
      }),
  );
}

/** Builds the `qsm-memory` MCP server: search, show, list, notes, note. */
export function buildServer(): McpServer {
  const server = new McpServer({ name: "qsm-memory", version: "beta" });
  registerSearch(server);
  registerShow(server);
  registerList(server);
  registerNotes(server);
  return server;
}
