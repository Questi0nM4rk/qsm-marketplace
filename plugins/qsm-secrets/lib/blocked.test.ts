import { describe, expect, test } from "bun:test";
import { blockedCommand } from "./blocked.ts";

describe("blockedCommand refuses a direct value read", () => {
  test.each([
    "rbw get github-token",
    "bw get password github",
    "secret-tool lookup service qsm key token",
    "secret-tool search --all service qsm",
    "pass show work/token",
  ])("%s", (command) => {
    const refusal = blockedCommand(command);
    expect(refusal).not.toBeNull();
    expect(refusal?.reason).toContain("qsm-secrets pipe");
  });

  test("a read hidden behind a pipe or a chain is still a read", () => {
    expect(blockedCommand("echo hi && rbw get token")).not.toBeNull();
    expect(blockedCommand("rbw get token | tr -d '\\n'")).not.toBeNull();
    expect(blockedCommand("FOO=bar rbw get token")).not.toBeNull();
  });

  test.each([
    "qsm-secrets get github-token 3>&1",
    "qsm-secrets get github-token 3>&2",
    "qsm-secrets get github-token 3> /dev/stdout",
    "qsm-secrets get github-token 3>/dev/fd/1",
  ])("the escape hatch pointed back at output: %s", (command) => {
    const refusal = blockedCommand(command);
    expect(refusal).not.toBeNull();
    expect(refusal?.reason).toContain("qsm-secrets pipe");
  });

  test("a credential file handed to a reader is refused", () => {
    expect(blockedCommand("cat .env")).not.toBeNull();
    expect(blockedCommand("cat /home/me/.ssh/id_ed25519")).not.toBeNull();
    expect(blockedCommand('head -n 5 "$HOME/.netrc"')).not.toBeNull();
    expect(blockedCommand("cat ~/.aws/credentials")).not.toBeNull();
    expect(blockedCommand("cat certs/server.pem")).not.toBeNull();
  });
});

describe("blockedCommand lets the rest through", () => {
  test.each([
    "rbw list",
    "rbw add github-token qsm-secrets",
    "rbw remove github-token",
    "rbw sync",
    "rbw get --help",
    "secret-tool store --label x service qsm key token",
    "secret-tool clear service qsm key token",
    "qsm-secrets pipe github-token -- gh auth login --with-token",
    "qsm-secrets env npm-token=NPM_TOKEN -- npm publish",
    "qsm-secrets get deploy-key 3>/tmp/deploy.key",
    "qsm-secrets get deploy-key 3>&-",
    "cat README.md",
    "cat src/env.ts",
    "git status",
  ])("%s", (command) => {
    expect(blockedCommand(command)).toBeNull();
  });
});
