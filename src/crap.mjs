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

/**
 * Format the CRAP report table.
 * @param {Array<{name: string, file: string, cc: number, coverage: number|null, crap: number|null}>} entries
 * @returns {string}
 */
export function formatReport(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (a.crap == null && b.crap == null) return 0;
    if (a.crap == null) return 1;
    if (b.crap == null) return -1;
    return b.crap - a.crap;
  });

  const COL_FUNC = 30;
  const COL_FILE = 36;
  const COL_CC = 4;
  const COL_COV = 8;
  const COL_CRAP = 8;

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
    rpad('CRAP', COL_CRAP);
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const entry of sorted) {
    const funcName = pad(truncate(entry.name, COL_FUNC), COL_FUNC);
    const fileName = pad(truncate(entry.file, COL_FILE), COL_FILE);
    const cc = rpad(String(entry.cc), COL_CC);
    const cov = entry.coverage != null
      ? rpad((entry.coverage * 100).toFixed(1) + '%', COL_COV)
      : rpad('N/A', COL_COV);
    const crap = entry.crap != null
      ? rpad(entry.crap.toFixed(1), COL_CRAP)
      : rpad('N/A', COL_CRAP);

    lines.push(`${funcName} ${fileName} ${cc} ${cov} ${crap}`);
  }

  let highCount = 0;
  let moderateCount = 0;
  for (const entry of sorted) {
    const risk = riskLevel(entry.crap);
    if (risk === 'high') highCount++;
    if (risk === 'moderate') moderateCount++;
  }
  lines.push('');
  lines.push(`${highCount} functions at high risk, ${moderateCount} at moderate.`);

  return lines.join('\n');
}
