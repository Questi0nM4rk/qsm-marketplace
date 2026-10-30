// Static fixes run before a file is scored, so a defect a tool can rewrite away is never a finding.
// One list, one step: each fixer rewrites the files it covers in place, with the tool's safe fix
// mode only (never oxlint --fix-dangerously, never a fixer that deletes code). A fixer whose binary is not on
// PATH is skipped and the checker reports as before. The edit hook and the pre-commit gate both
// call `fixFiles`; a new fixer is one more entry here.

import { spawnSync } from "node:child_process";
import { languageEnabled, readGatesConfig } from "./config.ts";
import { isMarkdown, rewrapMarkdown } from "./markdown-wrap.ts";
import { type Language, RUSTFMT, SHFMT_STYLE } from "./registry.ts";

interface Fixer {
  readonly language: Language;
  readonly covers: (path: string) => boolean;
  /** Rewrites `files` (relative to root) in place; false when it could not run. */
  readonly fix: (root: string, files: readonly string[]) => boolean;
}

/** A fixer that runs `command... files`. Its exit status is ignored: a tool exits non-zero for what
 * it could not fix, which the checker then reports. Only a binary that cannot spawn is "not run". */
function tool(language: Language, extensions: RegExp, command: readonly string[]): Fixer {
  const [binary = "", ...args] = command;
  return {
    language,
    covers: (path) => extensions.test(path),
    fix: (root, files) =>
      files.length > 0 &&
      spawnSync(binary, [...args, ...files], { cwd: root, stdio: "ignore" }).error === undefined,
  };
}

const FIXERS: readonly Fixer[] = [
  { language: "docs", covers: isMarkdown, fix: rewrapMarkdown },
  tool("docs", /\.(md|markdown)$/i, ["markdownlint-cli2", "--fix"]),
  tool("ts", /\.(tsx?|jsx?|mjs|cjs)$/, ["oxlint", "--fix"]),
  tool("ts", /\.(tsx?|jsx?|mjs|cjs|jsonc?)$/, ["oxfmt"]),
  tool("py", /\.pyi?$/, ["ruff", "check", "--fix"]),
  tool("py", /\.pyi?$/, ["ruff", "format"]),
  tool("shell", /\.(sh|bash)$/, ["shfmt", ...SHFMT_STYLE, "-w"]),
  tool("zsh", /\.zsh$/, ["shfmt", "-ln=zsh", ...SHFMT_STYLE, "-w"]),
  tool("fish", /\.fish$/, ["fish_indent", "-w"]),
  tool("rust", /\.rs$/, ["rustfmt", "--edition", String(RUSTFMT.edition)]),
];

/** Runs every fixer over the files it covers, for the languages the repository gates; returns the
 * files some fixer ran on, which the caller re-stages when it is a commit. */
export function fixFiles(root: string, files: readonly string[]): string[] {
  const { languages } = readGatesConfig(root);
  const fixed = new Set<string>();
  for (const fixer of FIXERS) {
    if (!languageEnabled(fixer.language, languages)) {
      continue;
    }
    const mine = files.filter(fixer.covers);
    if (fixer.fix(root, mine)) {
      for (const f of mine) {
        fixed.add(f);
      }
    }
  }
  return [...fixed];
}

/** True when some fixer of an enabled language covers the file. */
export function isFixable(root: string, file: string): boolean {
  const { languages } = readGatesConfig(root);
  return FIXERS.some((f) => languageEnabled(f.language, languages) && f.covers(file));
}
