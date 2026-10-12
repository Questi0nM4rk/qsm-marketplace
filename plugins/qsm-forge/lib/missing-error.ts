// A prerequisite the call needs is not there, as against a call that is wrong (errors.ts).

/**
 * A prerequisite the call needs is not there: no git checkout, no origin remote, a remote this
 * code does not recognise, or a payload file the caller named and this process cannot read.
 */
export class MissingError extends Error {}
