// A password a page asks for comes from the user's Bitwarden vault, not from the agent.

export type VaultCli = "rbw" | "bw";

export class VaultError extends Error {}

/**
 * Which Bitwarden client to read with: `QSM_BITWARDEN_CLI` when set, else `rbw` (it holds its own
 * unlocked agent), else the official `bw`.
 */
export function chooseVaultCli(
  env: Record<string, string | undefined>,
  probe: (cmd: string) => boolean,
): VaultCli | null {
  const named = env.QSM_BITWARDEN_CLI;
  if (named === "rbw" || named === "bw") {
    return named;
  }
  if (named !== undefined && named.length > 0) {
    return null;
  }
  if (probe("rbw")) {
    return "rbw";
  }
  if (probe("bw")) {
    return "bw";
  }
  return null;
}

/** The read command for one vault entry's field. `field` defaults to the
 * password; `username` and any other field name pass through. */
export function vaultCommand(cli: VaultCli, item: string, field = "password"): string[] {
  if (cli === "rbw") {
    return field === "password" ? ["get", item] : ["get", "--field", field, item];
  }
  return ["get", field, item, "--raw"];
}

/** What a caller must do when the vault is locked. Named here so the bin's
 * message and the documentation cannot drift apart. */
function unlockHint(cli: VaultCli): string {
  return cli === "rbw"
    ? "unlock the vault first: rbw unlock"
    : "unlock the vault first, then pass its session to this command";
}

export type VaultRunner = (
  cmd: string,
  args: readonly string[],
) => { status: number | null; stdout: string; stderr: string };

/** Read one value. */
export function readValue(
  cli: VaultCli,
  runner: VaultRunner,
  item: string,
  field?: string,
): string {
  const out = runner(cli, vaultCommand(cli, item, field));
  if (out.status !== 0) {
    const reason = out.stderr.trim().split("\n")[0] ?? `exit ${out.status ?? "unknown"}`;
    throw new VaultError(`${cli} could not read "${item}": ${reason}. ${unlockHint(cli)}`);
  }
  const value = out.stdout.replace(/\n$/, "");
  if (value.length === 0) {
    throw new VaultError(`${cli} returned nothing for "${item}"`);
  }
  return value;
}
