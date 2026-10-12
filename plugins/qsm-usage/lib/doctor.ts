// Is each of the three binaries actually usable?

export const FILTER_BIN_ENV = "QSM_FILTER_BIN";
export const DEFAULT_FILTER_BIN = "rtk";

export interface BinProbe {
  readonly bin: string;
  readonly role: string;
  /** what to run so the binary proves it starts */
  readonly probe: readonly string[];
}

interface BinStatus extends BinProbe {
  readonly usable: boolean;
  /** the first line the binary answered; never guessed */
  readonly answer: string | null;
}

export interface DoctorReport {
  readonly bins: readonly BinStatus[];
  readonly allUsable: boolean;
}

/** Runs `<bin> <args>`. Returns its first line of output, or null when the
 * binary is missing or would not answer. */
export type Answer = (bin: string, args: readonly string[]) => string | null;

export function filterBin(env: Record<string, string | undefined>): string {
  const named = env[FILTER_BIN_ENV];
  return named === undefined || named.length === 0 ? DEFAULT_FILTER_BIN : named;
}

export function probeList(env: Record<string, string | undefined>): BinProbe[] {
  return [
    { bin: "qsm-usage", role: "token measurement, TOON, review report", probe: ["--help"] },
    { bin: filterBin(env), role: "command output filter", probe: ["--version"] },
  ];
}

export function checkBins(probes: readonly BinProbe[], answer: Answer): DoctorReport {
  const bins = probes.map((probe) => {
    const found = answer(probe.bin, probe.probe);
    return { ...probe, usable: found !== null, answer: found };
  });
  return { bins, allUsable: bins.every((b) => b.usable) };
}

export function formatDoctorReport(report: DoctorReport): string {
  return report.bins
    .map((b) =>
      b.usable
        ? `usable      ${b.bin}  ${b.answer ?? ""}  (${b.role})`
        : `not usable  ${b.bin}  (${b.role}): not on PATH`,
    )
    .join("\n");
}
