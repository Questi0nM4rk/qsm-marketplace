import { expect, test } from "bun:test";
import { backgroundDenial } from "./bash-background.ts";

// A false positive here blocks every command that redirects stderr, so the redirections are the
// cases that matter.
test("a lone & is blocked, redirections, && and quoted text are not", () => {
  const blocked = ["sleep 5 &", "a & b", "server & wait", "curl http://x?a=1&b=2"];
  const allowed = [
    "a && b",
    "cmd 2>&1 | tail",
    "cmd &> log",
    "cmd >&2",
    "cmd |& tee log",
    "echo 'a & b'",
    'echo "a & b"',
    "ls # a & b",
  ];
  expect(blocked.filter((c) => backgroundDenial(c) === null)).toEqual([]);
  expect(allowed.filter((c) => backgroundDenial(c) !== null)).toEqual([]);
});
