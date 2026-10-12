// What the hook refuses, as one pure function over a command line.

export interface Refusal {
  readonly command: string;
  readonly reason: string;
}

const WRAPPER_HINT =
  "Use `qsm-secrets pipe <key> -- <cmd>` or `qsm-secrets env <key>=<VAR> -- <cmd>` instead: the value reaches the command without reaching this transcript.";

/** `get` writes to descriptor 3 because the caller has to open it. */
const CHANNEL_REDIRECT = /\b3>\s*(&[12]|\/dev\/(stdout|stderr|fd\/[12]))/;

/** Files whose whole content is a credential. A reader pointed at one of
 * them puts it in the tool result as surely as a vault read does. */
const SECRET_FILES: readonly RegExp[] = [
  /(^|\/)\.env(\.[^/]*)?$/,
  /(^|\/)\.netrc$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.pgpass$/,
  /(^|\/)\.git-credentials$/,
  /(^|\/)\.ssh\/id_[^/]+$/,
  /(^|\/)\.aws\/credentials$/,
  /(^|\/)credentials(\.json)?$/,
  /\.(pem|key|p12|pfx)$/,
];

/** Readers that print a file to stdout. Not an exhaustive list of ways to
 * read a file, and not meant to be. */
const FILE_READERS: ReadonlySet<string> = new Set(["cat", "bat", "head", "tail", "less", "more"]);

/** A word as the shell would have handed it on: quotes off, so
 * `cat "$HOME/.env"` matches the same rule as `cat ~/.env`. */
function unquote(word: string): string {
  const quoted = /^(['"])(.*)\1$/.exec(word);
  return quoted?.[2] ?? word;
}

/** Leading `FOO=bar` assignments belong to the environment, not the
 * command, so they are dropped before the first word is read. */
function words(segment: string): string[] {
  const parts = segment
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map(unquote);
  let start = 0;
  while (start < parts.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(parts[start] ?? "")) {
    start += 1;
  }
  return parts.slice(start);
}

function refuseValueRead(tool: string, verb: string): Refusal {
  return {
    command: `${tool} ${verb}`,
    reason: `[qsm-secrets] \`${tool} ${verb}\` prints a credential to stdout, which lands in this tool result. ${WRAPPER_HINT}`,
  };
}

function vaultRefusal(parts: readonly string[]): Refusal | null {
  const [tool, verb] = parts;
  if (tool === undefined || verb === undefined) {
    return null;
  }
  // `--help` is documentation, not a read.
  if (parts.includes("--help") || parts.includes("-h")) {
    return null;
  }
  // Stores and removals move a value into or out of the vault without ever
  // printing one, so they stay allowed.
  if ((tool === "rbw" || tool === "bw") && verb === "get") {
    return refuseValueRead(tool, verb);
  }
  if (tool === "secret-tool" && (verb === "lookup" || verb === "search")) {
    return refuseValueRead(tool, verb);
  }
  if (tool === "pass" && verb === "show") {
    return refuseValueRead(tool, verb);
  }
  return null;
}

function fileRefusal(parts: readonly string[]): Refusal | null {
  const [tool] = parts;
  if (tool === undefined || !FILE_READERS.has(tool)) {
    return null;
  }
  for (const argument of parts.slice(1)) {
    if (argument.startsWith("-")) {
      continue;
    }
    if (SECRET_FILES.some((pattern) => pattern.test(argument))) {
      return {
        command: `${tool} ${argument}`,
        reason: `[qsm-secrets] \`${tool} ${argument}\` would put a credential file in this tool result. ${WRAPPER_HINT}`,
      };
    }
  }
  return null;
}

function channelRefusal(command: string): Refusal | null {
  const redirect = CHANNEL_REDIRECT.exec(command)?.[0];
  if (redirect === undefined) {
    return null;
  }
  return {
    command: redirect,
    reason: `[qsm-secrets] \`${redirect}\` points the escape-hatch descriptor back at this tool result, which is the one place the value must not land. ${WRAPPER_HINT}`,
  };
}

/** The refusal for a command line, or null when nothing in it reads a value. */
export function blockedCommand(command: string): Refusal | null {
  const redirected = channelRefusal(command);
  if (redirected !== null) {
    return redirected;
  }
  for (const segment of command.split(/[\n;|&]+/)) {
    const parts = words(segment);
    const refusal = vaultRefusal(parts) ?? fileRefusal(parts);
    if (refusal !== null) {
      return refusal;
    }
  }
  return null;
}
