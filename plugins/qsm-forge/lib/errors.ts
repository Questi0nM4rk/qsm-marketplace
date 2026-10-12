// The one failure a caller must be able to tell apart from "the forge said no".

/**
 * The call itself is wrong: no message, an identifier that names no thread on this pull or merge
 * request, an option that is not `owner/name`.
 */
export class UsageError extends Error {}
