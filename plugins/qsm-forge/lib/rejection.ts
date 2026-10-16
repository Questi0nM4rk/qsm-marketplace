// The tests' way to say "this promise rejects with that". bun-types declares `rejects.toThrow` as
// returning void, so awaiting it is a void expression; this helper awaits a Promise instead.

import { expect } from "bun:test";

type ErrorClass = new (...args: never[]) => Error;

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new TypeError("the promise rejected with something that is not an Error", {
      cause: error,
    });
  }
  throw new Error("expected the promise to reject, but it resolved");
}

/** The promise rejects with an instance of the class, or with a message containing the text or
 * matching the pattern. */
export async function expectRejection(
  promise: Promise<unknown>,
  expected: ErrorClass | string | RegExp,
): Promise<void> {
  const error = await rejectionOf(promise);
  if (typeof expected === "function") {
    expect(error).toBeInstanceOf(expected);
  } else {
    expect(error.message).toMatch(expected);
  }
}
