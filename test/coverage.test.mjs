import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseLcov, normalisePath, suffixMatch } from '../src/coverage.mjs';

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
});
