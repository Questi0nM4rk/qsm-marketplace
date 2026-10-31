// A closed set of shapes common secrets take. Each pattern matches the secret value itself, so a
// reader can say "this looks secret" (qsm-memory) and another can cut the value out (qsm-secrets).
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
  ["api-key", /(?<=api[_-]?key\s*[:=]\s*)\S{16,}/gi],
  ["jwt", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g],
  [
    "private-key",
    /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)?/g,
  ],
  ["github-pat", /(?<![A-Za-z0-9])ghp_[A-Za-z0-9]{36,}/g],
  ["github-oauth", /(?<![A-Za-z0-9])gho_[A-Za-z0-9]{36,}/g],
  ["github-app-token", /(?<![A-Za-z0-9])gh[us]_[A-Za-z0-9]{36,}/g],
  ["github-refresh-token", /(?<![A-Za-z0-9])ghr_[A-Za-z0-9]{36,}/g],
  ["github-fine-grained-pat", /github_pat_\w{20,}/g],
  ["gitlab-pat", /(?<![A-Za-z0-9])glpat-[\w-]{20,}(?:\.[0-9a-z]{9})?/g],
  ["slack-token", /xox[abeoprs]-[A-Za-z0-9.-]{10,}/g],
  ["connection-string", /(?<=:\/\/[^/\s:]+:)[^@\s]+(?=@)/g],
  ["stripe-access-token", /(?<![A-Za-z0-9])[sr]k_(?:live|test|prod)_[A-Za-z0-9]{10,}/g],
  ["gcp-api-key", /AIza[\w-]{35}/g],
  ["npm-access-token", /(?<![A-Za-z0-9])npm_[A-Za-z0-9]{36}/g],
  ["anthropic-api-key", /(?<![A-Za-z0-9])sk-ant-[\w-]{20,}/g],
  ["openai-api-key", /(?<![A-Za-z0-9])sk-[\w-]{20,}/g],
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

/** The pattern name that matched, or null when nothing looks secret. */
export function looksLikeSecret(text: string): string | null {
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
