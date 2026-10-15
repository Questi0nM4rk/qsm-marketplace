// The labelled corpus the capture algorithm is measured on. A case is a prompt and the values a
// correct capture takes out of it: a positive names one, a negative names none. Positives are built
// from a seeded generator so no literal token sits in the repository for a scanner to flag, and the
// same run always yields the same corpus.

export interface Case {
  readonly text: string;
  /** The values that must be captured, exactly; empty for a negative. */
  readonly secrets: readonly string[];
}

const MODULUS = 2_147_483_647;

/** Park-Miller: a fixed sequence for a fixed seed, which is all a corpus needs. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 48_271) % MODULUS;
    return state / MODULUS;
  };
}

const next = seeded(20_261_013);

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = LOWER.toUpperCase();
const DIGITS = "0123456789";
const ALNUM = LOWER + UPPER + DIGITS;
const BASE64 = `${ALNUM}+/`;
const BASE64URL = `${ALNUM}-_`;
const HEX = "0123456789abcdef";
const UPPER_DIGITS = UPPER + DIGITS;

function random(alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(next() * alphabet.length)];
  }
  return out;
}

function part(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function jwt(): string {
  const header = part({ alg: "HS256", typ: "JWT" });
  const payload = part({
    sub: random(DIGITS, 10),
    name: "Test User",
    iat: 1_760_000_000 + Math.floor(next() * 1e6),
  });
  return `${header}.${payload}.${random(BASE64URL, 43)}`;
}

function privateKey(): string {
  const lines = Array.from({ length: 5 }, () => random(BASE64, 64)).join("\n");
  const kind = ["RSA", "PRIVATE"].join(" ");
  return [`-----BEGIN ${kind} KEY-----`, lines, `-----END ${kind} KEY-----`].join("\n");
}

/** A prompt around a value, in the ways a value gets pasted. */
const WRAPPERS: ReadonlyArray<(secret: string) => string> = [
  (s) => `here is my key: ${s} please use it`,
  (s) => `export SERVICE_TOKEN=${s}`,
  (s) => `{"token": "${s}"}`,
  (s) => s,
  (s) => `curl -H 'X-Auth: ${s}' https://example.test/api`,
  (s) => `the new one is\n${s}\nthanks`,
];

function wrapped(secrets: readonly string[], at: number): Case[] {
  return secrets.map((secret, i) => {
    const wrap = WRAPPERS[(i + at) % WRAPPERS.length];
    return { text: wrap === undefined ? secret : wrap(secret), secrets: [secret] };
  });
}

function many(count: number, make: () => string): string[] {
  return Array.from({ length: count }, make);
}

const KNOWN: string[] = [
  ...many(3, () => `ghp_${random(ALNUM, 36)}`),
  ...many(2, () => `gho_${random(ALNUM, 36)}`),
  ...many(2, () => `github_pat_${random(ALNUM, 22)}_${random(ALNUM, 59)}`),
  ...many(3, () => `glpat-${random(`${ALNUM}-_`, 20)}`),
  ...many(3, () => `npm_${random(ALNUM, 36)}`),
  ...many(3, () => `sk-ant-api03-${random(BASE64URL, 93)}AA`),
  ...many(2, () => `sk-proj-${random(BASE64URL, 74)}`),
  ...many(2, () => `sk-${random(ALNUM, 48)}`),
  ...many(3, () => `AKIA${random(UPPER_DIGITS, 16)}`),
  ...many(3, () => `xoxb-${random(DIGITS, 12)}-${random(DIGITS, 12)}-${random(ALNUM, 24)}`),
  ...many(2, () => `sk_live_${random(ALNUM, 24)}`),
  ...many(2, () => `sk_test_${random(ALNUM, 24)}`),
  ...many(2, () => `AIza${random(BASE64URL, 35)}`),
  ...many(3, jwt),
  ...many(2, privateKey),
];

