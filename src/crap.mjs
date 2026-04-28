/**
 * crap.mjs — CRAP formula + table formatter
 * Pure maths, no I/O, no dependencies.
 */

/**
 * CRAP(fn) = CC² × (1 - coverage)³ + CC
 * @param {number} cc - cyclomatic complexity (positive integer)
 * @param {number|null|undefined} coverageFraction - 0.0–1.0, or null/undefined
 * @returns {number|null}
 */
export function crapScore(cc, coverageFraction) {
  if (coverageFraction == null) return null;
  return cc * cc * Math.pow(1 - coverageFraction, 3) + cc;
}

/**
 * @param {number|null} score
 * @returns {'low'|'moderate'|'high'|null}
 */
export function riskLevel(score) {
  if (score == null) return null;
  if (score < 5) return 'low';
  if (score < 30) return 'moderate';
  return 'high';
}

/** Sort entries: descending by CRAP, null-coverage last. */
function sortEntries(entries) {
  return [...entries].sort(compareEntries);
}

function compareEntries(a, b) {
  if (a.crap == null) return compareNullA(a, b);
  if (b.crap == null) return -1;
  return b.crap - a.crap;
}

function compareNullA(a, b) {
  if (b.crap == null) return 0;
  return 1;
}

/** Count high/moderate risk entries. */
function riskCounts(sorted) {
  let highCount = 0;
  let moderateCount = 0;
  for (const entry of sorted) {
    const risk = riskLevel(entry.crap);
    if (risk === 'high') highCount++;
    if (risk === 'moderate') moderateCount++;
  }
  return { highCount, moderateCount };
}

/** Format coverage value for display. */
function fmtCov(coverage) {
  return coverage != null ? (coverage * 100).toFixed(1) + '%' : 'N/A';
}

/** Format CRAP value for display. */
function fmtCrap(crap) {
  return crap != null ? crap.toFixed(1) : 'N/A';
}

/** Format risk value for display. */
function fmtRisk(crap) {
  return riskLevel(crap) || 'N/A';
}

/** Risk summary string. */
function riskSummary(sorted) {
  const { highCount, moderateCount } = riskCounts(sorted);
  return `${highCount} functions at high risk, ${moderateCount} at moderate.`;
}

// ── Text formatter ──────────────────────────────────────────────────

function formatText(sorted) {
  const COL_FUNC = 30;
  const COL_FILE = 36;
  const COL_CC = 4;
  const COL_COV = 8;
  const COL_CRAP = 8;
  const COL_RISK = 10;

  const truncate = (str, max) => {
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + '…';
  };

  const pad = (str, width) => str.padEnd(width);
  const rpad = (str, width) => str.padStart(width);

  const lines = [];
  lines.push('CRAP Report');
  lines.push('===========');

  const header =
    pad('Function', COL_FUNC) + ' ' +
    pad('File', COL_FILE) + ' ' +
    rpad('CC', COL_CC) + ' ' +
    rpad('Cov%', COL_COV) + ' ' +
    rpad('CRAP', COL_CRAP) + '  ' +
    pad('Risk', COL_RISK);
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const entry of sorted) {
    const funcName = pad(truncate(entry.name, COL_FUNC), COL_FUNC);
    const fileName = pad(truncate(entry.file, COL_FILE), COL_FILE);
    const cc = rpad(String(entry.cc), COL_CC);
    const cov = rpad(fmtCov(entry.coverage), COL_COV);
    const crap = rpad(fmtCrap(entry.crap), COL_CRAP);
    const risk = pad(fmtRisk(entry.crap), COL_RISK);

    lines.push(`${funcName} ${fileName} ${cc} ${cov} ${crap}  ${risk}`);
  }

  lines.push('');
  lines.push(riskSummary(sorted));

  return lines.join('\n');
}

// ── Markdown formatter ──────────────────────────────────────────────

function formatMarkdown(sorted) {
  const lines = [];
  lines.push('## CRAP Report');
  lines.push('');
  lines.push('| Function | File | CC | Cov% | CRAP | Risk |');
  lines.push('|:---|:---|---:|---:|---:|:---|');

  for (const entry of sorted) {
    const name = entry.name;
    const file = entry.file;
    const cc = String(entry.cc);
    const cov = fmtCov(entry.coverage);
    const crap = fmtCrap(entry.crap);
    const risk = fmtRisk(entry.crap);

    lines.push(`| ${name} | ${file} | ${cc} | ${cov} | ${crap} | ${risk} |`);
  }

  lines.push('');
  lines.push(riskSummary(sorted));

  return lines.join('\n');
}

// ── HTML formatter ──────────────────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatHtml(sorted) {
  const lines = [];
  lines.push('<!DOCTYPE html>');
  lines.push('<html lang="en">');
  lines.push('<head>');
  lines.push('<meta charset="utf-8">');
  lines.push('<title>CRAP Report</title>');
  lines.push('<style>');
  lines.push('body { font-family: sans-serif; margin: 2em; }');
  lines.push('table { border-collapse: collapse; font-family: monospace; }');
  lines.push('th, td { padding: 4px 8px; border: 1px solid #ddd; }');
  lines.push('th { background: #f5f5f5; }');
  lines.push('.risk-low { color: green; }');
  lines.push('.risk-moderate { color: orange; }');
  lines.push('.risk-high { color: red; font-weight: bold; }');
  lines.push('.risk-na { color: #999; }');
  lines.push('</style>');
  lines.push('</head>');
  lines.push('<body>');
  lines.push('<h2>CRAP Report</h2>');
  lines.push('<table>');
  lines.push('<thead><tr><th>Function</th><th>File</th><th>CC</th><th>Cov%</th><th>CRAP</th><th>Risk</th></tr></thead>');
  lines.push('<tbody>');

  for (const entry of sorted) {
    const name = escapeHtml(entry.name);
    const file = escapeHtml(entry.file);
    const cc = String(entry.cc);
    const cov = fmtCov(entry.coverage);
    const crap = fmtCrap(entry.crap);
    const risk = fmtRisk(entry.crap);
    const riskClass = risk === 'N/A' ? 'risk-na' : `risk-${risk}`;

    lines.push(`<tr><td>${name}</td><td>${file}</td><td>${cc}</td><td>${cov}</td><td>${crap}</td><td class="${riskClass}">${risk}</td></tr>`);
  }

  lines.push('</tbody>');
  lines.push('</table>');
  lines.push(`<p>${riskSummary(sorted)}</p>`);
  lines.push('</body>');
  lines.push('</html>');

  return lines.join('\n');
}

/**
 * Format the CRAP report table.
 * @param {Array<{name: string, file: string, cc: number, coverage: number|null, crap: number|null}>} entries
 * @param {'text'|'markdown'|'html'} [format='text']
 * @returns {string}
 */
export function formatReport(entries, format = 'text') {
  const sorted = sortEntries(entries);

  if (format === 'markdown') return formatMarkdown(sorted);
  if (format === 'html') return formatHtml(sorted);
  return formatText(sorted);
}
