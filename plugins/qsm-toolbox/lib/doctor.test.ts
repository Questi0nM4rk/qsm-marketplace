import { expect, test } from "bun:test";
import { TOOLS } from "./catalog.ts";
import { lines, type Prober, statuses } from "./doctor.ts";

function prober(missing: readonly string[], version = "1.0.0"): Prober {
  return {
    onPath: (bin) => !missing.includes(bin),
    version: () => version,
  };
}

test("Two tools missing", () => {
  const report = statuses(prober(["hurl", "usql"]));
  const printed = lines(report);
  expect(printed).toHaveLength(TOOLS.length);
  expect(printed.filter((line) => line.startsWith("present"))).toHaveLength(TOOLS.length - 2);
  expect(printed).toContain("missing  hurl (install: sudo pacman -S hurl)");
  expect(printed).toContain("missing  usql (install: yay -S usql)");
});

test("a present tool with no version flag still reports present", () => {
  const silent: Prober = { onPath: () => true, version: () => null };
  expect(lines(statuses(silent))).toContain("present  lightrag-server");
});

test("a missing tool carries no version", () => {
  const report = statuses(prober(["yq"]));
  expect(report.find((status) => status.bin === "yq")).toEqual({
    bin: "yq",
    present: false,
    version: null,
    install: "go install github.com/mikefarah/yq/v4@latest",
  });
});
