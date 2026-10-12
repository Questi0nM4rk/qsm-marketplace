import { describe, expect, test } from "bun:test";
import {
  CONTAINER_PORT,
  chooseRuntime,
  execDefinition,
  IMAGE,
  instanceName,
  LABEL,
  liveViewUrl,
  outDir,
  PORT_HIGH,
  PORT_LOW,
  parseInstances,
  pickPort,
  renderCommand,
  runDefinition,
  stopDefinition,
} from "./browserbox.ts";

describe("chooseRuntime", () => {
  const both = (): boolean => true;
  const none = (): boolean => false;

  test("the named runtime is taken as given", () => {
    expect(chooseRuntime({ QSM_CONTAINER_RUNTIME: "podman" }, none)).toBe("podman");
  });

  test("a name that is neither is refused rather than guessed around", () => {
    expect(chooseRuntime({ QSM_CONTAINER_RUNTIME: "lxc" }, both)).toBeNull();
  });

  test("with nothing named, docker leads and podman follows", () => {
    expect(chooseRuntime({}, both)).toBe("docker");
    expect(chooseRuntime({}, (cmd) => cmd === "podman")).toBe("podman");
    expect(chooseRuntime({}, none)).toBeNull();
  });
});

describe("ports and names", () => {
  test("the lowest free port in the block is taken", () => {
    expect(pickPort([])).toBe(PORT_LOW);
    expect(pickPort([PORT_LOW, PORT_LOW + 1])).toBe(PORT_LOW + 2);
  });

  test("a full block is null, not an out-of-range port", () => {
    const all = Array.from({ length: PORT_HIGH - PORT_LOW + 1 }, (_, i) => PORT_LOW + i);
    expect(pickPort(all)).toBeNull();
  });

  test("the name carries the port, and the live view is on loopback", () => {
    expect(instanceName(11_000)).toBe("bbox-11000");
    expect(liveViewUrl(11_000)).toBe("http://127.0.0.1:11000/");
  });
});

describe("parseInstances", () => {
  test("each line becomes an instance with its live view", () => {
    expect(parseInstances("bbox-11000 11000\nbbox-11001 11001\n")).toEqual([
      { name: "bbox-11000", port: 11_000, liveView: "http://127.0.0.1:11000/" },
      { name: "bbox-11001", port: 11_001, liveView: "http://127.0.0.1:11001/" },
    ]);
  });

  test("noise and blank lines are dropped", () => {
    expect(parseInstances("\nheader line here\n")).toEqual([]);
  });
});

describe("runDefinition", () => {
  const argv = runDefinition({
    name: "bbox-11000",
    port: 11_000,
    outDir: "/srv/out/bbox-11000",
    liveView: "http://127.0.0.1:11000/",
  });

  test("the instance is detached, named, labelled and ephemeral", () => {
    expect(argv[0]).toBe("run");
    expect(argv).toContain("--detach");
    expect(argv).toContain("--rm");
    expect(argv).toContain("bbox-11000");
    expect(argv).toContain(`${LABEL}=1`);
    expect(argv.at(-1)).toBe(IMAGE);
  });

  test("only the live-view port is published, and only on loopback", () => {
    expect(argv).toContain(`127.0.0.1:11000:${CONTAINER_PORT}`);
    expect(argv.join(" ")).not.toContain("0.0.0.0:");
  });

  test("nothing of the host display reaches the container", () => {
    const line = argv.join(" ");
    expect(line).not.toContain("/tmp/.X11-unix");
    expect(line).not.toContain("DISPLAY=");
  });

  test("the artifact directory is mounted and shared memory is raised", () => {
    expect(argv).toContain("/srv/out/bbox-11000:/out");
    expect(argv).toContain("--shm-size=2g");
    expect(argv).toContain("QSM_BROWSERBOX_LIVE_VIEW=http://127.0.0.1:11000/");
  });
});

describe("the other definitions", () => {
  test("a job reaches the driver on its standard input", () => {
    const argv = execDefinition("bbox-11000");
    expect(argv).toEqual([
      "exec",
      "--interactive",
      "bbox-11000",
      "/opt/venv/bin/python",
      "/opt/driver/ctl.py",
    ]);
  });

  test("Stop an instance", () => {
    expect(stopDefinition("bbox-11000")).toEqual(["rm", "--force", "bbox-11000"]);
  });
});

describe("outDir", () => {
  test("the override wins over the cache default", () => {
    expect(outDir({ QSM_BROWSERBOX_OUT: "/srv/out" }, "/home/one", "bbox-11000")).toBe(
      "/srv/out/bbox-11000",
    );
    expect(outDir({}, "/home/one", "bbox-11000")).toBe(
      "/home/one/.cache/qsm-browserbox/bbox-11000",
    );
  });
});

describe("renderCommand", () => {
  test("a value with a space is quoted so the line can be pasted", () => {
    expect(renderCommand("docker", ["run", "--name", "a b"])).toBe("docker run --name 'a b'");
  });
});
