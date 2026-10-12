// The payload both qsm-langdev hooks read on stdin, and who it says is running.

import { type Editor, MAIN_AGENT } from "./state.ts";

export interface HookEvent {
  session_id?: unknown;
  agent_id?: unknown;
  tool_input?: { file_path?: unknown; notebook_path?: unknown };
}

/** Who is running, from the hook payload. */
export function editorOf(event: HookEvent): Editor {
  const sessionId =
    typeof event.session_id === "string" && event.session_id ? event.session_id : "unknown";
  const agentId =
    typeof event.agent_id === "string" && event.agent_id ? event.agent_id : MAIN_AGENT;
  return { sessionId, agentId };
}
