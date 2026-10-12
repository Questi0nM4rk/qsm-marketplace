// The contract between a checker's output parser and the tree comparison that consumes it.

import { ruleIdOf } from "./rule-packs.ts";

/** Where a finding sits, as the tool printed it. */
interface Location {
  path: string;
  line?: number;
  column?: number;
}

/** One finding. */
export interface Finding {
  identity: string;
  locations: readonly Location[];
}

/** A tool's findings for one side. */
export interface Tally {
  total: number;
  byPath?: Readonly<Record<string, number>>;
  findings?: readonly Finding[];
}

function location(path: string, line?: unknown, column?: unknown): Location {
  const out: Location = { path };
  if (typeof line === "number" && Number.isFinite(line)) {
    out.line = line;
  }
  if (typeof column === "number" && Number.isFinite(column)) {
    out.column = column;
  }
  return out;
}

/** A finding at one place, or with no place when the tool named no file —
 * which drops the whole side's per-file detail in `tallyOf`, on purpose. */
function at(identity: string, path: unknown, line?: unknown, column?: unknown): Finding {
  const locations =
    typeof path === "string" && path.length > 0 ? [location(path, line, column)] : [];
  return { identity, locations };
}

/** The tally of a side from its findings. */
function tallyOf(findings: readonly Finding[], statedTotal?: number): Tally {
  const total = statedTotal ?? findings.length;
  if (total !== findings.length) {
    return { total };
  }
  const byPath: Record<string, number> = {};
  for (const finding of findings) {
    if (finding.locations.length === 0) {
      return { total };
    }
    for (const path of new Set(finding.locations.map((l) => l.path))) {
      if (path.length === 0) {
        return { total };
      }
      byPath[path] = (byPath[path] ?? 0) + 1;
    }
  }
  return { total, byPath, findings };
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): number | undefined => (typeof value === "number" ? value : undefined);

function jsonArray(text: string): unknown[] | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function jsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * One finding per line matching `pattern`, whose groups name, in order, the path, the line, the
 * optional column, and the identity text.
 */
function tallyLines(
  output: string,
  pattern: RegExp,
  exitCode: number,
  cleanExits: readonly number[] = [0],
): Tally | null {
  const findings: Finding[] = [];
  for (const line of output.split("\n")) {
    const m = line.match(pattern);
    if (m) {
      findings.push(at(str(m[4]).trim(), m[1], Number(m[2]), m[3] ? Number(m[3]) : undefined));
    }
  }
  if (findings.length === 0 && !cleanExits.includes(exitCode)) {
    return null;
  }
  return tallyOf(findings);
}

/**
 * biome categories that are biome talking about its own configuration, not about the code;
 * counting one would put a number in the ratchet that nothing the author touched can move.
 */
const BIOME_CONFIG_CATEGORIES = new Set(["deserialize", "configuration"]);

interface BiomeDiagnostic {
  category?: unknown;
  location?: { path?: unknown };
}

function biomePath(diagnostic: BiomeDiagnostic): string {
  const path = diagnostic.location?.path;
  return typeof path === "string" ? path : str((path as { file?: unknown } | undefined)?.file);
}

export function countBiome(stdout: string): Tally | null {
  const parsed = jsonObject(stdout);
  if (!Array.isArray(parsed?.diagnostics)) {
    return null;
  }
  const code = (parsed.diagnostics as BiomeDiagnostic[]).filter(
    (d) => typeof d?.category !== "string" || !BIOME_CONFIG_CATEGORIES.has(d.category),
  );
  return tallyOf(code.map((d) => at(str(d?.category), biomePath(d ?? {}))));
}

type Rec = Record<string, unknown>;

function tallyJsonArray(stdout: string, toFinding: (item: Rec) => Finding): Tally | null {
  const parsed = jsonArray(stdout);
  if (parsed === null) {
    return null;
  }
  return tallyOf(parsed.map((item) => toFinding((item ?? {}) as Rec)));
}

/** ruff --output-format json: code, message, filename, location.row/column. */
export function countRuff(stdout: string): Tally | null {
  return tallyJsonArray(stdout, (r) => {
    const loc = (r.location ?? {}) as Rec;
    return at(`${str(r.code)} ${str(r.message)}`.trim(), r.filename, num(loc.row), num(loc.column));
  });
}

