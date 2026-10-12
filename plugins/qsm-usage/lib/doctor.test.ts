import { describe, expect, test } from "bun:test";
import {
  checkBins,
  DEFAULT_FILTER_BIN,
  FILTER_BIN_ENV,
  filterBin,
  formatDoctorReport,
  probeList,
} from "./doctor.ts";

const PROBES = probeList({});

describe("doctor", () => {
  test("checks the three binaries the plugin depends on", () => {
    expect(PROBES.map((p) => p.bin)).toEqual(["qsm-usage", DEFAULT_FILTER_BIN]);
  });

  test("our own binary proves itself with --help, the filter with --version", () => {
    expect(PROBES.map((p) => p.probe)).toEqual([["--help"], ["--version"]]);
  });

  test("a present binary is usable and shows what it answered", () => {
    const report = checkBins(PROBES, (bin) => (bin === "qsm-usage" ? "usage: qsm-usage" : null));
    const [toon] = report.bins;
    expect(toon?.usable).toBe(true);
    expect(toon?.answer).toBe("usage: qsm-usage");
    expect(formatDoctorReport(report)).toContain("usable      qsm-usage  usage: qsm-usage");
  });

  test("a missing binary is not usable and answers nothing", () => {
    const report = checkBins(PROBES, () => null);
    expect(report.allUsable).toBe(false);
    for (const bin of report.bins) {
      expect(bin.usable).toBe(false);
      expect(bin.answer).toBeNull();
    }
    expect(formatDoctorReport(report)).not.toContain("usage:");
  });

  test("every binary answering makes the report green", () => {
    expect(checkBins(PROBES, () => "1.0.0").allUsable).toBe(true);
  });

  test("the filter command can be named by the environment", () => {
    expect(filterBin({ [FILTER_BIN_ENV]: "other-filter" })).toBe("other-filter");
    expect(filterBin({ [FILTER_BIN_ENV]: "" })).toBe(DEFAULT_FILTER_BIN);
  });
});
