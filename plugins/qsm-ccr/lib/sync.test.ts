import { describe, expect, test } from "bun:test";
import { sandboxDir } from "../../../lib/fixtures/sandbox.ts";
import { fail, ok } from "../../../lib/outcome.ts";
import { DAY_MS } from "./catalog.ts";
import { appendSyncLog, lastSyncLine, syncIsFresh } from "./sync.ts";

describe("sync freshness", () => {
  test("never synced is stale; a good sync under a day ago is fresh; over a day is stale", () => {
    const dir = sandboxDir("qsm-ccr-log-");
    expect(syncIsFresh(dir, 0)).toBe(false);
    appendSyncLog(dir, ok(undefined, "CCR already matches codex"), 0);
    expect(syncIsFresh(dir, DAY_MS - 1)).toBe(true);
    expect(syncIsFresh(dir, DAY_MS + 1)).toBe(false);
  });

  test("a sync that found the token near its end counts as good; a failed one does not", () => {
    const dir = sandboxDir("qsm-ccr-log-");
    appendSyncLog(dir, fail("failed", "codex debug models exited 1: network"), 0);
    expect(syncIsFresh(dir, 1)).toBe(false);
    appendSyncLog(dir, fail("worse", "codex's access token expires soon"), 0);
    expect(syncIsFresh(dir, 1)).toBe(true);
  });

  test("the last good sync skips a later failure, and the last line is the failure", () => {
    const dir = sandboxDir("qsm-ccr-log-");
    appendSyncLog(dir, ok(undefined, "CCR already matches codex"), 1000);
    appendSyncLog(dir, fail("failed", "codex debug models exited 1: network"), 2000);
    expect(syncIsFresh(dir, 1000 + DAY_MS)).toBe(true);
    expect(lastSyncLine(dir)).toEqual({
      at: 2000,
      code: "failed",
      message: "codex debug models exited 1: network",
    });
  });
});
