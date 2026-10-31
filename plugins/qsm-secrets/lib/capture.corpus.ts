// The labelled corpus the capture algorithm is measured on. A case is a prompt and the values a
// correct capture takes out of it: a positive names one, a negative names none. Positives are built
// from a seeded generator so no literal token sits in the repository for a scanner to flag, and the
// same run always yields the same corpus. Key material is made at test time by its real producers
// (`producedCases`), for the same reason.

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Case {
  readonly text: string;
  /** The values that must be captured, exactly; empty for a negative. */
  readonly secrets: readonly string[];
  /** The kind of each value, in the same order, where the case pins it. */
  readonly kinds?: readonly string[];
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

const BASE62 = DIGITS + UPPER + LOWER;

/** GitHub's checksum of a classic token: the CRC32 of its random part, six characters of base62. */
function githubChecksum(body: string): string {
  let n = Bun.hash.crc32(body);
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out = `${BASE62[n % 62] ?? ""}${out}`;
    n = Math.floor(n / 62);
  }
  return out;
}

/** A `ghp_` token whose last six characters are its checksum moved one step along the alphabet. */
function wrongChecksumToken(): string {
  const body = random(ALNUM, 30);
  const wrong = githubChecksum(body)
    .split("")
    .map((char) => BASE62[(BASE62.indexOf(char) + 1) % BASE62.length])
    .join("");
  return `ghp_${body}${wrong}`;
}

const hex = (length: number): string => random(HEX, length);
/** The bech32 alphabet: letters and digits without 1, b, i and o. */
const BECH32 = (UPPER + DIGITS).replaceAll(/[1BIO]/g, "");

/** One token per provider shape, named by the kind the capture must give it. */
const SHAPED: ReadonlyArray<readonly [string, string]> = [
  ["github-pat", wrongChecksumToken()],
  ["github-app-token", `ghs_${random(ALNUM, 36)}`],
  ["github-refresh-token", `ghr_${random(ALNUM, 36)}`],
  ["anthropic-admin-api-key", `sk-ant-admin01-${random(BASE64URL, 93)}AA`],
  ["gitlab-ptt", `glptt-${hex(40)}`],
  ["gitlab-deploy-token", `gldt-${random(BASE64URL, 20)}`],
  ["gitlab-runner-authentication-token", `glrt-${random(BASE64URL, 20)}`],
  ["gitlab-rrt", `GR1348941${random(BASE64URL, 20)}`],
  ["aws-access-token", `ABIA${random(UPPER_DIGITS, 16)}`],
  ["slack-app-token", `xapp-1-A${random(UPPER_DIGITS, 10)}-${random(DIGITS, 13)}-${hex(64)}`],
  [
    "slack-webhook-url",
    `https://hooks.slack.com/services/T${random(UPPER_DIGITS, 8)}/B${random(UPPER_DIGITS, 8)}/${random(ALNUM, 24)}`,
  ],
  ["stripe-access-token", `rk_prod_${random(ALNUM, 24)}`],
  ["digitalocean-pat", `dop_v1_${hex(64)}`],
  ["digitalocean-access-token", `doo_v1_${hex(64)}`],
  ["digitalocean-refresh-token", `dor_v1_${hex(64)}`],
  ["vault-service-token", `hvs.${random(BASE64URL, 95)}`],
  ["vault-batch-token", `hvb.${random(BASE64URL, 140)}`],
  ["hashicorp-tf-api-token", `${random(LOWER + DIGITS, 14)}.atlasv1.${random(LOWER + DIGITS, 64)}`],
  ["huggingface-access-token", `hf_${random(LOWER + UPPER, 34)}`],
  ["pypi-upload-token", `pypi-AgEIcHlwaS5vcmc${random(BASE64URL, 60)}`],
  ["sendgrid-api-token", `SG.${random(BASE64URL, 22)}.${random(BASE64URL, 43)}`],
  ["age-secret-key", `AGE-SECRET-KEY-1${random(BECH32, 58)}`],
  ["1password-service-account-token", `ops_eyJ${random(ALNUM, 260)}`],
  ["perplexity-api-key", `pplx-${random(ALNUM, 48)}`],
  ["postman-api-token", `PMAK-${hex(24)}-${hex(34)}`],
  ["pulumi-api-token", `pul-${hex(40)}`],
  ["sentry-user-token", `sntryu_${hex(64)}`],
  ["shopify-access-token", `shpat_${hex(32)}`],
  ["shopify-shared-secret", `shpss_${hex(32)}`],
  ["linear-api-key", `lin_api_${random(ALNUM, 40)}`],
  ["doppler-api-token", `dp.pt.${random(ALNUM, 43)}`],
  ["grafana-cloud-api-token", `glc_${random(ALNUM, 48)}`],
  ["grafana-service-account-token", `glsa_${random(ALNUM, 32)}_${hex(8)}`],
  ["databricks-api-token", `dapi${hex(32)}`],
  ["flyio-access-token", `fo1_${random(ALNUM, 43)}`],
  ["heroku-api-key-v2", `HRKU-AA${random(ALNUM, 58)}`],
  ["rubygems-api-token", `rubygems_${hex(48)}`],
  ["notion-api-token", `ntn_${random(DIGITS, 11)}${random(ALNUM, 35)}`],
  ["openshift-user-token", `sha256~${random(ALNUM, 43)}`],
  ["cloudflare-origin-ca-key", `v1.0-${hex(24)}-${hex(146)}`],
];

