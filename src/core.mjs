/**
 * core.mjs — CLI orchestrator for crap4js
 */
/* eslint-env node */
/* global console, process */

import { extractFunctions } from './complexity.mjs';
import { loadCoverage } from './coverage.mjs';
import { crapScore, formatReport } from './crap.mjs';
import { globbySync } from 'globby';
import { execSync } from 'child_process';
import { readFileSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { Command } from 'commander';
import { dirname, resolve } from 'path';
import { pathToFileURL } from 'url';

/** Known safe runner prefixes for coverage commands. */
const ALLOWED_RUNNERS = ['vitest', 'jest', 'c8', 'nyc', 'npx', 'node', 'npm', 'pnpm', 'yarn'];

/** Shell metacharacters that indicate command injection. */
const SHELL_META = /[;|&$`(){}!<>\n\r]/;

/**
 * Validate a coverage command against injection risks.
 * @param {string} cmd
 * @throws {Error} if the command looks unsafe
 */
export function validateCoverageCmd(cmd) {
  if (typeof cmd !== 'string' || cmd.trim().length === 0) {
    throw new Error('[crap4js] Invalid coverage command: must be a non-empty string.');
  }
  if (SHELL_META.test(cmd)) {
    throw new Error(`[crap4js] Unsafe coverage command — shell metacharacters are not allowed: ${cmd}`);
  }
  const firstToken = cmd.trim().split(/\s+/)[0].toLowerCase();
  if (!ALLOWED_RUNNERS.some(r => firstToken === r || firstToken.endsWith(`/${r}`) || firstToken.endsWith(`\\${r}`))) {
    throw new Error(`[crap4js] Unknown coverage runner "${firstToken}". Allowed: ${ALLOWED_RUNNERS.join(', ')}.`);
  }
}

/**
 * Validate that a coverage directory path is safe.
 * Rejects relative paths containing ".." traversal segments.
 * Absolute paths are allowed (user explicitly controls them).
 * @param {string} dir
 * @throws {Error} if the path is invalid or uses traversal
 */
export function validateCoverageDir(dir) {
  if (typeof dir !== 'string' || dir.trim().length === 0) {
    throw new Error('[crap4js] Invalid coverage directory: must be a non-empty string.');
  }
  // Only police relative paths — absolute paths are intentional
  const isAbsolute = resolve(dir) === dir || /^[a-zA-Z]:[\\/]/.test(dir);
  if (!isAbsolute && dir.split(/[\\/]/).includes('..')) {
    throw new Error(`[crap4js] Coverage directory must not traverse outside the project: ${dir}`);
  }
}

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

  const pkgPath = resolve('package.json');
  if (!existsSync(pkgPath)) return defaults;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const crap = pkg.crap || {};
    return {
      coverageCommand: crap.coverageCommand || defaults.coverageCommand,
      coverageDir: crap.coverageDir || defaults.coverageDir,
      sourceGlob: crap.sourceGlob || defaults.sourceGlob,
    };
  } catch {
    return defaults;
  }
}

function executeCoverageCommand(coverageCmd, format) {
  const covStdio = format === 'text'
    ? 'inherit'
    : ['inherit', process.stderr, 'inherit'];
  try {
    execSync(coverageCmd, { stdio: covStdio });
    return false;
  } catch (err) {
    console.error('[crap4js] Warning: coverage command exited with non-zero status. Continuing with partial coverage.');
    if (err && err.status != null) {
      console.error(`[crap4js] Warning: coverage command exited with status ${err.status}.`);
    }
    return true;
  }
}

function loadSourceFiles(sourceGlob) {
  return globbySync(sourceGlob).map(f => f.replace(/\\/g, '/'));
}

function filterSourceFiles(sourceFiles, filters) {
  if (!filters.length) return sourceFiles;
  return sourceFiles.filter(f => filters.some(frag => f.includes(frag)));
}

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

function loadCoverageData(coverageDir, sourceFiles) {
  const sourceFileSet = new Set(sourceFiles);
  return loadCoverage(coverageDir, sourceFileSet);
}

function analyzeSourceFiles(filesToAnalyse, coverageData) {
  const entries = [];

  for (const filePath of filesToAnalyse) {
    let source;
    try {
      source = readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error(`[crap4js] Warning: could not read ${filePath}: ${err.message}`);
      continue;
    }

    let functions;
    try {
      functions = extractFunctions(source, filePath);
    } catch (err) {
      console.error(`[crap4js] Warning: parse error in ${filePath}: ${err.message}`);
      continue;
    }

    const fileLines = coverageData.get(filePath);
    for (const fn of functions) {
      const cov = coverageFraction(fileLines, fn.startLine, fn.endLine);
      const crap = crapScore(fn.cc, cov);
      entries.push({
        name: fn.name,
        file: fn.file,
        cc: fn.cc,
        coverage: cov,
        crap,
      });
    }
  }

  return entries;
}

/**
 * Compute coverage fraction for a function within [startLine..endLine].
 * @param {Map<number, boolean>|undefined} fileLines
 * @param {number} startLine
 * @param {number} endLine
 * @returns {number|null}
 */
function coverageFraction(fileLines, startLine, endLine) {
  if (!fileLines) return null;

  let instrumented = 0;
  let covered = 0;

  for (let line = startLine; line <= endLine; line++) {
    if (fileLines.has(line)) {
      instrumented++;
      if (fileLines.get(line)) covered++;
    }
  }

  if (instrumented === 0) return null;
  return covered / instrumented;
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
    coverageDir: options.coverageDir || config.coverageDir,
    coverageCmd: options.coverageCmd || config.coverageCommand,
    filters: options.filters || [],
    sourceGlob: options.sourceGlob || config.sourceGlob,
    format: options.format || 'text',
    reportFile: options.reportFile,
    shouldDelete: options.delete !== false,
    shouldRunCoverage: options.runCoverage !== false,
  };
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

function finalizeRunOutput(entries, coverageCommandFailed, coverageLoaded, reportFile, format) {
  let output = formatReport(entries, format);
  const hasHighRisk = entries.some(e => e.crap != null && e.crap > 30);
  const shouldError = coverageCommandFailed && !coverageLoaded;

  if (shouldError) {
    output = '[crap4js] ERROR: Coverage command failed and no coverage data was loaded. Fix the workspace tests/coverage pipeline and rerun.\n\n' + output;
  }

  writeReportFile(output, reportFile);
  return { output, exitCode: shouldError ? 1 : (hasHighRisk ? 1 : 0) };
}

export function run(options = {}) {
  const config = readConfig();
  const opts = normalizeRunOptions(options, config);

  validateCoverageDir(opts.coverageDir);
  maybeDeleteCoverageDir(opts.coverageDir, opts.shouldDelete);
  const coverageCommandFailed = maybeRunCoverage(opts.shouldRunCoverage, opts.coverageCmd, opts.format);

  const sourceFiles = loadSourceFiles(opts.sourceGlob);
  const coverageData = loadCoverageData(opts.coverageDir, sourceFiles);
  const coverageLoaded = coverageData.size > 0;

  if (coverageCommandFailed && !coverageLoaded) {
    console.error('[crap4js] Error: Coverage command failed and no coverage data was loaded. Fix the workspace tests/coverage pipeline and rerun.');
  }

  const entries = analyzeSourceFiles(filterSourceFiles(sourceFiles, opts.filters), coverageData);
  return finalizeRunOutput(entries, coverageCommandFailed, coverageLoaded, opts.reportFile, opts.format);
}

// CLI setup — only runs when imported by cli.mjs or invoked directly
export function cli(argv) {
  const program = new Command();

  program
    .name('crap4js')
    .description('CRAP metric for JavaScript/TypeScript')
    .argument('[filters...]', 'filter by file path fragment (OR logic)')
    .option('--coverage-dir <dir>', 'coverage directory')
    .option('--coverage-cmd <cmd>', 'coverage command')
    .option('--report-file <path>', 'write a dedicated report file')
    .option('--no-delete', 'skip deleting coverage dir before run')
    .option('--format <format>', 'output format: text, markdown, html', 'text')
    .action((filters, opts) => {
      const result = run({
        filters,
        coverageDir: opts.coverageDir,
        coverageCmd: opts.coverageCmd,
        reportFile: opts.reportFile,
        delete: opts.delete,
        format: opts.format,
      });

      console.log(result.output);
      process.exitCode = result.exitCode;
    });

  program.parse(argv || process.argv);
}

// Auto-run CLI when this module is the entry point
const runningAsMain = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (runningAsMain) {
  cli();
}
