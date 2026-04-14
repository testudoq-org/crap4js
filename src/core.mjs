/**
 * core.mjs — CLI orchestrator for crap4js
 */

import { extractFunctions } from './complexity.mjs';
import { loadCoverage } from './coverage.mjs';
import { crapScore, formatReport } from './crap.mjs';
import { globbySync } from 'globby';
import { execSync } from 'child_process';
import { readFileSync, rmSync, existsSync } from 'fs';
import { Command } from 'commander';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

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
export function run(options = {}) {
  const config = readConfig();
  const coverageDir = options.coverageDir || config.coverageDir;
  const coverageCmd = options.coverageCmd || config.coverageCommand;
  const filters = options.filters || [];
  const shouldDelete = options.delete !== false;
  const shouldRunCoverage = options.runCoverage !== false;

  // Step 2: Delete coverage dir unless --no-delete
  if (shouldDelete && existsSync(coverageDir)) {
    rmSync(coverageDir, { recursive: true, force: true });
  }

  // Step 3: Run coverage command
  if (shouldRunCoverage) {
    try {
      execSync(coverageCmd, { stdio: 'inherit' });
    } catch {
      console.error('[crap4js] Warning: coverage command exited with non-zero status. Continuing with partial coverage.');
    }
  }

  // Step 4: Load coverage data
  const sourceGlob = options.sourceGlob || config.sourceGlob;
  let sourceFiles = globbySync(sourceGlob);

  // Normalise paths
  sourceFiles = sourceFiles.map(f => f.replace(/\\/g, '/'));

  const sourceFileSet = new Set(sourceFiles);
  const coverageData = loadCoverage(coverageDir, sourceFileSet);

  // Step 5: Filter source files
  let filesToAnalyse = sourceFiles;
  if (filters.length > 0) {
    filesToAnalyse = sourceFiles.filter(f =>
      filters.some(frag => f.includes(frag))
    );
  }

  // Step 6: Analyse each file
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

  // Step 7: Format and output
  const format = options.format || 'text';
  const output = formatReport(entries, format);

  // Step 8: Exit code
  const hasHighRisk = entries.some(e => e.crap != null && e.crap > 30);

  return { output, exitCode: hasHighRisk ? 1 : 0 };
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
    .option('--no-delete', 'skip deleting coverage dir before run')
    .option('--format <format>', 'output format: text, markdown, html', 'text')
    .action((filters, opts) => {
      const result = run({
        filters,
        coverageDir: opts.coverageDir,
        coverageCmd: opts.coverageCmd,
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
