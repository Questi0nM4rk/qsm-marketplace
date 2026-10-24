// Import-free, because hooks/register.tsx imports it inside the engine sandbox and the scrub imports
// it too.

/** Keys of a transcript line that link the record to its session, its parent or its place: never message text. */
export const STRUCTURAL_KEYS: ReadonlySet<string> = new Set([
  "sessionId",
  "uuid",
  "parentUuid",
  "cwd",
  "transcript_path",
  "agentId",
  "toolUseID",
  "tool_use_id",
]);