/** shellcheck -f json: file, line, column, numeric code, message. */
export function countShellcheck(stdout: string): Tally | null {
  return tallyJsonArray(stdout, (r) =>
    at(
      `SC${str(num(r.code)?.toString())} ${str(r.message)}`.trim(),
      r.file,
      num(r.line),
      num(r.column),
    ),
  );
}

/**
 * lizard prints one warning row per function over the threshold, location
 * `function@start-end@path`.
 */
export function countLizard(output: string, exitCode: number): Tally | null {
  const findings: Finding[] = [];
  let inWarnings = false;
  for (const line of output.split("\n")) {
    if (!inWarnings) {
      inWarnings = line.includes("Warnings (cyclomatic_complexity");
      continue;
    }
    if (findings.length > 0 && /^=+$/.test(line.trim())) {
      break;
    }
    const row = line.match(/^\s*\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\S+)@(\d+)-\d+@(\S+)\s*$/);
    if (row) {
      findings.push(at(`${row[1]} over the complexity threshold`, row[3], Number(row[2])));
    }
  }
  if (findings.length === 0 && exitCode !== 0) {
    return null;
  }
  return tallyOf(findings);
}

/** Generic `path:line[:col] message` diagnostics, for a young linter with no
 * stable JSON mode. */
export function countDiagnosticLines(output: string, exitCode: number): Tally | null {
  return tallyLines(output, /^([^:\s]+):(\d+)(?::(\d+))?\s*(.*)$/, exitCode);
}

/** shellmetrics prints a per-function metrics table; count rows whose CCN
 * exceeds the threshold. Total only: the table names no file per row. */
export function countShellMetrics(output: string, threshold: number): number | null {
  const lines = output.split("\n");
  const header = lines.find((line) => /\bCCN\b/i.test(line));
  if (!header) {
    return null;
  }
  const ccnIndex = header
    .trim()
    .split(/\s+/)
    .findIndex((col) => /^CCN$/i.test(col));
  if (ccnIndex === -1) {
    return null;
  }
  let count = 0;
  for (const line of lines) {
    if (line === header) {
      continue;
    }
    const ccn = Number(line.trim().split(/\s+/)[ccnIndex]);
    if (Number.isFinite(ccn) && ccn > threshold) {
      count += 1;
    }
  }
  return count;
}

const UNFORMATTED = "unformatted";

/** Non-empty lines that are listed file paths (`shfmt -l`): one drifted file per line. */
export function countFileList(stdout: string, stderr: string, exitCode: number): Tally | null {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0 && exitCode > 1) {
    return null;
  }
  if (lines.length === 0 && exitCode !== 0 && stderr.trim().length > 0) {
    return null;
  }
  return tallyOf(lines.map((path) => at(UNFORMATTED, path)));
}

/**
 * `ruff format --check`: newer ruff prints `unformatted: ...` then a `--> path:line:col` locator
 * per drifted file plus a summary count; older ruff prints `Would reformat: path`.
 */
export function countRuffFormat(stdout: string, stderr: string, exitCode: number): Tally | null {
  const output = `${stdout}\n${stderr}`;
  const findings: Finding[] = [];
  let pending = false;
  for (const line of output.split("\n")) {
    const old = line.match(/^Would reformat: (.+)$/);
    if (old) {
      findings.push(at(UNFORMATTED, old[1]?.trim()));
    } else if (line.startsWith("unformatted:")) {
      pending = true;
    } else if (pending) {
      const loc = line.match(/-->\s*(.+?):(\d+):(\d+)\s*$/);
      if (loc) {
        findings.push(at(UNFORMATTED, loc[1], Number(loc[2]), Number(loc[3])));
      }
      pending = false;
    }
  }
  const summary = output.match(/(\d+) files? would be reformatted/);
  if (summary) {
    return tallyOf(findings, Number(summary[1]));
  }
  if (findings.length === 0 && exitCode !== 0 && !/left unchanged|already formatted/.test(output)) {
    return null;
  }
  return tallyOf(findings);
}

/** checkbashisms: `possible bashism in FILE line N (text):` per finding. Exit
 * 4 is "some scripts are bash, skipped" — a clean outcome for a POSIX check. */
