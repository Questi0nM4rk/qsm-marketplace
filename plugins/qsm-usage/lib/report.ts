// Renders one validated findings document (lib/findings.ts) into one self-contained HTML file:
// inline CSS, no script, no external resource, light and dark through prefers-color-scheme.

import type { Change, Finding, FindingsDocument, Topic } from "./findings.ts";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function totalSavingTokens(doc: FindingsDocument): number {
  return doc.topics.reduce(
    (sum, topic) => sum + topic.findings.reduce((s, f) => s + f.savingTokens, 0),
    0,
  );
}

function renderChange(change: Change): string {
  const detail = change.detail === undefined ? "" : ` (${escapeHtml(change.detail)})`;
  return `${escapeHtml(change.kind)}: ${escapeHtml(change.target)}${detail}`;
}

function renderSaving(finding: Finding): string {
  return finding.savingTokens > 0
    ? `~${finding.savingTokens} tokens/session`
    : escapeHtml(finding.savingNote ?? "");
}

function renderFinding(finding: Finding): string {
  return `<article class="finding">
        <h3>${escapeHtml(finding.title)}</h3>
        <p class="verdict"><span class="badge">${escapeHtml(finding.verdict)}</span></p>
        <p class="saving">saving: ${renderSaving(finding)}</p>
        <p class="evidence">${escapeHtml(finding.evidence)}</p>
        <p class="change">change: ${renderChange(finding.change)}</p>
        <p class="applied">${finding.applied ? "applied" : "not applied"}</p>
      </article>`;
}

function renderTopic(topic: Topic): string {
  const findings =
    topic.findings.length === 0
      ? '<p class="empty">no findings</p>'
      : topic.findings.map(renderFinding).join("\n      ");
  return `<section class="topic">
      <h2>${escapeHtml(topic.topic)}</h2>
      <p class="summary">${escapeHtml(topic.summary)}</p>
      ${findings}
    </section>`;
}

const STYLE = `
    :root { color-scheme: light dark; }
    body {
      font-family: system-ui, sans-serif;
      margin: 0;
      padding: 1.5rem;
      background: #ffffff;
      color: #1a1a1a;
    }
    header { margin-bottom: 1.5rem; }
    .total { font-size: 1.25rem; font-weight: bold; }
    .topic { margin-bottom: 2rem; }
    .finding {
      border: 1px solid #d0d0d0;
      border-radius: 6px;
      padding: 0.75rem 1rem;
      margin: 0.75rem 0;
    }
    .badge {
      display: inline-block;
      padding: 0.1rem 0.5rem;
      border-radius: 4px;
      background: #eeeeee;
      font-size: 0.85rem;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #14161a; color: #e6e6e6; }
      .finding { border-color: #3a3d42; }
      .badge { background: #2a2d32; }
    }
`;

/** The full HTML document: one `<style>` block, no `<script>`, no
 * `href`/`src` pointing outside the file. */
export function renderReport(doc: FindingsDocument): string {
  const total = totalSavingTokens(doc);
  const topics = doc.topics.map(renderTopic).join("\n    ");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>qsm-usage report</title>
  <style>${STYLE}</style>
</head>
<body>
  <header>
    <h1>qsm-usage report</h1>
    <p class="total">total saving: ~${total} tokens per session</p>
  </header>
  <main>
    ${topics}
  </main>
</body>
</html>
`;
}
