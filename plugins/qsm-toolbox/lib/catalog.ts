// The one table.

export interface Tool {
  /** The binary on PATH. Not the package name, which often differs. */
  readonly bin: string;
  /** At most four words. This is what the always-loaded description carries. */
  readonly blurb: string;
  /** The exact line a person types. Shown by the skill, by the doctor when
   * the tool is missing, and as the suggestion when we refuse to run it. */
  readonly install: string;
  /** The command `install` needs before it can work, and where to get it. */
  readonly prereq: string;
  readonly prereqHint: string;
  /**
   * Argv the installer executes, or null when the tool is suggested and never run: a system
   * package manager, anything under sudo, or a download nobody here can check.
   */
  readonly run: readonly string[] | null;
  /** What prints the version. Presence is decided by `command -v`, never by
   * this, so a tool with no version flag still reports present. */
  readonly versionArgs: readonly string[];
  /** Ours, not upstream's. Null when we have nothing to add. */
  readonly caveat: string | null;
}

const BUN_HINT = "install bun first: https://bun.sh";
const UV_HINT = "install uv first: https://docs.astral.sh/uv/";
const PIPX_HINT = "install pipx first: https://pipx.pypa.io/";
const GO_HINT = "install Go first: https://go.dev/dl/";
const CURL_HINT = "install curl first, through the system package manager";
const VERSION = ["--version"] as const;

/** `go install` lands in $GOBIN, which is rarely on PATH. Every row with this
 * prerequisite gets its binary linked into the bin directory afterwards. */
export const GO_PREREQ = "go";