export function countCheckbashisms(stdout: string, stderr: string, exitCode: number): Tally | null {
  return tallyLines(
    `${stdout}\n${stderr}`,
    /^possible bashism in (.+?) line (\d+)()\s*(.*?):?\s*$/,
    exitCode,
    [0, 1, 4],
  );
}

/** csharpier check: `Error <path> - Was not formatted.` per drifted file. */
export function countCsharpier(stdout: string, stderr: string, exitCode: number): Tally | null {
  const findings = `${stdout}\n${stderr}`
    .split("\n")
    .map((line) => line.match(/^\s*Error (.+?) - Was not formatted/i)?.[1])
    .filter((path): path is string => path !== undefined)
    .map((path) => at(UNFORMATTED, path));
  if (findings.length === 0 && exitCode !== 0) {
    return null;
  }
  return tallyOf(findings);
}

/** dotnet format --report: a JSON array of files, each with `FileChanges`. An
 * entry with none is one drifted file. */
export function countDotnetFormatReport(
  report: string,
  _stderr: string,
  _exitCode: number,
): Tally | null {
  const parsed = jsonArray(report);
  if (parsed === null) {
    return null;
  }
  const findings: Finding[] = [];
  for (const entry of parsed as (Rec | null)[]) {
    const path = entry?.FilePath;
    const changes = entry?.FileChanges;
    if (!Array.isArray(changes) || changes.length === 0) {
      findings.push(at(UNFORMATTED, path));
      continue;
    }
    for (const change of changes as Rec[]) {
      const identity = `${str(change.DiagnosticId)} ${str(change.FormatDescription)}`.trim();
      findings.push(
        at(identity || UNFORMATTED, path, num(change.LineNumber), num(change.CharNumber)),
      );
    }
  }
  return tallyOf(findings);
}

interface SarifResult {
  ruleId?: unknown;
  message?: { text?: unknown };
  locations?: {
    physicalLocation?: {
      artifactLocation?: { uri?: unknown };
      region?: { startLine?: unknown; startColumn?: unknown };
    };
  }[];
}

