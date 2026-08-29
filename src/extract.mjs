/**
 * extract.mjs — boundary extraction for CRAP report text
 * Pure synchronous function, no I/O, no dependencies.
 */

const START_MARKERS = ['CRAP Report', '## CRAP Report', '<!DOCTYPE html>', '<h2>CRAP Report</h2>'];
const END_MARKER = '% Coverage report from';

/**
 * Extract the boundary-delimited CRAP report block from text.
 *
 * Returns the substring from the first line matching one of the known
 * format start markers (text `CRAP Report`, markdown `## CRAP Report`,
 * html `<!DOCTYPE html>` / `<h2>CRAP Report</h2>`) through the line before
 * the first subsequent line that includes END_MARKER.
 * If no start marker is found, returns null.
 * If no end marker is found after the start, returns from start to EOF.
 *
 * @param {string} text - full formatted report text
 * @returns {string|null} the report block, or null if start marker is missing
 */
export function extractCrapReportBlock(text) {
  if (typeof text !== 'string') return null;

  const lines = text.split('\n');
  const startIndex = lines.findIndex(line => START_MARKERS.includes(line));
  if (startIndex === -1) return null;

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].includes(END_MARKER)) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join('\n');
}
