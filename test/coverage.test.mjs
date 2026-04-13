import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseLcov, normalisePath, suffixMatch } from '../src/coverage.mjs';
import { loadCoverage } from '../src/coverage.mjs';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('coverage.mjs', () => {
  let stderrSpy;

  beforeEach(() => {
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe('normalisePath', () => {
    it('strips leading ./', () => {
      const result = normalisePath('./src/foo.mjs');
      expect(result).toBe('src/foo.mjs');
    });

    it('normalises src/foo.mjs as-is', () => {
      const result = normalisePath('src/foo.mjs');
      expect(result).toBe('src/foo.mjs');
    });
  });

  describe('suffixMatch', () => {
    it('matches on last segments', () => {
      const known = new Set(['src/utils/helpers.mjs', 'src/auth/validator.mjs']);
      expect(suffixMatch('project/src/auth/validator.mjs', known)).toBe('src/auth/validator.mjs');
    });

    it('returns null if no match', () => {
      const known = new Set(['src/foo.mjs']);
      expect(suffixMatch('totally/different/path.mjs', known)).toBeNull();
    });
  });

  describe('parseLcov', () => {
    it('parses basic LCOV with two files, mixed covered/uncovered', () => {
      const lcov = [
        'SF:src/foo.mjs',
        'DA:1,1',
        'DA:2,0',
        'DA:3,5',
        'end_of_record',
        'SF:src/bar.mjs',
        'DA:1,0',
        'DA:2,1',
        'end_of_record',
      ].join('\n');

      const sourceFiles = new Set(['src/foo.mjs', 'src/bar.mjs']);
      const result = parseLcov(lcov, sourceFiles);

      expect(result.size).toBe(2);

      const foo = result.get('src/foo.mjs');
      expect(foo.get(1)).toBe(true);
      expect(foo.get(2)).toBe(false);
      expect(foo.get(3)).toBe(true);

      const bar = result.get('src/bar.mjs');
      expect(bar.get(1)).toBe(false);
      expect(bar.get(2)).toBe(true);
    });

    it('handles ./src/foo.mjs and src/foo.mjs both normalising to src/foo.mjs', () => {
      const lcov = [
        'SF:./src/foo.mjs',
        'DA:1,1',
        'end_of_record',
      ].join('\n');

      const sourceFiles = new Set(['src/foo.mjs']);
      const result = parseLcov(lcov, sourceFiles);
      expect(result.has('src/foo.mjs')).toBe(true);
    });

    it('uses suffix matching when direct path fails', () => {
      const lcov = [
        'SF:/home/ci/project/src/auth/validator.mjs',
        'DA:1,1',
        'end_of_record',
      ].join('\n');

      const sourceFiles = new Set(['src/auth/validator.mjs']);
      const result = parseLcov(lcov, sourceFiles);
      expect(result.has('src/auth/validator.mjs')).toBe(true);
    });

    it('emits warning for unmatched files', () => {
      const lcov = [
        'SF:src/nonexistent.mjs',
        'DA:1,1',
        'end_of_record',
      ].join('\n');

      const sourceFiles = new Set(['src/foo.mjs']);
      parseLcov(lcov, sourceFiles);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('no source file matches LCOV path')
      );
    });

    it('warns when all SF: paths point to dist/', () => {
      const lcov = [
        'SF:dist/foo.js',
        'DA:1,1',
        'end_of_record',
        'SF:dist/bar.js',
        'DA:1,1',
        'end_of_record',
      ].join('\n');

      parseLcov(lcov, null);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('LCOV paths point to compiled output')
      );
    });

    it('does not warn when only some paths are dist/', () => {
      const lcov = [
        'SF:dist/foo.js',
        'DA:1,1',
        'end_of_record',
        'SF:src/bar.mjs',
        'DA:1,1',
        'end_of_record',
      ].join('\n');

      parseLcov(lcov, null);
      const sourceMapWarning = stderrSpy.mock.calls.find(
        c => c[0] && c[0].includes('compiled output')
      );
      expect(sourceMapWarning).toBeUndefined();
    });
  });

  describe('CRAP4JS_DEBUG_LCOV', () => {
    it('emits diagnostic output when debug flag is set', async () => {
      // Reset module registry and mock env to enable debug
      vi.resetModules();
      vi.doMock('../src/env.mjs', () => ({ CRAP4JS_DEBUG_LCOV: true }));

      const { parseLcov: debugParseLcov } = await import('../src/coverage.mjs');

      const lcov = [
        'SF:src/foo.mjs',
        'DA:1,1',
        'end_of_record',
        'SF:src/bar.mjs',
        'DA:1,0',
        'end_of_record',
      ].join('\n');

      const sourceFiles = new Set(['src/foo.mjs', 'src/bar.mjs']);
      debugParseLcov(lcov, sourceFiles);

      const debugCalls = stderrSpy.mock.calls.filter(
        c => c[0] && c[0].includes('[LCOV] raw:')
      );
      expect(debugCalls.length).toBe(2);
      expect(debugCalls[0][0]).toContain('src/foo.mjs');
      expect(debugCalls[1][0]).toContain('src/bar.mjs');

      vi.doUnmock('../src/env.mjs');
      vi.resetModules();
    });
  });

  describe('loadCoverage — HTML fallback', () => {
    let tempDir;

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), 'crap4js-cov-test-'));
    });

    afterEach(() => {
      rmSync(tempDir, { recursive: true, force: true });
    });

    it('parses HTML spans when lcov.info is absent', () => {
      // Create an HTML file with coverage spans (class before data-line)
      const htmlDir = join(tempDir, 'src');
      mkdirSync(htmlDir, { recursive: true });
      const htmlContent = `<html><body>
<span class="covered" data-line="1">line 1</span>
<span class="not-covered" data-line="2">line 2</span>
<span class="covered" data-line="3">line 3</span>
</body></html>`;
      writeFileSync(join(htmlDir, 'foo.mjs.html'), htmlContent);

      const result = loadCoverage(tempDir);
      // Should have parsed at least one file
      expect(result.size).toBeGreaterThanOrEqual(1);

      // Find the entry (path derived from HTML file relative to coverageDir)
      const entries = [...result.entries()];
      const entry = entries.find(([key]) => key.includes('foo.mjs'));
      expect(entry).toBeDefined();

      const [, lineMap] = entry;
      expect(lineMap.get(1)).toBe(true);
      expect(lineMap.get(2)).toBe(false);
      expect(lineMap.get(3)).toBe(true);
    });

    it('parses HTML spans with data-line before class', () => {
      const htmlContent = `<html><body>
<span data-line="5" class="covered">line 5</span>
<span data-line="6" class="not-covered">line 6</span>
</body></html>`;
      writeFileSync(join(tempDir, 'bar.mjs.html'), htmlContent);

      const result = loadCoverage(tempDir);
      expect(result.size).toBeGreaterThanOrEqual(1);

      const entries = [...result.entries()];
      const entry = entries.find(([key]) => key.includes('bar.mjs'));
      expect(entry).toBeDefined();

      const [, lineMap] = entry;
      expect(lineMap.get(5)).toBe(true);
      expect(lineMap.get(6)).toBe(false);
    });

    it('prefers lcov.info over HTML files when both exist', () => {
      // Create lcov.info
      const lcovContent = [
        'SF:src/foo.mjs',
        'DA:1,1',
        'DA:2,0',
        'end_of_record',
      ].join('\n');
      writeFileSync(join(tempDir, 'lcov.info'), lcovContent);

      // Create HTML file with different data
      const htmlContent = `<html><body>
<span class="not-covered" data-line="1">line 1</span>
<span class="covered" data-line="2">line 2</span>
</body></html>`;
      writeFileSync(join(tempDir, 'foo.mjs.html'), htmlContent);

      const result = loadCoverage(tempDir);
      // Should use LCOV data, not HTML
      const fooMap = result.get('src/foo.mjs');
      expect(fooMap).toBeDefined();
      expect(fooMap.get(1)).toBe(true);   // LCOV says covered
      expect(fooMap.get(2)).toBe(false);  // LCOV says not covered
    });

    it('returns empty Map for empty coverage directory', () => {
      const result = loadCoverage(tempDir);
      expect(result.size).toBe(0);
    });

    it('returns empty Map for non-existent directory', () => {
      const result = loadCoverage(join(tempDir, 'nonexistent'));
      expect(result.size).toBe(0);
    });
  });
});