function sarifFinding(result: SarifResult): Finding {
  const physical = result.locations?.[0]?.physicalLocation;
  const uri = str(physical?.artifactLocation?.uri).replace(/^file:\/\//, "");
  const identity = `${str(result.ruleId)} ${str(result.message?.text)}`.trim();
  return at(identity, uri, num(physical?.region?.startLine), num(physical?.region?.startColumn));
}

/** SARIF 2.x: `runs[].results`. */
export function countSarif(stdout: string, _stderr: string, _exitCode: number): Tally | null {
  const parsed = jsonObject(stdout);
  if (!Array.isArray(parsed?.runs)) {
    return null;
  }
  const findings: Finding[] = [];
  for (const run of parsed.runs as ({ results?: SarifResult[] } | null)[]) {
    if (Array.isArray(run?.results)) {
      findings.push(...run.results.map(sarifFinding));
    }
  }
  return tallyOf(findings);
}

/** vulture: `path:line: unused ... (NN% confidence)`, exits 3 on findings. */
export function countVulture(stdout: string, _stderr: string, exitCode: number): Tally | null {
  return tallyLines(stdout, /^(\S+):(\d+):()\s*(.*)$/, exitCode, [0, 3]);
}

/** tsc --pretty false: one `path(line,col): error TSxxxx: message` per
 * diagnostic. */
export function countTsc(stdout: string, stderr: string, exitCode: number): Tally | null {
  return tallyLines(`${stdout}\n${stderr}`, /^(.+?)\((\d+),(\d+)\): error (TS\d+: .*)$/, exitCode);
}

/** pyright --outputjson: `generalDiagnostics`, zero-based range. */
export function countPyright(stdout: string, _stderr: string, _exitCode: number): Tally | null {
  const parsed = jsonObject(stdout);
  if (!Array.isArray(parsed?.generalDiagnostics)) {
    return null;
  }
  return tallyOf(
    (parsed.generalDiagnostics as Rec[]).map((d) => {
      const start = ((d?.range as Rec | undefined)?.start ?? {}) as Rec;
      const line = num(start.line);
      const column = num(start.character);
      return at(
        `${str(d?.rule)} ${str(d?.message)}`.trim(),
        d?.file,
        line === undefined ? undefined : line + 1,
        column === undefined ? undefined : column + 1,
      );
    }),
  );
}

/** bandit -f json: `results` with test_id, issue_text, filename, line_number. */
export function countBanditJson(stdout: string, _stderr: string, _exitCode: number): Tally | null {
  const parsed = jsonObject(stdout);
  if (!Array.isArray(parsed?.results)) {
    return null;
  }
  return tallyOf(
    (parsed.results as Rec[]).map((r) =>
      at(`${str(r?.test_id)} ${str(r?.issue_text)}`.trim(), r?.filename, num(r?.line_number)),
    ),
  );
}

/** semgrep --json: `results` with check_id, path, start.line/col. */
export function countSemgrep(stdout: string, _stderr: string, _exitCode: number): Tally | null {
  const parsed = jsonObject(stdout);
  if (!Array.isArray(parsed?.results)) {
    return null;
  }
  const errors = Array.isArray(parsed.errors) ? (parsed.errors as { level?: unknown }[]) : [];
  const failures = errors.filter((error) => error?.level !== "warn");
  if (parsed.results.length === 0 && failures.length > 0) {
    return null;
  }
  return tallyOf(
    (parsed.results as Rec[]).map((r) => {
      const start = (r?.start ?? {}) as Rec;
      return at(ruleIdOf(str(r?.check_id)), r?.path, num(start.line), num(start.col));
    }),
  );
}

/**
 * Why a semgrep run gave no reading: under `--json --quiet` semgrep prints nothing on stderr and
 * names the cause in its JSON `errors` (an HTTP 401 for a rejected token, measured on 1.153.1).
 */
export function semgrepFailure(stdout: string): string | undefined {
  const errors = jsonObject(stdout)?.errors;
  if (!Array.isArray(errors)) {
    return;
  }
  const failure = (errors as ({ level?: unknown; message?: unknown } | null)[]).find(
    (error) => error?.level !== "warn" && str(error?.message).trim() !== "",
  );
  return failure === undefined ? undefined : str(failure?.message).trim();
}

/** devskim output is version-dependent: SARIF, or a bare findings array
 * (total only — its records name no file we can trust). */
export function countDevskim(stdout: string, stderr: string, exitCode: number): Tally | null {
  const sarif = countSarif(stdout, stderr, exitCode);
  if (sarif !== null) {
    return sarif;
  }
  const parsed = jsonArray(stdout);
  return parsed === null ? null : { total: parsed.length };
}

// --- knip, depcruise, jscpd --------------------------------------------------

interface KnipItem {
  name?: unknown;
  line?: unknown;
  col?: unknown;
}
type KnipIssue = { file?: unknown } & Record<string, unknown>;

const UNUSED_FILE = "unused file";

function knipIssue(issue: KnipIssue, findings: Finding[]): void {
  const file = str(issue.file);
  for (const [type, value] of Object.entries(issue)) {
    if (!Array.isArray(value)) {
      continue;
    }
    for (const item of value as (KnipItem | null)[]) {
      const name = str(item?.name);
      if (type === "files") {
        findings.push(at(UNUSED_FILE, name));
      } else {
        findings.push(at(`${type} ${name}`.trimEnd(), file, num(item?.line), num(item?.col)));
      }
    }
  }
}

function knipUnusedFile(file: unknown): Finding {
  return at(UNUSED_FILE, typeof file === "string" ? file : str((file as KnipItem | null)?.name));
}

/** knip --reporter json: top-level `files` are unused files; `issues` entries
 * carry arrays per issue type, one item per finding. */
export function countKnip(stdout: string, _stderr: string, _exitCode: number): Tally | null {
  const parsed = jsonObject(stdout);
  const files = Array.isArray(parsed?.files) ? (parsed.files as unknown[]) : null;
  const issues = Array.isArray(parsed?.issues) ? (parsed.issues as KnipIssue[]) : null;
  if (files === null && issues === null) {
    return null;
  }
  const findings: Finding[] = (files ?? []).map(knipUnusedFile);
  for (const issue of issues ?? []) {
    knipIssue(issue, findings);
  }
  return tallyOf(findings);
}

interface DepcruiseViolation {
  from?: unknown;
  rule?: { name?: unknown; severity?: unknown };
}

/**
 * dependency-cruiser --output-type json: breaches live in `summary.error` + `summary.warn` (info
 * stays advisory); identity is the rule name alone.
 */
/** Whether a cruise actually read the tree it was pointed at. */
function scanReadTheTree(summary: Rec): boolean {
  const cruised = num(summary.totalCruised) ?? 0;
  if (cruised === 0) {
    return false;
  }
  return cruised === 1 || (num(summary.totalDependenciesCruised) ?? 0) > 0;
}

export function countDepcruise(stdout: string, _stderr: string, _exitCode: number): Tally | null {
  const summary = jsonObject(stdout)?.summary as Rec | undefined;
  if (typeof summary?.error !== "number") {
    return null;
  }
  if (!scanReadTheTree(summary)) {
    return null;
  }
  const total = summary.error + (num(summary.warn) ?? 0);
  const violations = Array.isArray(summary.violations)
    ? (summary.violations as DepcruiseViolation[])
    : [];
  const counted = violations.filter(
    (v) => v?.rule?.severity === "error" || v?.rule?.severity === "warn",
  );
  return tallyOf(
    counted.map((v) => at(str(v.rule?.name), v.from)),
    total,
  );
}

/** jscpd json report: the clone count from `statistics.total.clones`. The count alone is the
 * verdict: a clone has no identity that survives a rename or a move, so a tree that holds no more
 * clones than the reference is no worse. */
export function countJscpd(report: string, _stderr: string, _exitCode: number): Tally | null {
  const statistics = (jsonObject(report)?.statistics ?? {}) as Rec;
  const clones = num(((statistics.total ?? {}) as Rec).clones);
  return clones === undefined ? null : { total: clones };
}

/**
 * dotnet list package --vulnerable --format json: sums every `vulnerabilities` array in the
 * project/framework/package tree.
 */
export function countVulnerable(stdout: string, _stderr: string, _exitCode: number): number | null {
  try {
    return sumVulnerabilities(JSON.parse(stdout) as unknown);
  } catch {
    return null;
  }
}

function sumVulnerabilities(node: unknown): number {
  if (Array.isArray(node)) {
    let total = 0;
    for (const item of node) {
      total += sumVulnerabilities(item);
    }
    return total;
  }
  if (typeof node !== "object" || node === null) {
    return 0;
  }
  let total = 0;
  for (const [key, value] of Object.entries(node)) {
    if (key === "vulnerabilities" && Array.isArray(value)) {
      total += value.length;
    } else {
      total += sumVulnerabilities(value);
    }
  }
  return total;
}

/**
 * `path(line,col): warning CODE: message [project]` in dotnet build output, and the same line with
 * `error`, deduplicated — MSBuild repeats a diagnostic per target framework.
 */
const DOTNET_LEVELS = new Set(["warning", "error"]);
/** NuGet and the MSBuild engine: the build could not be attempted. */
const DOTNET_NOT_A_FINDING = ["NU", "MSB"];
const DOTNET_LINE = /^(.*?)(?:\((\d+),(\d+)\))?:\s+(\w+)\s+([A-Z]+\d+):\s*(.*?)(?:\s+\[.*\])?$/;

/** One diagnostic line, or null when the line is not one. */
function dotnetDiagnostic(line: string): { key: string; finding: Finding } | null {
  const m = DOTNET_LINE.exec(line);
  if (!m) {
    return null;
  }
  const [, rawPath = "", lineNo, column, level = "", code = "", message = ""] = m;
  if (!DOTNET_LEVELS.has(level)) {
    return null;
  }
  if (DOTNET_NOT_A_FINDING.some((prefix) => code.startsWith(prefix))) {
    return null;
  }
  const path = rawPath.trim();
  return {
    key: `${code}:${message}:${path}`,
    finding: at(`${code} ${message}`.trim(), path, Number(lineNo), Number(column)),
  };
}

export function countDotnetDiagnostics(output: string): Tally {
  const seen = new Map<string, Finding>();
  for (const line of output.split("\n")) {
    const hit = dotnetDiagnostic(line);
    if (hit) {
      seen.set(hit.key, hit.finding);
    }
  }
  return tallyOf([...seen.values()]);
}

interface CargoSpan {
  is_primary?: boolean;
  file_name?: unknown;
  line_start?: unknown;
  column_start?: unknown;
}
interface CargoRecord {
  reason?: string;
  message?: { level?: string; message?: unknown; code?: { code?: string }; spans?: CargoSpan[] };
}

/**
 * Warnings count whatever their source; at error level only clippy-coded records count, since an
 * E-coded compile error is a broken build, not a finding.
 */
function isClippyFinding(record: CargoRecord): boolean {
  if (record.reason !== "compiler-message") {
    return false;
  }
  const level = record.message?.level;
  const code = record.message?.code?.code;
  if (level === "warning") {
    return code !== undefined;
  }
  return level === "error" && code !== undefined && code.startsWith("clippy::");
}

function clippyFinding(record: CargoRecord): Finding {
  const spans = record.message?.spans ?? [];
  const span = spans.find((s) => s.is_primary) ?? spans[0];
  const identity = `${record.message?.code?.code ?? ""} ${str(record.message?.message)}`.trim();
  return at(identity, span?.file_name, num(span?.line_start), num(span?.column_start));
}

/** cargo's JSON stream, one record per line. A nonzero exit with no clippy
 * record is a broken build. */
export function countClippy(stdout: string, exitCode = 0): Tally | null {
  const findings: Finding[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) {
      continue;
    }
    try {
      const record = JSON.parse(line) as CargoRecord;
      if (isClippyFinding(record)) {
        findings.push(clippyFinding(record));
      }
    } catch {
      // Non-JSON noise between records.
    }
  }
  if (findings.length === 0 && exitCode !== 0) {
    return null;
  }
  return tallyOf(findings);
}

