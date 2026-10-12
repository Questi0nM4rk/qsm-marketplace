// A closed set of shapes common secrets take. Each pattern matches the secret value itself, so a
// reader can say "this looks secret" (qsm-memory) and another can cut the value out (qsm-secrets).

export interface Span {
  readonly start: number;
  readonly end: number;
}

const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["aws-access-key", /AKIA[0-9A-Z]{16}/g],
  ["api-key", /(?<=api[_-]?key\s*[:=]\s*)\S{16,}/gi],
  ["jwt", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g],
  [
    "private-key",
    /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)?/g,
  ],
  ["github-token", /gh[pousr]_[A-Za-z0-9]{36,}/g],
  ["github-pat", /github_pat_[A-Za-z0-9_]{20,}/g],
  ["slack-token", /xox[baprs]-[A-Za-z0-9-]{10,}/g],
  ["connection-string", /(?<=:\/\/[^/\s:]+:)[^@\s]+(?=@)/g],
  ["stripe-live-key", /sk_live_[A-Za-z0-9]{10,}/g],
  ["google-api-key", /AIza[0-9A-Za-z_-]{35}/g],
  ["npm-token", /npm_[A-Za-z0-9]{36}/g],
  ["secret-key", /sk-[A-Za-z0-9_-]{20,}/g],
];

/** The pattern name that matched, or null when nothing looks secret. */
export function looksLikeSecret(text: string): string | null {
  for (const [name, pattern] of PATTERNS) {
    if (text.search(pattern) !== -1) {
      return name;
    }
  }
  return null;
}

/** Where every known shape sits in the text; spans may overlap each other. */
export function shapeSpans(text: string): Span[] {
  return PATTERNS.flatMap(([, pattern]) =>
    [...text.matchAll(pattern)].map((m) => ({ start: m.index, end: m.index + m[0].length })),
  );
}
