import { describe, expect, test } from "bun:test";
import { calls } from "./validate-test-temp.ts";

describe("calls", () => {
  test("finds a call in code, in a template expression, and through a namespace", () => {
    const src = [
      'const a = mkdtempSync(join(tmpdir(), "x-"));',
      "const b = `${os.tmpdir()}/y`;",
      "await fs.mkdtemp ( p );",
    ].join("\n");
    expect(calls(src)).toEqual(["1: mkdtempSync()", "1: tmpdir()", "2: tmpdir()", "3: mkdtemp()"]);
  });

  test("ignores the word in a string, a template text, a comment and a regex", () => {
    const src = [
      'const s = "never call tmpdir() here";',
      "const t = `mkdtemp(${n}) and tmpdir()`;",
      "// mkdtempSync(dir)",
      "/* tmpdir() */ const r = /tmpdir\\(/;",
      "const notACall = mytmpdir();",
    ].join("\n");
    expect(calls(src)).toEqual([]);
  });
});
