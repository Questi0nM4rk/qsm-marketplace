// The contract between a checker's output parser and the tree comparison that consumes it.

import { arrayOf, num, recordOf, recordsOf, str, type Rec } from "./json.ts";
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

function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return null;
  }
}

function jsonArray(text: string): readonly unknown[] | null {
  return arrayOf(parseJson(text));
}

function jsonObject(text: string): Rec | null {
  return recordOf(parseJson(text));
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
      findings.push(
        at(str(m[4]).trim(), m[1], Number(m[2]), m[3] === undefined ? undefined : Number(m[3])),
      );
    }
  }
  if (findings.length === 0 && !cleanExits.includes(exitCode)) {
    return null;
  }
  return tallyOf(findings);
}

/** `oxlint --format json`: `{ diagnostics: [{ code, filename, labels: [{ span: { line, column } }] }] }`. */
export function countOxlint(stdout: string): Tally | null {
  const diagnostics = recordsOf(jsonObject(stdout)?.diagnostics);
  if (diagnostics === null) {
    return null;
  }
  return tallyOf(
    diagnostics.map((d) => {
      const span = recordOf(recordsOf(d.labels)?.[0]?.span);
      return at(str(d.code), d.filename, num(span?.line), num(span?.column));
    }),
  );
}

function tallyJsonArray(stdout: string, toFinding: (item: Rec) => Finding): Tally | null {
  const parsed = recordsOf(parseJson(stdout));
  if (parsed === null) {
    return null;
  }
  return tallyOf(parsed.map((item) => toFinding(item)));
}

