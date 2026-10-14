// How `doctor` prints the backend's checks.

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  /** The step that fixes it, or null when it passed. */
  readonly fix: string | null;
}

export function formatChecks(checks: readonly Check[]): string {
  const lines: string[] = [];
  for (const check of checks) {
    lines.push(`${check.ok ? "ok  " : "fail"}  ${check.name}: ${check.detail}`);
    if (check.fix !== null) {
      lines.push(`      fix: ${check.fix}`);
    }
  }
  const failed = checks.filter((check) => !check.ok).length;
  lines.push("", failed === 0 ? "every check passed" : `${failed} check(s) need fixing`);
  return lines.join("\n");
}
