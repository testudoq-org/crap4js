/**
 * coverage.mjs — LCOV parser + HTML fallback
 * Returns a Map<filePath, Map<lineNumber, covered>>
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, relative, join } from 'path';
import { globbySync } from 'globby';
import { CRAP4JS_DEBUG_LCOV } from './env.mjs';

/**
 * Normalise a path to a short relative form from cwd.
 * @param {string} raw
 * @returns {string}
 */
function normalisePath(raw) {
  let p = raw.trim();
  if (!p) return p;
  // Resolve absolute or relative path from cwd
  const abs = resolve(p);
  let rel = relative('.', abs);
  // Normalise to forward slashes
  rel = rel.replace(/\\/g, '/');
  // Strip leading ./
  if (rel.startsWith('./')) rel = rel.slice(2);
  return rel;
}

/**
 * Try suffix matching: find a source path that ends with the same N segments.
 * @param {string} lcovPath
 * @param {Set<string>} knownPaths
 * @returns {string|null}
 */
function suffixMatch(lcovPath, knownPaths) {
  const segments = lcovPath.replace(/\\/g, '/').split('/');
  for (let n = segments.length; n >= 1; n--) {
    const suffix = segments.slice(-n).join('/');
    for (const known of knownPaths) {
      if (known.endsWith(suffix)) return known;
    }
  }
  return null;
}

/**
 * Parse LCOV content into a coverage map.
 * @param {string} lcovContent
 * @param {Set<string>|null} sourceFiles - known source files for suffix matching
 * @returns {Map<string, Map<number, boolean>>}
 */
function parseLcov(lcovContent, sourceFiles) {
  const coverage = new Map();
  let currentFile = null;
  let currentMap = null;
  let distPathCount = 0;
  let totalFileCount = 0;

  for (const rawLine of lcovContent.split('\n')) {
    const line = rawLine.trim();

    if (line.startsWith('SF:')) {
      const raw = line.slice(3);
      let normalised = normalisePath(raw);
      totalFileCount++;

      // Check for dist/build path pattern (anywhere in the path)
      if (/(?:^|[/\\])(dist|build)(?:[/\\]|$)/i.test(normalised) ||
          /(?:^|[/\\])(dist|build)(?:[/\\]|$)/i.test(raw)) {
        distPathCount++;
      }

      let matchedPath = normalised;

      // Try direct match first, then suffix match
      if (sourceFiles && !sourceFiles.has(normalised)) {
        const suffixed = suffixMatch(normalised, sourceFiles);
        if (suffixed) {
          matchedPath = suffixed;
        } else {
          // No match — warn
          console.error(`[crap4js] Warning: no source file matches LCOV path: ${raw}`);
          matchedPath = normalised; // keep it anyway
        }
      }

      if (CRAP4JS_DEBUG_LCOV) {
        const matched = sourceFiles && sourceFiles.has(matchedPath) ? matchedPath : 'NO MATCH';
        console.error(`[LCOV] raw: ${raw} → normalised: ${normalised} → matched: ${matched}`);
      }

      currentFile = matchedPath;
      currentMap = coverage.get(currentFile) || new Map();
      coverage.set(currentFile, currentMap);
    } else if (line.startsWith('DA:')) {
      if (!currentMap) continue;
      const parts = line.slice(3).split(',');
      const lineNo = parseInt(parts[0], 10);
      const hitCount = parseInt(parts[1], 10);
      if (!isNaN(lineNo) && !isNaN(hitCount)) {
        currentMap.set(lineNo, hitCount > 0);
      }
    } else if (line === 'end_of_record') {
      currentFile = null;
      currentMap = null;
    }
  }

  // Source map warning
  if (totalFileCount > 0 && distPathCount === totalFileCount) {
    console.error(
      '[crap4js] Warning: LCOV paths point to compiled output, not source. ' +
      'Check that sourceMap: true is set in tsconfig.json.'
    );
  }

  return coverage;
}

/**
 * Parse HTML coverage files as fallback.
 * @param {string} coverageDir
 * @returns {Map<string, Map<number, boolean>>}
 */
function parseHtmlFallback(coverageDir) {
  const coverage = new Map();
  const htmlFiles = globbySync(join(coverageDir, '**/*.html').replace(/\\/g, '/'));

  for (const htmlFile of htmlFiles) {
    const content = readFileSync(htmlFile, 'utf8');
    const lineMap = new Map();
    // Simple regex to extract data-line and class from span elements
    const spanRegex = /<span[^>]*class="(covered|not-covered)"[^>]*data-line="(\d+)"[^>]*>/g;
    const spanRegex2 = /<span[^>]*data-line="(\d+)"[^>]*class="(covered|not-covered)"[^>]*>/g;
    let match;

    while ((match = spanRegex.exec(content)) !== null) {
      const covered = match[1] === 'covered';
      const lineNo = parseInt(match[2], 10);
      lineMap.set(lineNo, covered);
    }
    while ((match = spanRegex2.exec(content)) !== null) {
      const covered = match[2] === 'covered';
      const lineNo = parseInt(match[1], 10);
      lineMap.set(lineNo, covered);
    }

    if (lineMap.size > 0) {
      // Derive file path from HTML file name
      const relPath = relative(coverageDir, htmlFile).replace(/\.html$/, '').replace(/\\/g, '/');
      coverage.set(relPath, lineMap);
    }
  }

  return coverage;
}

/**
 * Load coverage data from a directory.
 * @param {string} coverageDir
 * @param {Set<string>|null} [sourceFiles=null] - known source paths for matching
 * @returns {Map<string, Map<number, boolean>>}
 */
export function loadCoverage(coverageDir, sourceFiles = null) {
  const lcovPath = join(coverageDir, 'lcov.info');

  if (existsSync(lcovPath)) {
    const content = readFileSync(lcovPath, 'utf8');
    return parseLcov(content, sourceFiles);
  }

  // HTML fallback
  if (existsSync(coverageDir)) {
    return parseHtmlFallback(coverageDir);
  }

  return new Map();
}

// Export internals for testing
export { parseLcov, normalisePath, suffixMatch };
