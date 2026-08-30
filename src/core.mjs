/**
 * @typedef {object} FunctionReportEntry
 * @property {string} id
 * @property {string} name
 * @property {string} file
 * @property {number} startLine
 * @property {number} endLine
 * @property {number} cc
 * @property {{ covered: number, instrumented: number, percentage: number | null }} coverage
 * @property {number|null} crap
 * @property {'low'|'moderate'|'high'|null} risk
 */
/* eslint-env node */

import { extractFunctions } from './complexity.mjs';
import { loadCoverage } from './coverage.mjs';
import { crapScore, formatReport, riskLevel } from './crap.mjs';
import { extractCrapReportBlock } from './extract.mjs';
import { CRAP4JS_PROFILE } from './env.mjs';
import { globbySync } from 'globby';
import { execSync } from 'child_process';
import { readFileSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { Command } from 'commander';
import { dirname, resolve } from 'path';
import { pathToFileURL } from 'url';

// ── Validation ──────────────────────────────────────────────────────

/** Known safe runner prefixes for coverage commands. */
const ALLOWED_RUNNERS = ['vitest', 'jest', 'c8', 'nyc', 'npx', 'node', 'npm', 'pnpm', 'yarn'];

/** Shell metacharacters that indicate command injection. */
const SHELL_META = /[;|&$`(){}!<>\n\r]/;

/**
 * Time a synchronous phase when CRAP4JS_PROFILE is enabled.
 * Zero overhead when disabled.
 * @param {string} name
 * @param {() => T} fn
 * @returns {T}
 */
function phase(name, fn) {
  if (!CRAP4JS_PROFILE) return fn();
  const start = process.hrtime.bigint();
  const result = fn();
  const elapsed = Number(process.hrtime.bigint() - start) / 1_000_000;
  console.error(`[PROFILE] ${name}:${' '.repeat(Math.max(0, 26 - name.length))}${elapsed.toFixed(0)}ms`);
  return result;
}

/**
 * Validate a coverage command against injection risks.
 * @param {string} cmd
 * @throws {Error} if the command looks unsafe
 */
export function validateCoverageCmd(cmd) {
  validateNonEmptyString(cmd, 'coverage command');
  validateNoShellMetacharacters(cmd);
  validateAllowedCoverageRunner(cmd);
}

/**
 * Validate that a coverage directory path is safe.
 * Rejects relative paths containing ".." traversal segments.
 * Absolute paths are allowed (user explicitly controls them).
 * @param {string} dir
 * @throws {Error} if the path is invalid or uses traversal
 */
export function validateCoverageDir(dir) {
  validateNonEmptyString(dir, 'coverage directory');
  if (isAbsolutePath(dir) || isDrivePath(dir)) return;
  throwIfTraversal(dir);
}

function validateNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`[crap4js] Invalid ${label}: must be a non-empty string.`);
  }
}

function validateNoShellMetacharacters(cmd) {
  if (SHELL_META.test(cmd)) {
    throw new Error(`[crap4js] Unsafe coverage command — shell metacharacters are not allowed: ${cmd}`);
  }
}

function validateAllowedCoverageRunner(cmd) {
  const firstToken = cmd.trim().split(/\s+/)[0].toLowerCase();
  if (!allowedCoverageRunner(firstToken)) {
    throw new Error(`[crap4js] Unknown coverage runner "${firstToken}". Allowed: ${ALLOWED_RUNNERS.join(', ')}.`);
  }
}

function allowedCoverageRunner(firstToken) {
  return ALLOWED_RUNNERS.some(r =>
    firstToken === r || firstToken.endsWith(`/${r}`) || firstToken.endsWith(`\\${r}`)
  );
}

function throwIfTraversal(dir) {
  if (hasTraversal(dir)) {
    throw new Error(`[crap4js] Coverage directory must not traverse outside the project: ${dir}`);
  }
}

function isAbsolutePath(dir) {
  return resolve(dir) === dir;
}

function isDrivePath(dir) {
  return /^[a-zA-Z]:\//.test(dir);
}

function hasTraversal(dir) {
  return dir.split('/').includes('..');
}

// ── Configuration ──────────────────────────────────────────────────

/**
 * Read the "crap" config block from package.json in cwd.
 * @returns {{ coverageCommand: string, coverageDir: string, sourceGlob: string[] }}
 */
function readConfig() {
  const defaults = {
    coverageCommand: 'vitest run --coverage',
    coverageDir: 'coverage',
    sourceGlob: ['src/**/*.{js,mjs,ts,tsx}', '!**/*.test.*', '!**/node_modules/**'],
  };

  const crap = loadPackageJson()?.crap ?? {};
  const {
    coverageCommand = defaults.coverageCommand,
    coverageDir = defaults.coverageDir,
    sourceGlob = defaults.sourceGlob,
  } = crap;

  return { coverageCommand, coverageDir, sourceGlob };
}

function loadPackageJson() {
  const pkgPath = resolve('package.json');
  if (!existsSync(pkgPath)) return null;

  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

// ── Coverage execution ─────────────────────────────────────────────

function executeCoverageCommand(coverageCmd, format) {
  const covStdio = coverageStdio(format);
  try {
    execSync(coverageCmd, { stdio: covStdio });
    return false;
  } catch (err) {
    reportCoverageCommandError(err);
    return true;
  }
}

function coverageStdio(format) {
  return format === 'text'
    ? 'inherit'
    : ['inherit', process.stderr, 'inherit'];
}

function reportCoverageCommandError(err) {
  console.error('[crap4js] Warning: coverage command exited with non-zero status. Continuing with partial coverage.');
  if (err?.status != null) {
    console.error(`[crap4js] Warning: coverage command exited with status ${err.status}.`);
  }
}

// ── Source discovery ────────────────────────────────────────────────

function loadSourceFiles(sourceGlob) {
  return globbySync(sourceGlob).map(f => f.replace(/\\/g, '/'));
}

function filterSourceFiles(sourceFiles, filters) {
  if (!filters.length) return sourceFiles;
  return sourceFiles.filter(f => filters.some(frag => f.includes(frag)));
}

// ── I/O ────────────────────────────────────────────────────────────

function writeReportFile(output, reportFile) {
  if (!reportFile) return;

  const reportPath = resolve(reportFile);
  const reportDir = dirname(reportPath);
  try {
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(reportPath, output, 'utf8');
  } catch (err) {
    console.error(`[crap4js] Warning: could not write report file ${reportPath}: ${err.message}`);
  }
}

function writeRawReportFile(rawReportFile, formattedOutput) {
  if (!rawReportFile) return;

  const block = extractCrapReportBlock(formattedOutput);
  if (block === null) return;

  const rawPath = resolve(rawReportFile);
  const rawDir = dirname(rawPath);
  try {
    mkdirSync(rawDir, { recursive: true });
    writeFileSync(rawPath, block, 'utf8');
  } catch (err) {
    console.error(`[crap4js] Warning: could not write raw report file ${rawPath}: ${err.message}`);
  }
}

function loadCoverageData(coverageDir, sourceFiles) {
  const sourceFileSet = new Set(sourceFiles);
  return loadCoverage(coverageDir, sourceFileSet);
}

/**
 * Innermost-wins coverage ownership.
 *
 * For each instrumented line, assign it to the last (innermost) function
 * whose range [startLine, endLine] contains it. Because the function list
 * is sorted by startLine, walking left-to-right and tracking the last match
 * yields the innermost containing function. Parent and nested functions
 * therefore have disjoint instrumented-line sets.
 *
 * Worst-case complexity: O(F log F + F × L), where F is the number of
 * functions and L is the number of instrumented lines. In practice the
 * early-termination condition (lineNo < fn.startLine → break) makes the
 * inner loop effectively O(depth) for well-nested code.
 *
 * @param {Map<number, boolean>} fileLines
 * @param {Array<{startLine: number, endLine: number}>} functions - sorted by startLine
 * @param {number[]} sortedKeys
 * @returns {Map<number, Set<number>>} ownership map: function index -> owned line numbers
 */
export function assignCoverageOwnership(fileLines, functions, sortedKeys) {
  if (!fileLines || !sortedKeys || sortedKeys.length === 0) {
    const empty = new Map();
    for (let i = 0; i < functions.length; i++) empty.set(i, new Set());
    return empty;
  }

  const ownership = new Map();
  for (let i = 0; i < functions.length; i++) {
    ownership.set(i, new Set());
  }

  for (const lineNo of sortedKeys) {
    let innermostIndex = -1;
    for (let i = 0; i < functions.length; i++) {
      const fn = functions[i];
      if (lineNo < fn.startLine) break; // functions sorted by startLine
      if (lineNo <= fn.endLine) {
        innermostIndex = i;
      }
    }
    if (innermostIndex !== -1) {
      ownership.get(innermostIndex).add(lineNo);
    }
  }

  return ownership;
}

// ── Analysis ───────────────────────────────────────────────────────

function analyzeSourceFiles(filesToAnalyse, coverageData) {
  return filesToAnalyse.flatMap(filePath => analyzeFile(filePath, coverageData));
}

export function analyzeFile(filePath, coverageData) {
  let source;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`[crap4js] Warning: could not read ${filePath}: ${err.message}`);
    return [];
  }

  let functions;
  try {
    functions = extractFunctions(source, filePath);
  } catch (err) {
    console.error(`[crap4js] Warning: parse error in ${filePath}: ${err.message}`);
    return [];
  }

  const fileLines = coverageData.get(filePath);
  const sortedKeys = buildCoverageIndex(fileLines);

  // Innermost-wins: sort functions by startLine and assign each instrumented
  // line to the last (deepest) function whose range contains it.
  const sorted = [...functions].sort((a, b) => a.startLine - b.startLine);
  const ownership = assignCoverageOwnership(fileLines, sorted, sortedKeys);

  const coverageByFunction = new Map();
  for (let i = 0; i < sorted.length; i++) {
    const owned = ownership.get(i) || new Set();
    const instrumented = owned.size;
    const covered = [...owned].filter(line => fileLines.get(line)).length;
    coverageByFunction.set(sorted[i], { instrumented, covered });
  }

  return functions.map(fn => {
    const { covered, instrumented } = coverageByFunction.get(fn) || { instrumented: 0, covered: 0 };
    const fraction = instrumented === 0 ? null : covered / instrumented;
    const crap = crapScore(fn.cc, fraction);
    return {
      id: `${fn.file}:${fn.startLine}:${fn.name}`,
      name: fn.name,
      file: fn.file,
      startLine: fn.startLine,
      endLine: fn.endLine,
      cc: fn.cc,
      coverage: {
        covered,
        instrumented,
        percentage: fraction,
      },
      crap,
      risk: riskLevel(crap),
    };
  });
}

export function buildCoverageIndex(fileLines) {
  if (!fileLines) return null;
  return [...fileLines.keys()].sort((a, b) => a - b);
}

/**
 * Run the full CRAP analysis pipeline.
 * Exported for testing.
 * @param {object} options
 * @param {string[]} [options.filters]
 * @param {string} [options.coverageDir]
 * @param {string} [options.coverageCmd]
 * @param {string[]} [options.sourceGlob]
 * @param {boolean} [options.delete]
 * @param {boolean} [options.runCoverage]
 * @returns {{ output: string, exitCode: number }}
 */
function normalizeRunOptions(options, config) {
  return {
    coverageDir: getOrDefault(options.coverageDir, config.coverageDir),
    coverageCmd: getOrDefault(options.coverageCmd, config.coverageCommand),
    filters: getOrDefault(options.filters, []),
    sourceGlob: getOrDefault(options.sourceGlob, config.sourceGlob),
    format: getOrDefault(options.format, 'text'),
    reportFile: options.reportFile,
    rawReportFile: options.rawReportFile,
    shouldDelete: notFalse(options.delete),
    shouldRunCoverage: notFalse(options.runCoverage),
  };
}

function getOrDefault(value, fallback) {
  return value === undefined ? fallback : value;
}

function notFalse(value) {
  return value !== false;
}

function maybeRunCoverage(shouldRunCoverage, coverageCmd, format) {
  if (!shouldRunCoverage) return false;
  validateCoverageCmd(coverageCmd);
  return executeCoverageCommand(coverageCmd, format);
}

function maybeDeleteCoverageDir(coverageDir, shouldDelete) {
  if (!shouldDelete) return;
  if (existsSync(coverageDir)) {
    rmSync(coverageDir, { recursive: true, force: true });
  }
}

// ── Rendering ──────────────────────────────────────────────────────

function finalizeRunOutput(entries, coverageCommandFailed, coverageLoaded, reportFile, rawReportFile, format) {
  const output = renderFinalOutput(entries, coverageCommandFailed, coverageLoaded, reportFile, rawReportFile, format);
  return { output, exitCode: finalRunExitCode(entries, coverageCommandFailed, coverageLoaded) };
}

function renderFinalOutput(entries, coverageCommandFailed, coverageLoaded, reportFile, rawReportFile, format) {
  let output = formatReport(entries, format);
  if (coverageCommandFailed && !coverageLoaded) {
    output = '[crap4js] ERROR: Coverage command failed and no coverage data was loaded. Fix the workspace tests/coverage pipeline and rerun.\n\n' + output;
  }

  writeReportFile(output, reportFile);
  writeRawReportFile(rawReportFile, output);
  return output;
}

// ── Exit code ──────────────────────────────────────────────────────

function finalRunExitCode(entries, coverageCommandFailed, coverageLoaded) {
  if (coverageCommandFailed && !coverageLoaded) return 1;
  return entries.some(e => e.crap != null && e.crap >= 30) ? 1 : 0;
}

export function run(options = {}) {
  const config = readConfig();
  const opts = normalizeRunOptions(options, config);

  // Note: phases are intentionally merged where sub-phases are not
  // bottlenecks. Coverage matching is inside AST parse + complexity;
  // CRAP calculation is merged with sorting + formatting.
  validateCoverageDir(opts.coverageDir);
  maybeDeleteCoverageDir(opts.coverageDir, opts.shouldDelete);
  const coverageCommandFailed = phase('coverage command', () => maybeRunCoverage(opts.shouldRunCoverage, opts.coverageCmd, opts.format));

  const sourceFiles = phase('source discovery', () => loadSourceFiles(opts.sourceGlob));
  const coverageData = phase('coverage load', () => loadCoverageData(opts.coverageDir, sourceFiles));
  const coverageLoaded = coverageData.size > 0;

  if (coverageCommandFailed && !coverageLoaded) {
    console.error('[crap4js] Error: Coverage command failed and no coverage data was loaded. Fix the workspace tests/coverage pipeline and rerun.');
  }

  const entries = phase('AST parse + complexity', () => analyzeSourceFiles(filterSourceFiles(sourceFiles, opts.filters), coverageData));
  return phase('CRAP calculation + sorting + formatting', () => finalizeRunOutput(entries, coverageCommandFailed, coverageLoaded, opts.reportFile, opts.rawReportFile, opts.format));
}

// CLI setup — only runs when imported by cli.mjs or invoked directly
function createCliProgram() {
  const program = new Command();

  program
    .name('crap4js')
    .description('CRAP metric for JavaScript/TypeScript')
    .argument('[filters...]', 'filter by file path fragment (OR logic)')
    .option('--coverage-dir <dir>', 'coverage directory')
    .option('--coverage-cmd <cmd>', 'coverage command')
    .option('--report-file <path>', 'write a dedicated report file')
    .option('--raw-report-file <path>', 'write a raw report file with only the boundary-delimited report block')
    .option('--no-delete', 'skip deleting coverage dir before run')
    .option('--format <format>', 'output format: text, markdown, html, json', 'text')
    .action(handleCliAction);

  return program;
}

function handleCliAction(filters, opts) {
  const result = run({
    filters,
    coverageDir: opts.coverageDir,
    coverageCmd: opts.coverageCmd,
    reportFile: opts.reportFile,
    rawReportFile: opts.rawReportFile,
    delete: opts.delete,
    format: opts.format,
  });

  console.log(result.output);
  process.exitCode = result.exitCode;
}

export function cli(argv) {
  const program = createCliProgram();
  program.parse(argv || process.argv);
}

// Auto-run CLI when this module is the entry point
const runningAsMain = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (runningAsMain) {
  cli();
}