/** For a per-file check whose only signal is the exit code. */
export function countNonZeroExits(_stdout: string, _stderr: string, exitCode: number): number {
  return exitCode === 0 ? 0 : 1;
}

/** yamllint -f parsable: one `file:line:col: [level] msg (rule)` line per
 * finding on stdout. */
export function countYamllint(stdout: string, _stderr: string, exitCode: number): Tally | null {
  return tallyLines(stdout, /^(.+?):(\d+):(\d+): (\[.*)$/, exitCode);
}

function taploLocator(line: string): Location | null {
  const m = line.match(/-->\s*(.+?):(\d+):(\d+)\s*$/);
  return m ? location(str(m[1]), Number(m[2]), Number(m[3])) : null;
}

/** taplo lint: one `error: message` line per finding on stderr, each
 * followed by a `--> path:line:col` locator when taplo has one. */
export function countTaplo(_stdout: string, stderr: string, exitCode: number): Tally | null {
  const findings: Finding[] = [];
  for (const line of stderr.split("\n")) {
    if (line.startsWith("error")) {
      findings.push({ identity: line.replace(/^error:?\s*/, ""), locations: [] });
      continue;
    }
    const last = findings.at(-1);
    const locator = last !== undefined && last.locations.length === 0 ? taploLocator(line) : null;
    if (locator && last) {
      findings[findings.length - 1] = { identity: last.identity, locations: [locator] };
    }
  }
  if (findings.length === 0 && exitCode !== 0) {
    return null;
  }
  return tallyOf(findings);
}

function markdownlintFinding(line: string): Finding | null {
  const m = line.match(/^([^:\s]+):(\d+)(?::(\d+))? (?:error |warning )?(MD\d+\S*)(?: (.*))?$/);
  if (!m) {
    return null;
  }
  const description = (m[5] ?? "").replace(/\s*\[Context:.*$/, "").trim();
  return at(`${m[4]} ${description}`, m[1], Number(m[2]), m[3] ? Number(m[3]) : undefined);
}

/** markdownlint-cli2: `Summary: N issues in M files` is the count; no
 * summary line means the tool never finished. */
export function countMarkdownlint(stdout: string, stderr: string, _exitCode: number): Tally | null {
  const output = `${stdout}\n${stderr}`;
  const match = output.match(/Summary: (\d+) issue/);
  if (match?.[1] === undefined) {
    return null;
  }
  const findings = output
    .split("\n")
    .map(markdownlintFinding)
    .filter((finding): finding is Finding => finding !== null);
  return tallyOf(findings, Number(match[1]));
}
