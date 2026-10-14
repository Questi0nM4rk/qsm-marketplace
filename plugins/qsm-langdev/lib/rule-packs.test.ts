// Where a pack's or a single rule's text comes from. The registry is the
// network boundary, so the global fetch is the one thing replaced here.

import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchFromRegistry, resolvePacks } from "./rule-packs.ts";
import { OWN_RULES } from "./rules-data.ts";
import { defined } from "./test-support.ts";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function recordingFetch(): string[] {
  const urls: string[] = [];
  globalThis.fetch = Object.assign(
    (input: string | URL | Request) => {
      urls.push(input instanceof Request ? input.url : String(input));
      return Promise.resolve(new Response("rules: []\n"));
    },
    { preconnect: realFetch.preconnect },
  );
  return urls;
}

test("a pack and a single rule are fetched from the registry under the name semgrep takes", async () => {
  const urls = recordingFetch();

  await fetchFromRegistry("p/python");
  await fetchFromRegistry("r/bash.curl.security.curl-eval");

  expect(urls).toEqual([
    "https://semgrep.dev/c/p/python",
    "https://semgrep.dev/c/r/bash.curl.security.curl-eval",
  ]);
});

test("our own rules come from the binary, never from the network, and are keyed on their content", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qsm-langdev-rule-packs-"));
  const fetched: string[] = [];
  try {
    const resolved = await resolvePacks(["qsm/bash"], dir, (pack) => {
      fetched.push(pack);
      return Promise.reject(new Error("offline"));
    });

    const bash = resolved.get("qsm/bash");
    const text = defined(OWN_RULES.bash, "the bash rules");
    expect(fetched).toEqual([]);
    expect(bash !== undefined && "path" in bash ? readFileSync(bash.path, "utf8") : null).toBe(
      text,
    );
    expect(bash !== undefined && "hash" in bash ? bash.hash : null).toBe(
      createHash("sha256").update(text).digest("hex"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an own rules name with no rules file is named unfetched, never run empty", async () => {
  const dir = mkdtempSync(join(tmpdir(), "qsm-langdev-rule-packs-"));
  try {
    const resolved = await resolvePacks(["qsm/cobol"], dir, () => Promise.resolve("rules: []\n"));

    expect(resolved.get("qsm/cobol")).toEqual({
      reason: "qsm/cobol could not be fetched: qsm-langdev ships no rules/cobol.yaml",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
