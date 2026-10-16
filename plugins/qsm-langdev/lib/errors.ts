// Narrowing for a thrown value: a catch clause receives unknown, so it reads the errno code
// through this instead of a cast.

export function isErrno(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
