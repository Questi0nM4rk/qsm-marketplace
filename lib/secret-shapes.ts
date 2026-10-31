// A closed set of shapes common secrets take, and the one owner of what a key block is. Each pattern
// matches the secret value itself, so a reader can say "this looks secret" (qsm-memory) and another
// can cut the value out (qsm-secrets).
// A shape that matches is a secret whatever its checksum: a miss stays in a transcript for good.

export interface Span {
  readonly start: number;
  readonly end: number;
  /** What the value is, named for the person: `github-pat`, `private-key`, `credential-value`. */
  readonly kind: string;
}

/** Shapes kept broader than gitleaks' own, because a pasted token is often cut or reformatted. */
const OURS: ReadonlyArray<readonly [string, RegExp]> = [
  ["aws-access-token", /(?<![A-Z0-9])(?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}(?![A-Z0-9])/g],
  ["api-key", /(?<=api[_-]?key["']?[ \t]*[:=][ \t]*["'`]?)[\w+/=-]{16,}(?![\w.([])/gi],
  ["jwt", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g],
  ["github-pat", /(?<![A-Za-z0-9])ghp_[A-Za-z0-9]{36,}/g],
  ["github-oauth", /(?<![A-Za-z0-9])gho_[A-Za-z0-9]{36,}/g],
  ["github-app-token", /(?<![A-Za-z0-9])gh[us]_[A-Za-z0-9]{36,}/g],
  ["github-refresh-token", /(?<![A-Za-z0-9])ghr_[A-Za-z0-9]{36,}/g],
  ["github-fine-grained-pat", /github_pat_\w{20,}/g],
  ["gitlab-pat", /(?<![A-Za-z0-9])glpat-[\w-]{20,}(?:\.[0-9a-z]{9})?/g],
  ["slack-token", /xox[abeoprs]-[A-Za-z0-9.-]{10,}/g],
  // The password runs to the last `@` of the authority, never past a `/`, so `host:5173/@vite` is no
  // password.
  ["connection-string", /(?<=:\/\/[^/\s:@]+:)[^/\s]+(?=@[^@\s/]+)/g],
  ["stripe-access-token", /(?<![A-Za-z0-9])[sr]k_(?:live|test|prod)_[A-Za-z0-9]{10,}/g],
  ["gcp-api-key", /AIza[\w-]{35}/g],
  ["npm-access-token", /(?<![A-Za-z0-9])npm_[A-Za-z0-9]{36}/g],
  ["anthropic-api-key", /(?<![A-Za-z0-9])sk-ant-[\w-]{20,}/g],
  ["openai-api-key", /(?<![A-Za-z0-9])sk-(?!ant-)[\w-]{20,}/g],
];

// The shapes below are converted by hand from gitleaks' rule data (config/gitleaks.toml), taking
// only rules with a fixed prefix; each keeps its gitleaks id as its kind.
//
// MIT License
//
// Copyright (c) 2019 Zachary Rice
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
const GITLEAKS: ReadonlyArray<readonly [string, RegExp]> = [
  ["anthropic-admin-api-key", /\bsk-ant-admin01-[\w-]{93}AA/g],
  ["gitlab-ptt", /glptt-[0-9a-f]{40}/g],
  ["gitlab-deploy-token", /gldt-[\w-]{20}/g],
  ["gitlab-runner-authentication-token", /glrt-[\w-]{20}/g],
  ["gitlab-rrt", /GR1348941[\w-]{20}/g],
  ["slack-app-token", /xapp-\d-[A-Za-z0-9]+-\d+-[A-Za-z0-9]+/g],
  [
    "slack-webhook-url",
    /(?:https?:\/\/)?hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9+/]{43,56}/g,
  ],
  ["digitalocean-pat", /\bdop_v1_[a-f0-9]{64}/g],
  ["digitalocean-access-token", /\bdoo_v1_[a-f0-9]{64}/g],
  ["digitalocean-refresh-token", /\bdor_v1_[a-fA-F0-9]{64}/g],
  ["vault-service-token", /\bhvs\.[\w-]{90,120}/g],
  ["vault-batch-token", /\bhvb\.[\w-]{138,300}/g],
  ["hashicorp-tf-api-token", /[A-Za-z0-9]{14}\.atlasv1\.[A-Za-z0-9_=-]{60,70}/g],
  ["huggingface-access-token", /\bhf_[A-Za-z]{34}/g],
  ["pypi-upload-token", /pypi-AgEIcHlwaS5vcmc[\w-]{50,1000}/g],
  ["sendgrid-api-token", /\bSG\.[\w=.-]{66}/g],
  ["age-secret-key", /AGE-SECRET-KEY-1[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{58}/g],
  ["1password-service-account-token", /ops_eyJ[A-Za-z0-9+/]{250,}={0,3}/g],
  ["perplexity-api-key", /\bpplx-[A-Za-z0-9]{48}/g],
  ["postman-api-token", /\bPMAK-[A-Fa-f0-9]{24}-[A-Fa-f0-9]{34}/g],
  ["pulumi-api-token", /\bpul-[a-f0-9]{40}/g],
  ["sentry-user-token", /\bsntryu_[a-f0-9]{64}/g],
  ["shopify-access-token", /shpat_[A-Fa-f0-9]{32}/g],
  ["shopify-shared-secret", /shpss_[A-Fa-f0-9]{32}/g],
  ["linear-api-key", /lin_api_[A-Za-z0-9]{40}/g],
  ["doppler-api-token", /dp\.pt\.[A-Za-z0-9]{43}/g],
  ["grafana-cloud-api-token", /\bglc_[A-Za-z0-9+/]{32,400}={0,3}/g],
  ["grafana-service-account-token", /\bglsa_[A-Za-z0-9]{32}_[A-Fa-f0-9]{8}/g],
  ["databricks-api-token", /\bdapi[a-f0-9]{32}(?:-\d)?/g],
  [
    "flyio-access-token",
    /\b(?:fo1_[\w-]{43}|fm1[ar]_[A-Za-z0-9+/]{100,}={0,3}|fm2_[A-Za-z0-9+/]{100,}={0,3})/g,
  ],
  ["heroku-api-key-v2", /\bHRKU-AA[\w-]{58}/g],
  ["rubygems-api-token", /\brubygems_[a-f0-9]{48}/g],
  ["notion-api-token", /\bntn_\d{11}[A-Za-z0-9]{35}/g],
  ["openshift-user-token", /\bsha256~[\w-]{43}/g],
  ["cloudflare-origin-ca-key", /\bv1\.0-[a-f0-9]{24}-[a-f0-9]{146}/g],
];

const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [...GITLEAKS, ...OURS];

const BLOCK_BEGIN = /-----BEGIN ([^\r\n-][^\r\n]*?)-----/g;
const PUTTY_KEY = /PuTTY-User-Key-File-\d+:/g;
const PUTTY_MAC = /Private-MAC:[^\r\n]*/;

/** What a block's label says it holds; any label is a secret, only its name differs. */
function blockKind(label: string): string {
  if (/PRIVATE KEY(?: BLOCK)?$/.test(label)) {
    return "private-key";
  }
  return label === "OpenVPN Static key V1" ? "openvpn-key" : "pem-block";
}

/** A line of a key body: base64 or hex, a header such as Proc-Type, or blank. */
const BODY_LINE = /^(?:[A-Za-z0-9+/=]+|[A-Za-z][\w-]*: .*|[ \t]*)$/;
const BODY_START = /^(?:[A-Za-z0-9+/=]{16,}|[A-Za-z][\w-]*: .*)$/;
/** A clearsigned message is text anyone may read; only its signature block is a block. */
const CLEARSIGNED = "PGP SIGNED MESSAGE";

/** Where a block that never closes ends: after the last line of the key body that follows its
 * BEGIN line, or null when what follows is no key body (a label named in prose). */
function bodyEnd(text: string, from: number): number | null {
  const lines = text.slice(from).split("\n");
  const first = lines.slice(1).find((line) => line.trim() !== "");
  if (first === undefined || !BODY_START.test(first)) {
    return null;
  }
  let end = from + (lines[0]?.length ?? 0);
  let at = end + 1;
  for (const line of lines.slice(1)) {
    if (!BODY_LINE.test(line)) {
      break;
    }
    if (line.trim() !== "") {
      end = at + line.length;
    }
    at += line.length + 1;
  }
  return end;
}

/** Every armoured block, any label but a clearsigned message's, from its BEGIN line to the END line
 * of the same label, or to the end of its key body when it was cut short; and every PuTTY key from
 * its header to its Private-MAC line. */
export function blockSpans(text: string): Span[] {
  const armoured = [...text.matchAll(BLOCK_BEGIN)].flatMap((m) => {
    const label = m[1] ?? "";
    const close = `-----END ${label}-----`;
    const at = text.indexOf(close, m.index + m[0].length);
    const end = at === -1 ? bodyEnd(text, m.index + m[0].length) : at + close.length;
    return label === CLEARSIGNED || end === null
      ? []
      : [{ start: m.index, end, kind: blockKind(label) }];
  });
  const putty = [...text.matchAll(PUTTY_KEY)].map((m) => {
    const mac = PUTTY_MAC.exec(text.slice(m.index));
    const end =
      mac === null
        ? (bodyEnd(text, m.index) ?? text.trimEnd().length)
        : m.index + mac.index + mac[0].length;
    return { start: m.index, end, kind: "private-key" };
  });
  return [...armoured, ...putty];
}

/** The kind of the first private key block or shape in the text, or null when nothing looks
 * secret; a public block (a certificate, a public key) is not refused. */
export function looksLikeSecret(text: string): string | null {
  const block = blockSpans(text).find((span) => span.kind !== "pem-block");
  if (block !== undefined) {
    return block.kind;
  }
  for (const [name, pattern] of PATTERNS) {
    if (text.search(pattern) !== -1) {
      return name;
    }
  }
  return null;
}

/** Where every known shape sits in the text, named by its kind; spans may overlap each other. */
export function shapeSpans(text: string): Span[] {
  return PATTERNS.flatMap(([kind, pattern]) =>
    [...text.matchAll(pattern)].map((m) => ({ start: m.index, end: m.index + m[0].length, kind })),
  );
}