/** Random values with no shape of their own: the structure checks have to take these. */
const BARE: string[] = [
  ...many(6, () => random(BASE64, 32 + Math.floor(next() * 33))),
  ...many(6, () => random(BASE64URL, 32 + Math.floor(next() * 33))),
  ...many(6, () => random(ALNUM, 32 + Math.floor(next() * 33))),
  ...many(3, () => random(LOWER + DIGITS, 40)),
];

const POSITIVE_BARE = BARE.map((secret) => secret.replaceAll(/^[-_+/]+|[-_+/]+$/g, "A"));

/** Hex alone is a hash unless a name says credential. */
const NAMED_HEX: Case[] = [
  ...many(3, () => random(HEX, 32)).map((s) => ({ text: `API_SECRET=${s}`, secrets: [s] })),
  ...many(3, () => random(HEX, 40)).map((s) => ({
    text: `my access_token: ${s} expires soon`,
    secrets: [s],
  })),
  ...many(2, () => random(BASE64, 40)).map((s) => ({
    text: `aws_secret_access_key = ${s}`,
    secrets: [s],
  })),
  ...many(2, () => random(ALNUM, 24)).map((s) => ({
    text: `Authorization: Bearer ${s}`,
    secrets: [s],
  })),
  ...many(2, () => random(ALNUM, 20)).map((s) => ({
    text: `postgres://app:${s}@db.example.test:5432/app`,
    secrets: [s],
  })),
];

/** A password has no shape, so only its name and a mix of character kinds give it away. */
const NAMED_PASSWORDS: Case[] = [
  { text: "password=hunter2", secrets: ["hunter2"] },
  { text: "db_passwd: Tr0ub4dor", secrets: ["Tr0ub4dor"] },
  { text: "userPassword = 'Zx9kqLm2'", secrets: ["Zx9kqLm2"] },
  { text: "MYSQL_PWD=Pa55w0rdX", secrets: ["Pa55w0rdX"] },
];

export const POSITIVES: readonly Case[] = [
  ...wrapped(KNOWN, 0),
  ...wrapped(POSITIVE_BARE, 1),
  ...NAMED_HEX,
  ...NAMED_PASSWORDS,
];

