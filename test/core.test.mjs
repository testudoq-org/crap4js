import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { coverageCounts, coverageFraction } from '../src/core.mjs';

describe('P0 profiler', () => {
  let stderrSpy;

  beforeEach(() => {
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('emits [PROFILE] lines to stderr when CRAP4JS_PROFILE=1', async () => {
    vi.resetModules();
    vi.doMock('../src/env.mjs', () => ({ CRAP4JS_DEBUG_LCOV: false, CRAP4JS_PROFILE: true }));
    const { run: profiledRun } = await import('../src/core.mjs');

    await profiledRun({
      coverageDir: 'coverage',
      delete: false,
      runCoverage: false,
      format: 'text',
    });

    const profileCalls = stderrSpy.mock.calls.filter(
      c => c[0] && c[0].startsWith('[PROFILE]')
    );
    expect(profileCalls.length).toBeGreaterThanOrEqual(5);
    expect(profileCalls[0][0]).toMatch(/coverage command/);
    expect(profileCalls.some(c => c[0].includes('source discovery'))).toBe(true);
    expect(profileCalls.some(c => c[0].includes('coverage load'))).toBe(true);
    expect(profileCalls.some(c => c[0].includes('AST parse + complexity'))).toBe(true);
    expect(profileCalls.some(c => c[0].includes('CRAP calculation + sorting + formatting'))).toBe(true);

    vi.doUnmock('../src/env.mjs');
    vi.resetModules();
  });

  it('emits no [PROFILE] lines when CRAP4JS_PROFILE is unset', async () => {
    vi.resetModules();
    vi.doMock('../src/env.mjs', () => ({ CRAP4JS_DEBUG_LCOV: false, CRAP4JS_PROFILE: false }));
    const { run: unprofiledRun } = await import('../src/core.mjs');

    await unprofiledRun({
      coverageDir: 'coverage',
      delete: false,
      runCoverage: false,
      format: 'text',
    });

    const profileCalls = stderrSpy.mock.calls.filter(
      c => c[0] && c[0].startsWith('[PROFILE]')
    );
    expect(profileCalls.length).toBe(0);

    vi.doUnmock('../src/env.mjs');
    vi.resetModules();
  });
});

describe('P2 indexed coverage', () => {
  const makeMap = (entries) => {
    const map = new Map();
    for (const [line, covered] of entries) map.set(line, covered);
    return map;
  };

  it('returns zero counts for a range with no instrumented lines', () => {
    const fileLines = makeMap([[10, true], [20, false]]);
    const sortedKeys = [10, 20];
    const result = coverageCounts(fileLines, 1, 5, sortedKeys);
    expect(result).toEqual({ instrumented: 0, covered: 0 });
  });

  it('returns correct counts for partial overlap', () => {
    const fileLines = makeMap([[10, true], [20, false], [30, true]]);
    const sortedKeys = [10, 20, 30];
    const result = coverageCounts(fileLines, 15, 25, sortedKeys);
    expect(result).toEqual({ instrumented: 1, covered: 0 });
  });

  it('returns correct counts for full overlap', () => {
    const fileLines = makeMap([[10, true], [20, false], [30, true]]);
    const sortedKeys = [10, 20, 30];
    const result = coverageCounts(fileLines, 5, 35, sortedKeys);
    expect(result).toEqual({ instrumented: 3, covered: 2 });
  });

  it('returns zero counts when no overlap exists', () => {
    const fileLines = makeMap([[10, true], [20, false]]);
    const sortedKeys = [10, 20];
    const result = coverageCounts(fileLines, 30, 40, sortedKeys);
    expect(result).toEqual({ instrumented: 0, covered: 0 });
  });

  it('returns null fraction when instrumented is zero', () => {
    expect(coverageFraction(null, 1, 10, null)).toBeNull();
    expect(coverageFraction(makeMap([]), 1, 10, [])).toBeNull();
  });

  it('returns correct fraction for partial overlap', () => {
    const fileLines = makeMap([[10, true], [20, false]]);
    expect(coverageFraction(fileLines, 5, 25, [10, 20])).toBeCloseTo(0.5);
  });
});

describe('Option A nested-function semantics', () => {
  it('parent instrumented count includes nested child lines', async () => {
    const source = `
      function outer() {
        if (a) {}
        function inner() {
          if (b) {}
          if (c) {}
        }
      }
    `;

    const { extractFunctions } = await import('../src/complexity.mjs');
    const filePath = 'test/fixture/nested.mjs';
    const functions = extractFunctions(source, filePath);

    const outer = functions.find(f => f.name === 'outer');
    const inner = functions.find(f => f.name === 'inner');
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();

    // Build a coverage map covering all lines in the source
    const fileLines = new Map();
    for (let i = 1; i <= 10; i++) fileLines.set(i, true);

    const sortedKeys = [...fileLines.keys()].sort((a, b) => a - b);

    // Parent range should include child lines (Option A)
    const parentCounts = coverageCounts(fileLines, outer.startLine, outer.endLine, sortedKeys);
    const childCounts = coverageCounts(fileLines, inner.startLine, inner.endLine, sortedKeys);

    // Parent instrumented count must be >= child instrumented count
    expect(parentCounts.instrumented).toBeGreaterThanOrEqual(childCounts.instrumented);
    // Parent count equals total lines in its full range (Option A: no exclusion)
    expect(parentCounts.instrumented).toBe(outer.endLine - outer.startLine + 1);
  });
});
