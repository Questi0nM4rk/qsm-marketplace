// A consumer's env variable holds one executable path and no arguments, so install links
// `qsm-askpass-<kind>` to the one binary, and the binary reads which link it was run through.

import { basename } from "node:path";
import { PROVIDERS } from "./index.ts";
import { LINK_PREFIX } from "./paths.ts";

/** The kinds that are reached through a link. */
export function linkedKinds(): string[] {
  return Object.entries(PROVIDERS)
    .filter(([, provider]) => provider.env.some(([, value]) => value === "LINK"))
    .map(([kind]) => kind);
}

/**
 * The argv the verb parser reads: when the binary was run as `qsm-askpass-<kind>`, `askpass <kind>
 * -- <the consumer's words>`; otherwise the argv as given.
 */
export function argvFor(argv0: string, argv: readonly string[]): readonly string[] {
  const name = basename(argv0);
  const kind = name.startsWith(LINK_PREFIX) ? name.slice(LINK_PREFIX.length) : undefined;
  return kind !== undefined && linkedKinds().includes(kind)
    ? ["askpass", kind, "--", ...argv]
    : argv;
}

/** The fish lines that point each named kind's variables at its link in `binDir`. */
export function envLines(kinds: readonly string[], binDir: string): string[] {
  return kinds.flatMap((kind) =>
    (PROVIDERS[kind]?.env ?? []).map(
      ([name, value]) =>
        `set -gx ${name} ${value === "LINK" ? `${binDir}/${LINK_PREFIX}${kind}` : value}`,
    ),
  );
}
