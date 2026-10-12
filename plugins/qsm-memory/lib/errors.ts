// Every user-facing failure is one code from this fixed set, a message, and a next step.

export type ErrorCode = "not-found" | "ambiguous" | "secret" | "usage";

export class MemError extends Error {
  readonly code: ErrorCode;
  readonly next: string;

  constructor(code: ErrorCode, message: string, next: string) {
    super(message);
    this.name = "MemError";
    this.code = code;
    this.next = next;
  }
}

/** Throws a MemError. */
export function fail(code: ErrorCode, message: string, next: string): never {
  throw new MemError(code, message, next);
}