export const TOOLS: readonly Tool[] = [
  {
    bin: "ast-grep",
    blurb: "AST code rewrite",
    install: "bun add -g @ast-grep/cli",
    prereq: "bun",
    prereqHint: BUN_HINT,
    run: ["bun", "add", "-g", "@ast-grep/cli"],
    versionArgs: VERSION,
    caveat: "the short alias `sg` is an unrelated system command, never use it",
  },
  {
    bin: "acli",
    blurb: "Jira Confluence CLI",
    install:
      "curl -LO https://acli.atlassian.com/linux/latest/acli_linux_amd64/acli && chmod +x acli && mv acli ~/.local/bin/acli",
    prereq: "curl",
    prereqHint: CURL_HINT,
    run: null,
    versionArgs: VERSION,
    caveat:
      "invoke Confluence as `confluence-cli`, never the `confluence` alias the same package installs, a local script may already own that name",
  },
  {
    bin: "br",
    blurb: "beads issue tracker",
    install: "claude plugin install qsm-tasks",
    prereq: "claude",
    prereqHint: "qsm-tasks owns installing br",
    run: null,
    versionArgs: ["version"],
    caveat: "`br` is the Rust tracker; the Go tool of the same name is `bd`, never mix them",
  },
  {
    bin: "comby",
    blurb: "structural rewrite",
    install:
      "curl -L -o ~/.local/bin/comby https://github.com/comby-tools/comby/releases/download/1.8.1/comby-1.8.1-x86_64-linux && chmod +x ~/.local/bin/comby",
    prereq: "curl",
    prereqHint: CURL_HINT,
    run: null,
    versionArgs: ["-version"],
    caveat: "on Arch, `libpcre.so.3` is absent; install `libpcre` and symlink `.so.1` to `.so.3`",
  },
  {
    bin: "graphify",
    blurb: "dependency graph",
    install: "uv tool install graphifyy",
    prereq: "uv",
    prereqHint: UV_HINT,
    run: ["uv", "tool", "install", "graphifyy"],
    versionArgs: VERSION,
    caveat: null,
  },
  {
    bin: "git-cliff",
    blurb: "changelog",
    install: "bun add -g git-cliff",
    prereq: "bun",
    prereqHint: BUN_HINT,
    run: ["bun", "add", "-g", "git-cliff"],
    versionArgs: VERSION,
    caveat:
      "preview the range (`--unreleased`) before writing a file, and never commit a `cliff.toml` into this marketplace; a repository that wants one owns it",
  },
  {
    bin: "gws",
    blurb: "Google Workspace",
    install: "bun add -g @googleworkspace/cli",
    prereq: "bun",
    prereqHint: BUN_HINT,
    run: ["bun", "add", "-g", "@googleworkspace/cli"],
    versionArgs: VERSION,
    caveat: null,
  },
  {
    bin: "hurl",
    blurb: "HTTP test files",
    install: "sudo pacman -S hurl",
    prereq: "pacman",
    prereqHint: "on another system: brew install hurl, dnf install hurl, or cargo install hurl",
    run: null,
    versionArgs: VERSION,
    caveat: null,
  },
  {
    bin: "instaloader",
    blurb: "Instagram download",
    install: "uv tool install instaloader",
    prereq: "uv",
    prereqHint: UV_HINT,
    run: ["uv", "tool", "install", "instaloader"],
    versionArgs: VERSION,
    caveat: null,
  },
  {
    bin: "jc",
    blurb: "CLI output to JSON",
    install: "uv tool install jc",
    prereq: "uv",
    prereqHint: UV_HINT,
    run: ["uv", "tool", "install", "jc"],
    versionArgs: VERSION,
    caveat: null,
  },
  {
    bin: "lightrag-server",
    blurb: "graph RAG",
    install: "uv tool install lightrag-hku",
    prereq: "uv",
    prereqHint: UV_HINT,
    run: ["uv", "tool", "install", "lightrag-hku"],
    versionArgs: VERSION,
    caveat:
      "a multi-GB footprint and no query succeeds until an LLM backend key or endpoint is configured",
  },
  {
    bin: "lizard",
    blurb: "complexity ranking",
    install: "pipx install lizard",
    prereq: "pipx",
    prereqHint: PIPX_HINT,
    run: ["pipx", "install", "lizard"],
    versionArgs: VERSION,
    caveat: null,
  },
  {
    bin: "mlr",
    blurb: "CSV JSON reshaping",
    install: "go install github.com/johnkerl/miller/v6/cmd/mlr@latest",
    prereq: GO_PREREQ,
    prereqHint: GO_HINT,
    run: ["go", "install", "github.com/johnkerl/miller/v6/cmd/mlr@latest"],
    versionArgs: VERSION,
    caveat: null,
  },
  {
    bin: "opencli",
    blurb: "websites as CLIs",
    install: "bun add -g @jackwener/opencli",
    prereq: "bun",
    prereqHint: BUN_HINT,
    run: ["bun", "add", "-g", "@jackwener/opencli"],
    versionArgs: VERSION,
    caveat: null,
  },
  {
    bin: "opensrc",
    blurb: "dependency source",
    install: "bun add -g opensrc",
    prereq: "bun",
    prereqHint: BUN_HINT,
    run: ["bun", "add", "-g", "opensrc"],
    versionArgs: VERSION,
    caveat: null,
  },
  {
    bin: "readable",
    blurb: "page to article",
    install: "bun add -g readability-cli",
    prereq: "bun",
    prereqHint: BUN_HINT,
    run: ["bun", "add", "-g", "readability-cli"],
    versionArgs: VERSION,
    caveat: null,
  },
  {
    bin: "scc",
    blurb: "code size",
    install: "go install github.com/boyter/scc/v3@latest",
    prereq: GO_PREREQ,
    prereqHint: GO_HINT,
    run: ["go", "install", "github.com/boyter/scc/v3@latest"],
    versionArgs: VERSION,
    caveat: null,
  },
  {
    bin: "semble",
    blurb: "semantic search",
    install: "uv tool install semble",
    prereq: "uv",
    prereqHint: UV_HINT,
    run: ["uv", "tool", "install", "semble"],
    versionArgs: VERSION,
    caveat:
      "a grep-trained agent tends to re-search after semble answers; trust the ranked chunks first",
  },
  {
    bin: "semgrep",
    blurb: "pattern code scan",
    install: "pipx install semgrep",
    prereq: "pipx",
    prereqHint: PIPX_HINT,
    run: ["pipx", "install", "semgrep"],
    versionArgs: VERSION,
    caveat:
      "`--autofix` rewrites source, never run it against an uncommitted tree; registry rules pull metrics",
  },
  {
    bin: "usql",
    blurb: "all databases",
    install: "yay -S usql",
    prereq: "yay",
    prereqHint:
      "on another system: brew install xo/xo/usql, or go install github.com/xo/usql@latest",
    run: null,
    versionArgs: VERSION,
    caveat: null,
  },
  {
    bin: "yq",
    blurb: "YAML TOML jq",
    install: "go install github.com/mikefarah/yq/v4@latest",
    prereq: GO_PREREQ,
    prereqHint: GO_HINT,
    run: ["go", "install", "github.com/mikefarah/yq/v4@latest"],
    versionArgs: VERSION,
    caveat:
      "this is mikefarah/yq (Go); kislyuk/yq (Python) shares the name and has a different syntax",
  },
];

/** A CLI another qsm plugin ships. */
export interface QsmBin {
  readonly bin: string;
  readonly blurb: string;
}

export const QSM_BINS: readonly QsmBin[] = [
  {
    bin: "qsm-book-to-skill",
    blurb: "document to skill",
  },
  {
    bin: "qsm-forge",
    blurb: "PR, MR threads",
  },
  {
    bin: "qsm-index",
    blurb: "code index",
  },
  {
    bin: "qsm-knowledge",
    blurb: "knowledge checks",
  },
  {
    bin: "qsm-langdev",
    blurb: "language gates",
  },
  {
    bin: "qsm-memory",
    blurb: "past sessions",
  },
  {
    bin: "qsm-openspec",
    blurb: "OpenSpec doctor",
  },
  {
    bin: "qsm-secrets",
    blurb: "secrets without values",
  },
  {
    bin: "qsm-statusline",
    blurb: "status line",
  },
  {
    bin: "qsm-uix",
    blurb: "screen measurements",
  },
  {
    bin: "qsm-usage",
    blurb: "usage report, TOON",
  },
  {
    bin: "qsm-web",
    blurb: "fetch, search, browser",
  },
];

/** The environment variable that skips one tool: `QSM_AST_GREP_SKIP=1`. */
export function skipKey(bin: string): string {
  return `QSM_${bin.toUpperCase().replaceAll(/[^A-Z0-9]/g, "_")}_SKIP`;
}