const SHAPED_CASES: Case[] = SHAPED.map(([kind, token], i) => {
  const wrap = WRAPPERS[i % WRAPPERS.length];
  return { text: wrap === undefined ? token : wrap(token), secrets: [token], kinds: [kind] };
});

/** A value after a credential word counts from six characters, in Czech too, whatever its mix. */
const CREDENTIAL_VALUES: Case[] = [
  (v: string) => `heslo je ${v}`,
  (v: string) => `HESLO=${v}`,
  (v: string) => `klíč: ${v}`,
  (v: string) => `tajné=${v}`,
  (v: string) => `the password is ${v}`,
  (v: string) => `SERVICE_TOKEN=${v}`,
].map((say, i) => {
  const value = random(ALNUM, 6 + i);
  return { text: say(value), secrets: [value], kinds: ["credential-value"] };
});

/** A hex run that is no commit and no UUID: a key, not an id. */
const BARE_HEX: Case[] = [32, 48].map((length) => {
  const value = hex(length);
  return { text: `use ${value} for the webhook`, secrets: [value], kinds: ["random-token"] };
});

export const POSITIVES: readonly Case[] = [
  ...wrapped(KNOWN, 0),
  ...wrapped(POSITIVE_BARE, 1),
  ...NAMED_HEX,
  ...NAMED_PASSWORDS,
  ...SHAPED_CASES,
  ...CREDENTIAL_VALUES,
  ...BARE_HEX,
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

/** A value that is plainly not one: a template, a stopword, a repeated or sequential run. */
const NOT_VALUES: readonly string[] = [
  "password=<your-password>",
  "token=${GITHUB_TOKEN}",
  "secret=changeme",
  "api_key={api_key}",
  "DB_PASSWORD={{db_password}}",
  "PASSWORD=your-password",
  "token: example",
  "password=xxxxxxxx",
  "secret=abcdefgh",
  "pin_password=12345678",
  "password: null",
  "auth=false",
];

/** Only the first characters of each shape: the prefix alone is no token. */
const SHAPE_PREFIXES: readonly string[] = SHAPED.map(
  ([, token]) => `only the first characters were pasted: ${token.slice(0, 12)}`,
);

export const NEGATIVES: readonly Case[] = [...NEGATIVE_TEXTS, ...NOT_VALUES, ...SHAPE_PREFIXES].map(
  (text) => ({ text, secrets: [] }),
);

/** The producers' own output, read back once each has written it. */
interface Produced {
  readonly positives: Case[];
  readonly negatives: Case[];
}

/** Runs one producer, failing loud and naming it when it is missing or fails. */
function produce(tool: string, args: readonly string[], cwd: string, gnupgHome?: string): string {
  if (Bun.which(tool) === null) {
    throw new Error(
      `capture corpus: ${tool} is not installed, and the corpus needs its key material`,
    );
  }
  const env: Record<string, string> = { PATH: process.env.PATH ?? "" };
  if (gnupgHome !== undefined) {
    env.GNUPGHOME = gnupgHome;
  }
  const done = Bun.spawnSync([tool, ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
  if (done.exitCode !== 0) {
    throw new Error(`capture corpus: ${tool} ${args[0] ?? ""} failed: ${done.stderr.toString()}`);
  }
  return done.stdout.toString();
}

/** A case with one secret of one kind. */
function one(text: string, secret: string, kind: string): Case {
  return { text, secrets: [secret], kinds: [kind] };
}

/** The armoured block of a producer's file, without the comment lines some put before it. */
function block(pem: string): string {
  return pem.slice(pem.indexOf("-----BEGIN")).trimEnd();
}

/**
 * Key material made by the real producers in `dir`: an OpenVPN static key, SSH keys, a certificate
 * and its request, a PGP key pair, a key cut short and an .ovpn file, as positives; SSH public key
 * lines as negatives. The gpg agent the key generation starts is stopped before this returns.
 */
export function producedCases(dir: string): Produced {
  const read = (name: string): string => readFileSync(join(dir, name), "utf8");
  produce("openvpn", ["--genkey", "secret", "ta.key"], dir);
  for (const [type, extra] of [
    ["ed25519", ["-N", ""]],
    ["rsa", ["-N", ""]],
    ["ecdsa", ["-N", "corpus passphrase"]],
  ] as const) {
    produce("ssh-keygen", ["-q", "-t", type, ...extra, "-C", "corpus", "-f", `id_${type}`], dir);
  }
  produce(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      "key.pem",
      "-out",
      "cert.pem",
    ].concat(["-subj", "/CN=corpus.example.test", "-days", "1"]),
    dir,
  );
  produce(
    "openssl",
    ["req", "-new", "-key", "key.pem", "-out", "req.csr", "-subj", "/CN=corpus"],
    dir,
  );
  const home = join(dir, "gnupg");
  mkdirSync(home, { mode: 0o700 });
  const gpg = ["--batch", "--pinentry-mode", "loopback", "--passphrase", ""];
  produce(
    "gpg",
    [...gpg, "--quick-gen-key", "Corpus <corpus@example.test>", "ed25519", "default", "never"],
    dir,
    home,
  );
  const pgpPrivate = produce("gpg", [...gpg, "--armor", "--export-secret-keys"], dir, home);
  const pgpPublic = produce("gpg", ["--armor", "--export"], dir, home);
  produce("gpgconf", ["--kill", "all"], dir, home);
  produce("gpgconf", ["--remove-socketdir"], dir, home);

  const staticKey = read("ta.key");
  const [ed, rsa, ecdsa] = ["ed25519", "rsa", "ecdsa"].map((type) => read(`id_${type}`));
  const [cert, key, csr] = ["cert.pem", "key.pem", "req.csr"].map(read);
  if ([ed, rsa, ecdsa, cert, key, csr].some((file) => file === undefined)) {
    throw new Error("capture corpus: a producer wrote no file");
  }
  const cut = block(ed ?? "")
    .split("\n")
    .slice(0, -1)
    .join("\n");
  const ovpn = [
    "client\ndev tun\nproto udp\nremote vpn.example.test 1194\n<ca>",
    block(cert ?? ""),
    "</ca>\n<key>",
    block(key ?? ""),
    "</key>\nkey-direction 1\n<tls-auth>",
    staticKey.trimEnd(),
    "</tls-auth>\nverb 3\n",
  ].join("\n");
  return {
    positives: [
      one(`tls-auth key for the vpn:\n${staticKey}`, block(staticKey), "openvpn-key"),
      one(`the deploy key\n${ed ?? ""}`, block(ed ?? ""), "private-key"),
      one(rsa ?? "", block(rsa ?? ""), "private-key"),
      one(`${ecdsa ?? ""}the passphrase is in the vault`, block(ecdsa ?? ""), "private-key"),
      one(`key.pem:\n${key ?? ""}`, block(key ?? ""), "private-key"),
      one(`the server certificate:\n${cert ?? ""}`, block(cert ?? ""), "pem-block"),
      one(`csr for the ca:\n${csr ?? ""}`, block(csr ?? ""), "pem-block"),
      one(`my gpg key\n${pgpPrivate}`, block(pgpPrivate), "private-key"),
      one(`my public gpg key\n${pgpPublic}`, block(pgpPublic), "pem-block"),
      one(`the key, cut short:\n${cut}`, cut, "private-key"),
      {
        text: ovpn,
        secrets: [block(cert ?? ""), block(key ?? ""), block(staticKey)],
        kinds: ["pem-block", "private-key", "openvpn-key"],
      },
    ],
    negatives: ["ed25519", "rsa"].map((type) => ({
      text: `add it to authorized_keys: ${read(`id_${type}.pub`).trim()}`,
      secrets: [],
    })),
  };
}
