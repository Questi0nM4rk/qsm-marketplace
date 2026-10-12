// The decision gate.

import { ESTIMATE_NOTE, estimateTokens } from "./estimate.ts";

export interface SizeReport {
  readonly label: string;
  readonly originalChars: number;
  readonly toonChars: number;
  readonly originalTokens: number;
  readonly toonTokens: number;
  readonly ratio: number;
  readonly verdict: string;
  readonly estimated: true;
  readonly note: string;
}

export function sizeReport(label: string, original: string, toon: string): SizeReport {
  const originalChars = original.length;
  const toonChars = toon.length;
  const ratio = originalChars === 0 ? 1 : toonChars / originalChars;
  return {
    label,
    originalChars,
    toonChars,
    originalTokens: estimateTokens(original),
    toonTokens: estimateTokens(toon),
    ratio,
    verdict: verdictOf(ratio),
    estimated: true,
    note: ESTIMATE_NOTE,
  };
}

function verdictOf(ratio: number): string {
  if (ratio < 1) {
    return "TOON is smaller, worth encoding";
  }
  if (ratio > 1) {
    return "TOON is larger, keep the original";
  }
  return "the same size, keep the original";
}

export function formatSizeReport(report: SizeReport): string {
  return [
    `input:     ${report.label}`,
    `original:  ${report.originalChars} chars  (~${report.originalTokens} tokens)`,
    `toon:      ${report.toonChars} chars  (~${report.toonTokens} tokens)`,
    `ratio:     ${report.ratio.toFixed(2)}x  (${report.verdict})`,
    "",
    `note: ${report.note}`,
  ].join("\n");
}
