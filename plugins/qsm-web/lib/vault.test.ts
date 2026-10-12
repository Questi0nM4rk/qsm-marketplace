import { describe, expect, test } from "bun:test";
import { chooseVaultCli, readValue, VaultError, vaultCommand } from "./vault.ts";

describe("chooseVaultCli", () => {
  test("the named client is taken as given", () => {
    expect(chooseVaultCli({ QSM_BITWARDEN_CLI: "bw" }, () => false)).toBe("bw");
  });

  test("an unknown name is refused rather than guessed around", () => {
    expect(chooseVaultCli({ QSM_BITWARDEN_CLI: "pass" }, () => true)).toBeNull();
  });

  test("with nothing named, the agent-backed client leads", () => {
    expect(chooseVaultCli({}, () => true)).toBe("rbw");
    expect(chooseVaultCli({}, (cmd) => cmd === "bw")).toBe("bw");
    expect(chooseVaultCli({}, () => false)).toBeNull();
  });
});

describe("vaultCommand", () => {
  test("the password is the default field for both clients", () => {
    expect(vaultCommand("rbw", "an-entry")).toEqual(["get", "an-entry"]);
    expect(vaultCommand("bw", "an-entry")).toEqual(["get", "password", "an-entry", "--raw"]);
  });

  test("another field is asked for by name", () => {
    expect(vaultCommand("rbw", "an-entry", "username")).toEqual([
      "get",
      "--field",
      "username",
      "an-entry",
    ]);
    expect(vaultCommand("bw", "an-entry", "totp")).toEqual(["get", "totp", "an-entry", "--raw"]);
  });
});

describe("readValue", () => {
  test("the value comes back without its trailing newline", () => {
    const value = readValue(
      "rbw",
      () => ({ status: 0, stdout: "the-value\n", stderr: "" }),
      "an-entry",
    );
    expect(value).toBe("the-value");
  });

  test("a locked vault fails with the client's own reason and how to unlock", () => {
    try {
      readValue("rbw", () => ({ status: 1, stdout: "", stderr: "vault is locked\n" }), "an-entry");
      expect.unreachable("a locked vault must fail");
    } catch (err) {
      expect(err).toBeInstanceOf(VaultError);
      expect((err as VaultError).message).toContain("vault is locked");
      expect((err as VaultError).message).toContain("rbw unlock");
    }
  });

  test("an empty answer is a failure, not an empty password", () => {
    expect(() =>
      readValue("bw", () => ({ status: 0, stdout: "\n", stderr: "" }), "an-entry"),
    ).toThrow(VaultError);
  });

  test("the entry name reaches the command, and the value never reaches the message", () => {
    let seen: readonly string[] = [];
    try {
      readValue(
        "bw",
        (_cmd, args) => {
          seen = args;
          return { status: 2, stdout: "", stderr: "not found" };
        },
        "an-entry",
        "username",
      );
    } catch (err) {
      expect((err as VaultError).message).not.toContain("the-value");
    }
    expect(seen).toEqual(["get", "username", "an-entry", "--raw"]);
  });
});