/** A UUID, a hash, a path, an id: what a coding session is full of, and never a credential. */
const NEGATIVE_TEXTS: readonly string[] = [
  // file paths and their segments
  "/home/qs_m4rk/Projects/FullStack.qsm/qsm-marketplace/.claude/worktrees/rewrite/plugins/qsm-secrets/lib/capture.ts",
  "/tmp/claude-1000/-home-qs_m4rk-Projects-FullStack-qsm-qsm-marketplace--claude-worktrees-rewrite/87ee6dec-1791-4c93-b7e9-ff8d02bdf38b/scratchpad",
  "-home-qs_m4rk-Projects-FullStack-qsm-qsm-marketplace--claude-worktrees-rewrite",
  "see ~/.claude/projects/-home-qs_m4rk-Projects-FullStack-qsm-qsm-marketplace--claude-worktrees-rewrite/87ee6dec-1791-4c93-b7e9-ff8d02bdf38b.jsonl",
  "plugins/qsm-secrets/openspec/specs/qsm-secrets/spec.md",
  "./plugins/qsm-langdev-ts/skills/typescript-dev/SKILL.md",
  "/home/qs_m4rk/.cache/qsm-impl/mp-secrets2/plugins/qsm-secrets/lib/capture.corpus.ts",
  "cd /home/qs_m4rk/Clonned/some-very-long-directory-name-with-many-parts-v2 && ls",
  "open node_modules/.bun/@types+node@22.10.1/node_modules/@types/node/index.d.ts",
  "C:\\Users\\qs_m4rk\\AppData\\Local\\Programs\\some-application-name-2026\\bin",
  "refs/heads/feat/secrets-management-capture-algorithm-v2",
  "feat/secrets-management-capture-algorithm-and-corpus-2026",
  "the dir is /var/lib/docker/overlay2/very-long-layer-name-with-dashes-in-it-2",
  "tail -f /var/log/qsm/secrets-capture-service-2026-10-13-rotated.log",
  // dashed segments and kebab ids
  "validate-no-cross-plugin-import-of-a-sibling-plugin-2",
  "qsm-secrets-deployment-7d9f8b6c5-x2k9p-canary-release-2",
  "fix-the-capture-hook-so-it-never-rewrites-placeholders-v2",
  "ai-guardrails-pre-commit-lefthook-biome-fix-step-2-of-3",
  "worktree-agent-a1b2c3d4-secrets-management-implementation",
  "test-capture-secrets-known-shapes-github-token-1",
  // snake and constant case, camel and pascal
  "test_capture_secrets_known_shapes_github_token_v2",
  "SECRETS_BACKEND_CHOSEN_BY_ACTIVATION_STEP_2_OF_3",
  "QSM_SECRETS_CAPTURE_NAMESPACE_DEFAULT_FOLDER_2",
  "captureSecretsFromPromptTextBeforeSubmit2Handler",
  "ValidateNoCrossPluginImportOfSiblingPluginRule2",
  "the_function_name_that_computes_the_entropy_of_a_token_2",
  "isBareSecretWithEntropyNormalisedByAlphabetAndLength2",
  "process_all_pending_session_end_scrub_jobs_1_by_1_now",
  // UUIDs
  "2eb0df0a-348c-44d9-bf8c-30a179d15b5e",
  "session 87ee6dec-1791-4c93-b7e9-ff8d02bdf38b ended",
  "A1B2C3D4-E5F6-4789-8ABC-DEF012345678",
  "uuid=5a6f1e2c-9b3d-4c7a-8e1f-0a2b3c4d5e6f",
  "the ids were 2eb0df0a-348c-44d9-bf8c-30a179d15b5e and 87ee6dec-1791-4c93-b7e9-ff8d02bdf38b",
  // git SHAs, digests
  "83e93e52f4a1c0b7d6e5a4938271605f4e3d2c1b",
  "commit 8314eb55c5cd86fa7e3b21d0987654321abcdef0 fixed it",
  "git cherry-pick c5cd86fe0a1b2c3d4e5f60718293a4b5c6d7e8f9",
  "a1032542b3c4d5e6f708192a3b4c5d6e7f8091a2",
  "73ff06c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9",
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  "d41d8cd98f00b204e9800998ecf8427e",
  "cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e",
  "sha512-Pc3BQHUc9rWRr7e0cB2Y8tAx9OZnXJb4cuUQBYVT+jv7sFkUYm9ZVhuWuAqZrQ3k4vJ3QK+DfFWbbpt8tTfnQ==",
  "integrity sha1-2fd3b1e5a7c9d0f1a3b5c7d9e0f2a4b6c8d0e2f4",
  // placeholders and capture ids
  "{{secret:cap_03c8872d7caa}}",
  "{{secret:cap_03c8872d7caa}}…ab12",
  "token {{secret:qsm/github-token}} stays",
  "/tmp/claude-1000/{{secret:cap_03c8872d7caa}}/87ee6dec-1791-4c93-b7e9-ff8d02bdf38b/scratchpad",
  "use {{secret:cap_0528ecec3eb1}} and {{secret:cap_9f3a1c7e2b40}}…Q9xZ for the deploy",
  "<output-file>/tmp/tasks/{{secret:cap_0528ecec3eb1}}.output</output-file>",
  "use {{secret:qsm/a-very-long-key-name-for-the-stored-token-2}}…Q9xZ now",
  "cap_03c8872d7caa",
  "cap_0528ecec3eb1 cap_9f3a1c7e2b40",
  // Claude and tool ids
  "https://claude.ai/code/session_016qQwgiLqa1urqAqt8KaSci",
  "Claude-Session: https://claude.ai/code/session_01B9xTq3mLr7VnKpZ4aWc2Ye",
  "session_016qQwgiLqa1urqAqt8KaSci",
  "toolu_01A09q90qw90lq917835lq9Hs8dK",
  "msg_01XFDUDYJgAACzvnptvVoYEL2mQ4",
  "req_011CTvQm8wZbN3xK5jH7pRaD",
  // urls
  "https://github.com/Questi0nM4rk/qsm-marketplace/blob/rewrite/plugins/qsm-secrets/README.md",
  "https://registry.npmjs.org/@questi0nm4rk/ai-guardrails/-/ai-guardrails-0.3.0.tgz",
  "https://example.test/a/very/long/path/with/many/segments/and-a-kebab-name-2026/index.html?page=2",
  "git clone https://github.com/Questi0nM4rk/some-quite-long-repository-name-for-tests-2.git",
  "visit https://docs.example.test/guides/getting-started-with-the-secrets-plugin-version-2",
  "https://web.archive.org/web/20261013084122/https://example.test/some-long-page-name-here",
  // a word that holds a shape's prefix
  "risk-assessment-for-the-new-deployment-pipeline-2026",
  "ask-the-team-about-the-new-deployment-plan-today-1",
  // npm packages
  "@questi0nm4rk/ai-guardrails",
  "@typescript-eslint/eslint-plugin-tslint-rules-for-strict-2",
  "npm i @types/node@22.10.1 eslint-plugin-unicorn-extended-rules-2",
  "bun add @questi0nm4rk/hook-kit@^0.4.1",
  // base64 of words
  "VGhlIHF1aWNrIGJyb3duIGZveCBqdW1wcyBvdmVyIHRoZSBsYXp5IGRvZw==",
  "cGxlYXNlIGRvIG5vdCB1c2UgdGhpcyBpbiBwcm9kdWN0aW9uIG9yIGVsc2U=",
  "aGVsbG8gd29ybGQ=",
  "Y29uZmlnOiBzZWN1cmUsIHN0YXR1czogb2ssIHJldHJpZXM6IDM0LCBtb2RlOiBmYXN0",
  // versions and timestamps
  "1.2.3-beta.4+build.20260513.sha.5114f85",
  "v10.0.100-rc.2.25502.107",
  "2026-10-13T08:41:22.123456+02:00",
  "20261013T084122Z",
  "1760344882123456789012345678901234567890",
  "at 2026-10-13 08:41:22,123 INFO qsm-secrets capture finished in 31ms",
  // long words and prose
  "pneumonoultramicroscopicsilicovolcanoconiosis",
  "supercalifragilisticexpialidocious",
  "Pneumonoultramicroscopicsilicovolcanoconiosis and floccinaucinihilipilification",
  "the word antidisestablishmentarianismologicalsituations is nonsense",
  "ThisIsAVeryLongPascalCaseIdentifierWithoutAnyDigitsAtAllInIt",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1",
  "0000000000000000000000000000000000000000000000000000",
  "abababababababababababababababababababababab12",
  // css and short things
  "color: #ff00aa; background: #FFFFFF; border: 1px solid rgb(12, 34, 56)",
  "ordinary text with no secret in it at all",
  "QSM_SECRETS_FOLDER=qsm QSM_SECRETS_BACKEND=rbw",
  "password=required",
  "password: changeme",
  "secret=true",
  "authorization_mode=RBACNodeWebhook2x",
  "passwordless=EnabledForAllUsers2",
  "token_limit=1234567890123456",
  "tokens=1024 max_tokens=4096000000000000",
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl me@host",
  "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC7vbqajDhA9Zk3q2X1pLm0sT4wYn8cUe6RfHg5JdKbNxOi2QzPvWl me@host",
  "the key is in the vault, ask for it by name",
  // names without a credential
  "name=github-token-for-ci-pipeline-and-deploys-2",
  "token: refresh-token-handler-for-the-session-manager",
  "secret = the-name-of-the-vault-folder-for-this-user",
];

export const NEGATIVES: readonly Case[] = NEGATIVE_TEXTS.map((text) => ({ text, secrets: [] }));
