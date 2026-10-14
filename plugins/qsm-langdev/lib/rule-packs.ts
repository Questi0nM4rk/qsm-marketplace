// Rule packs a checker would pull over the network on every run (semgrep's `p/<pack>`, and a single
// rule, `r/<id>`), fetched once per run into a local file, plus our own rules (`qsm/<language>`),
// written from the binary.

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { errorMessage } from "./json.ts";
import { OWN_RULES } from "./rules-data.ts";

/** The scratch directory a run fetches its packs into is named with this,
 * and a fresh suffix every run. */
export const PACKS_SCRATCH_PREFIX = "qsm-langdev-packs-";

/**
 * semgrep names a rule read from a local file after the file's directory, dotted:
 * `tmp.qsm-langdev-packs-rkLWPy.python.lang.x`.
 */
const SCRATCH_IN_RULE_ID = new RegExp(`^.*?${PACKS_SCRATCH_PREFIX}[^.]+\\.`);

/** The id of the rule semgrep reported as `checkId`. */
export function ruleIdOf(checkId: string): string {
  return checkId.replace(SCRATCH_IN_RULE_ID, "");
}

/** Answers a pack's rules as text, or throws naming why it could not. */
export type FetchPack = (pack: string) => Promise<string>;

const REGISTRY_URL = "https://semgrep.dev/c/";
const FETCH_TIMEOUT_MS = 15_000;

/**
 * The pack as semgrep itself resolves `--config p/<pack>`: one YAML document of rules from its
 * registry.
 */
export const fetchFromRegistry: FetchPack = async (pack) => {
  const response = await fetch(`${REGISTRY_URL}${pack}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
};

/** Names our own rules, shipped in the binary from the plugin's
 * rules/<language>.yaml: `qsm/bash`. */
const OWN_RULES_PREFIX = "qsm/";

/** A pack's text: our own rules from the binary, anything else from
 * `fetchPack`. */
function rulesText(pack: string, fetchPack: FetchPack): Promise<string> {
  if (!pack.startsWith(OWN_RULES_PREFIX)) {
    return fetchPack(pack);
  }
  const language = pack.slice(OWN_RULES_PREFIX.length);
  const text = OWN_RULES[language];
  return text === undefined
    ? Promise.reject(new Error(`qsm-langdev ships no rules/${language}.yaml`))
    : Promise.resolve(text);
}

/** One pack after the run tried to fetch it. */
export type ResolvedPack = { path: string; hash: string } | { reason: string };

/** Every one of `packs` fetched once into `dir`, by name; our own rules are
 * written from the binary the same way, so they are keyed the same way. */
export async function resolvePacks(
  packs: readonly string[],
  dir: string,
  fetchPack: FetchPack,
): Promise<Map<string, ResolvedPack>> {
  const unique = [...new Set(packs)];
  const resolved = await Promise.all(
    unique.map(async (pack, index): Promise<[string, ResolvedPack]> => {
      try {
        const text = await rulesText(pack, fetchPack);
        if (text.trim() === "") {
          throw new Error("the answer was empty");
        }
        const path = join(dir, `${index}.yaml`);
        writeFileSync(path, text);
        return [pack, { path, hash: createHash("sha256").update(text).digest("hex") }];
      } catch (error) {
        return [pack, { reason: `${pack} could not be fetched: ${errorMessage(error)}` }];
      }
    }),
  );
  return new Map(resolved);
}
