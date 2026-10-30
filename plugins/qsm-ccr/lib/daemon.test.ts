import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { sleep, spawn } from "bun";
import { CODEX_TIMEOUT_MS } from "./codex.ts";
import { daemonState, LOCK_WAIT_MS, START_WAIT_MS, STOP_MAX_MS, takeDown } from "./daemon.ts";
import { foreignListener, makeWorld, setMode } from "./fixtures/world.ts";
import { prepareRouted } from "./launch.ts";
import { placesOf } from "./places.ts";
import type { RoutedRoute } from "./route.ts";

const ROUTE: RoutedRoute = { kind: "routed", provider: "codex-api", slug: "gpt-6.1-sol" };

setDefaultTimeout(60_000);

describe("waiting for the router lock", () => {
  test("a waiter outwaits the longest holder: codex's refresh, two starts, three stops", () => {
    expect(LOCK_WAIT_MS).toBeGreaterThan(CODEX_TIMEOUT_MS + 2 * START_WAIT_MS + 3 * STOP_MAX_MS);
  });
});

describe("whose daemon holds the port", () => {
  /** A stale service.json after a crash or reboot: its pid is some unrelated live process, and
   * something that is not CCR listens on PORT. */
  async function staleWorld() {
    const server = await foreignListener();
    const w = makeWorld({ settings: {}, port: server.port });
    const places = placesOf(w.env);
    const victim = spawn(["setsid", "sleep", "60"]);
    writeFileSync(
      join(places.ccrHome, "service.json"),
      JSON.stringify({ pid: victim.pid, url: `http://127.0.0.1:${w.port}/?ccr_web_token=t` }),
    );
    const done = () => {
      server.stop();
      victim.kill();
    };
    return { w, places, victim, done };
  }

  test("a live pid in service.json is not CCR: the port is foreign, ensure is blocked, nothing is signalled", async () => {
    const { w, places, victim, done } = await staleWorld();
    try {
      setMode(w, "stop-ignored");
      const address = `http://127.0.0.1:${w.port}`;
      expect(await daemonState(places.ccrHome, address)).toBe("foreign");
      const ensured = await prepareRouted(ROUTE, places, w.env);
      expect(ensured.code).toBe("blocked");
      expect(await takeDown({ env: w.env, ccrHome: places.ccrHome, address })).toBe(false);
      await sleep(300);
      expect(victim.exitCode).toBeNull();
      expect(victim.signalCode).toBeNull();
    } finally {
      done();
    }
  });

  test("a service.json that names no url proves nothing, whatever its pid", async () => {
    const { w, places, victim, done } = await staleWorld();
    try {
      writeFileSync(join(places.ccrHome, "service.json"), JSON.stringify({ pid: victim.pid }));
      expect(await daemonState(places.ccrHome, `http://127.0.0.1:${w.port}`)).toBe("foreign");
    } finally {
      done();
    }
  });

  test("the daemon that answers as CCR is CCR's, and takeDown stops it", async () => {
    const w = makeWorld({ settings: {} });
    const places = placesOf(w.env);
    const ensured = await prepareRouted(ROUTE, places, w.env);
    expect(ensured.code).toBe("ok");
    const address = ensured.data?.gateway.address ?? "";
    expect(await daemonState(places.ccrHome, address)).toBe("ccr");
    expect(await takeDown({ env: w.env, ccrHome: places.ccrHome, address })).toBe(true);
  });
});
