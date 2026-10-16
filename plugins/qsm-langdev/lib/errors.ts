// Narrowing for a thrown value: a catch clause receives unknown, so it reads the message and the
// errno code through these instead of a cast.

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
