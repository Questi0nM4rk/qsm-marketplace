// An environment without HOME is refused, never filled in with the real home: a test that builds an
// empty environment would otherwise write qsm's files into the machine it runs on.
import { describe, expect, test } from "bun:test";
import { binDir, home } from "./paths.ts";
import { QsmError } from "./qsm-error.ts";

describe("home", () => {
  test("an unset or empty HOME is missing, and nothing guesses it", () => {
    for (const env of [{}, { HOME: "" }]) {
      expect(() => home(env)).toThrow(QsmError);
      expect(() => binDir(env)).toThrow("HOME is not set");
    }
  });
});