/** ruff --output-format json: code, message, filename, location.row/column. */
export function countRuff(stdout: string): Tally | null {
  return tallyJsonArray(stdout, (r) => {
    const loc = recordOf(r.location) ?? {};
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
  if (header === undefined) {
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
    // A function row holds a whole-number CCN; the per-file and total tables
    // put a decimal average (NLOC avg 42.00) in that column.
    const cell = line.trim().split(/\s+/)[ccnIndex] ?? "";
    if (/^\d+$/.test(cell) && Number(cell) > threshold) {
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

/** dotnet format --report: a JSON array of files, each with `FileChanges`. An
 * entry with none is one drifted file. */
export function countDotnetFormatReport(
  report: string,
  _stderr: string,
  _exitCode: number,
): Tally | null {
  const parsed = recordsOf(parseJson(report));
  if (parsed === null) {
    return null;
  }
  const findings: Finding[] = [];
  for (const entry of parsed) {
    const path = entry.FilePath;
    const changes = recordsOf(entry.FileChanges);
    if (changes === null || changes.length === 0) {
      findings.push(at(UNFORMATTED, path));
      continue;
    }
    for (const change of changes) {
      const identity = `${str(change.DiagnosticId)} ${str(change.FormatDescription)}`.trim();
      findings.push(
        at(identity || UNFORMATTED, path, num(change.LineNumber), num(change.CharNumber)),
      );
    }
  }
  return tallyOf(findings);
}

function sarifFinding(result: Rec): Finding {
  const physical = recordOf(recordsOf(result.locations)?.[0]?.physicalLocation);
  const uri = str(recordOf(physical?.artifactLocation)?.uri).replace(/^file:\/\//, "");
  const identity = `${str(result.ruleId)} ${str(recordOf(result.message)?.text)}`.trim();
  const region = recordOf(physical?.region);
  return at(identity, uri, num(region?.startLine), num(region?.startColumn));
}

/** SARIF 2.x: `runs[].results`. */
export function countSarif(stdout: string, _stderr: string, _exitCode: number): Tally | null {
  const runs = recordsOf(jsonObject(stdout)?.runs);
  if (runs === null) {
    return null;
  }
  const findings: Finding[] = [];
  for (const run of runs) {
    findings.push(...(recordsOf(run.results)?.map((r) => sarifFinding(r)) ?? []));
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
  const diagnostics = recordsOf(jsonObject(stdout)?.generalDiagnostics);
  if (diagnostics === null) {
    return null;
  }
  return tallyOf(
    diagnostics.map((d) => {
      const start = recordOf(recordOf(d.range)?.start) ?? {};
      const line = num(start.line);
      const column = num(start.character);
      return at(
        `${str(d.rule)} ${str(d.message)}`.trim(),
        d.file,
        line === undefined ? undefined : line + 1,
        column === undefined ? undefined : column + 1,
      );
    }),
  );
}

/** bandit -f json: `results` with test_id, issue_text, filename, line_number. */
export function countBanditJson(stdout: string, _stderr: string, _exitCode: number): Tally | null {
  const results = recordsOf(jsonObject(stdout)?.results);
  if (results === null) {
    return null;
  }
  return tallyOf(
    results.map((r) =>
      at(`${str(r.test_id)} ${str(r.issue_text)}`.trim(), r.filename, num(r.line_number)),
    ),
  );
}

/**
 * The native failure a semgrep scan hit, if any: a rule `Timeout` — which Semgrep
 * labels a warning — or a fatal scan error. Both make a scan that returned findings
 * an incomplete measurement. Other warning kinds retain their treatment.
 */
function semgrepFailedError(parsed: Rec | null): Rec | undefined {
  return recordsOf(parsed?.errors)?.find(
    (error) => error.type === "Timeout" || error.level !== "warn",
  );
}

/**
 * Why a semgrep run gave no reading: under `--json --quiet` semgrep prints nothing on stderr and
 * names the cause in its JSON `errors` (an HTTP 401 for a rejected token, measured on 1.153.1), or
 * hits a native timeout Semgrep labels a warning. The classification is shared with counting, so
 * a scan semgrep did not finish is never read as findings.
 */
export function semgrepFailure(stdout: string): string | undefined {
  const failure = semgrepFailedError(jsonObject(stdout));
  if (failure === undefined) {
    return undefined;
  }
  const message = str(failure.message).trim();
  return message === "" ? str(failure.type) : message;
}

/** semgrep --json: `results` with check_id, path, start.line/col. A native failure — a rule
 * `Timeout`, even one reported at warning level with findings, or a fatal scan error — rejects
 * the output however many findings it holds; complete output at a findings exit code is measured. */
export function countSemgrep(stdout: string, _stderr: string, _exitCode: number): Tally | null {
  const parsed = jsonObject(stdout);
  const results = recordsOf(parsed?.results);
  if (results === null || semgrepFailedError(parsed) !== undefined) {
    return null;
  }
  return tallyOf(
    results.map((r) => {
      const start = recordOf(r.start) ?? {};
      return at(ruleIdOf(str(r.check_id)), r.path, num(start.line), num(start.col));
    }),
  );
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

const UNUSED_FILE = "unused file";

function knipIssue(issue: Rec, findings: Finding[]): void {
  const file = str(issue.file);
  for (const [type, value] of Object.entries(issue)) {
    for (const item of recordsOf(value) ?? []) {
      const name = str(item.name);
      if (type === "files") {
        findings.push(at(UNUSED_FILE, name));
      } else {
        findings.push(at(`${type} ${name}`.trimEnd(), file, num(item.line), num(item.col)));
      }
    }
  }
}

function knipUnusedFile(file: unknown): Finding {
  return at(UNUSED_FILE, typeof file === "string" ? file : str(recordOf(file)?.name));
}

/** knip --reporter json: top-level `files` are unused files; `issues` entries
 * carry arrays per issue type, one item per finding. */
export function countKnip(stdout: string, _stderr: string, _exitCode: number): Tally | null {
  const parsed = jsonObject(stdout);
  const files = arrayOf(parsed?.files);
  const issues = recordsOf(parsed?.issues);
  if (files === null && issues === null) {
    return null;
  }
  const findings: Finding[] = (files ?? []).map(knipUnusedFile);
  for (const issue of issues ?? []) {
    knipIssue(issue, findings);
  }
  return tallyOf(findings);
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
  const summary = recordOf(jsonObject(stdout)?.summary);
  if (summary === null || typeof summary.error !== "number") {
    return null;
  }
  if (!scanReadTheTree(summary)) {
    return null;
  }
  const total = summary.error + (num(summary.warn) ?? 0);
  const violations = (recordsOf(summary.violations) ?? []).map((v) => ({
    from: v.from,
    rule: recordOf(v.rule),
  }));
  const counted = violations.filter(
    (v) => v.rule?.severity === "error" || v.rule?.severity === "warn",
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
  const total = recordOf(recordOf(jsonObject(report)?.statistics)?.total);
  const clones = num(total?.clones);
  return clones === undefined ? null : { total: clones };
}

/**
 * dotnet list package --vulnerable --format json: sums every `vulnerabilities` array in the
 * project/framework/package tree.
 */
export function countVulnerable(stdout: string, _stderr: string, _exitCode: number): number | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return sumVulnerabilities(parsed);
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

/**
 * Warnings count whatever their source; at error level only clippy-coded records count, since an
 * E-coded compile error is a broken build, not a finding.
 */
function isClippyFinding(record: Rec, message: Rec | null): boolean {
  if (record.reason !== "compiler-message") {
    return false;
  }
  const level = message?.level;
  const code = recordOf(message?.code)?.code;
  if (level === "warning") {
    return code !== undefined;
  }
  return level === "error" && typeof code === "string" && code.startsWith("clippy::");
}

function clippyFinding(message: Rec | null): Finding {
  const spans = recordsOf(message?.spans) ?? [];
  const span = spans.find((s) => s.is_primary === true) ?? spans[0];
  const identity = `${str(recordOf(message?.code)?.code)} ${str(message?.message)}`.trim();
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
      const record = jsonObject(line);
      const message = recordOf(record?.message);
      if (record !== null && isClippyFinding(record, message)) {
        findings.push(clippyFinding(message));
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
  return at(
    `${m[4]} ${description}`,
    m[1],
    Number(m[2]),
    m[3] === undefined ? undefined : Number(m[3]),
  );
}

/** markdownlint-cli2: `Summary: N issues in M files` is the count; no
 * summary line means the tool never finished. */
export function countMarkdownlint(stdout: string, stderr: string, _exitCode: number): Tally | null {
  const output = `${stdout}\n${stderr}`;
  // v0.23 prints "Summary: N issues in M files"; the v0.21 a repository may pin prints "Summary: N error(s)".
  const match = output.match(/Summary: (\d+) (?:issue|error)/);
  if (match?.[1] === undefined) {
    return null;
  }
  const findings = output
    .split("\n")
    .map(markdownlintFinding)
    .filter((finding): finding is Finding => finding !== null);
  return tallyOf(findings, Number(match[1]));
}
