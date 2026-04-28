/**
 * coverage.mjs — LCOV parser + HTML fallback
 * Returns a Map<filePath, Map<lineNumber, covered>>
 */
/* global console */

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

function isCompiledOutputPath(path) {
  return /(?:^|[/\\])(dist|build)(?:[/\\]|$)/i.test(path);
}

function resolveLcovSource(raw, sourceFiles) {
  const normalised = normalisePath(raw);
  if (!sourceFiles || sourceFiles.has(normalised)) {
    return normalised;
  }

  const suffixed = suffixMatch(normalised, sourceFiles);
  if (suffixed) return suffixed;

  console.error(`[crap4js] Warning: no source file matches LCOV path: ${raw}`);
  return normalised;
}

function logLcovDebug(raw, normalised, resolved, sourceFiles) {
  if (!CRAP4JS_DEBUG_LCOV) return;
  console.error(
    `[LCOV] raw: ${raw}; normalised: ${normalised}; resolved: ${resolved}; ` +
      `sourceFiles: ${sourceFiles ? Array.from(sourceFiles).join(',') : 'none'}`
  );
}

/**
 * Parse LCOV content into a coverage map.
 * @param {string} lcovContent
 * @param {Set<string>|null} sourceFiles - known source files for suffix matching
 * @returns {Map<string, Map<number, boolean>>}
 */
function parseLcov(lcovContent, sourceFiles) {
  const coverage = new Map();
  const state = {
    currentFile: null,
    currentMap: null,
    distPathCount: 0,
    totalFileCount: 0,
  };

  const handlers = {
    SF: (line) => handleSourceFile(line, state, coverage, sourceFiles),
    DA: (line) => handleDataLine(line, state),
  };

  lcovContent.split('\n').forEach(rawLine => processLcovLine(rawLine.trim(), handlers, state));

  if (state.totalFileCount > 0 && state.distPathCount === state.totalFileCount) {
    console.error(
      '[crap4js] Warning: LCOV paths point to compiled output, not source. ' +
      'Check that sourceMap: true is set in tsconfig.json.'
    );
  }

  return coverage;
}

function processLcovLine(line, handlers, state) {
  handlers[line.slice(0, 2)]?.(line);
  if (line === 'end_of_record') {
    state.currentFile = null;
    state.currentMap = null;
  }
}

function handleSourceFile(line, state, coverage, sourceFiles) {
  const raw = line.slice(3);
  const normalised = normalisePath(raw);
  state.totalFileCount++;

  if (isCompiledOutputPath(normalised) || isCompiledOutputPath(raw)) {
    state.distPathCount++;
  }

  state.currentFile = resolveLcovSource(raw, sourceFiles);
  logLcovDebug(raw, normalised, state.currentFile, sourceFiles);
  state.currentMap = coverage.get(state.currentFile) || new Map();
  coverage.set(state.currentFile, state.currentMap);
}

function handleDataLine(line, state) {
  if (!state.currentMap) return;
  const parts = line.slice(3).split(',');
  const lineNo = parseInt(parts[0], 10);
  const hitCount = parseInt(parts[1], 10);
  if (!Number.isNaN(lineNo) && !Number.isNaN(hitCount)) {
    state.currentMap.set(lineNo, hitCount > 0);
  }
}

/**
 * Parse HTML coverage files as fallback.
 * @param {string} coverageDir
 * @returns {Map<string, Map<number, boolean>>}
 */
function parseHtmlFallback(coverageDir) {
  const coverage = new Map();
  const htmlFiles = globbySync(join(coverageDir, '**/*.html').replace(/\\/g, '/'));

  htmlFiles.forEach(htmlFile => processHtmlFile(htmlFile, coverage, coverageDir));
  return coverage;
}

function processHtmlFile(htmlFile, coverage, coverageDir) {
  const content = readFileSync(htmlFile, 'utf8');
  const lineMap = extractHtmlCoverage(content);
  if (lineMap.size === 0) return;

  const relPath = relative(coverageDir, htmlFile).replace(/\.html$/, '').replace(/\\/g, '/');
  coverage.set(relPath, lineMap);
}

function extractHtmlCoverage(content) {
  const lineMap = new Map();
  parseCoverageSpans(content, /<span[^>]*class="(covered|not-covered)"[^>]*data-line="(\d+)"[^>]*>/g, lineMap, 1, 2);
  parseCoverageSpans(content, /<span[^>]*data-line="(\d+)"[^>]*class="(covered|not-covered)"[^>]*>/g, lineMap, 2, 1);
  return lineMap;
}

function parseCoverageSpans(content, regex, lineMap, coveredIndex, lineIndex) {
  let match;
  while ((match = regex.exec(content)) !== null) {
    const covered = match[coveredIndex] === 'covered';
    const lineNo = parseInt(match[lineIndex], 10);
    lineMap.set(lineNo, covered);
  }
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
