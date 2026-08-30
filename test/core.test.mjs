import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { crapScore, riskLevel } from '../src/crap.mjs';

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

describe('innermost-wins nested-function semantics', () => {
  async function setupNested(source, filePath, names = ['outer', 'inner']) {
    const { extractFunctions } = await import('../src/complexity.mjs');
    const { assignCoverageOwnership } = await import('../src/core.mjs');
    const functions = extractFunctions(source, filePath);
    const fns = names.map(n => functions.find(f => f.name === n));
    return { functions, fns, assignCoverageOwnership };
  }

  it('parent instrumented count excludes nested child lines', async () => {
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
    const { assignCoverageOwnership } = await import('../src/core.mjs');
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

    // Sort functions by startLine and assign ownership
    const sorted = [outer, inner].sort((a, b) => a.startLine - b.startLine);
    const ownership = assignCoverageOwnership(fileLines, sorted, sortedKeys);

    // Parent (outer) should NOT include child lines (innermost-wins)
    const outerOwned = ownership.get(sorted.indexOf(outer)) || new Set();
    const innerOwned = ownership.get(sorted.indexOf(inner)) || new Set();

    // Parent instrumented count must be less than total lines in its full range
    expect(outerOwned.size).toBeLessThan(outer.endLine - outer.startLine + 1);
    // Parent and child instrumented counts must be disjoint
    const intersection = [...outerOwned].filter(l => innerOwned.has(l));
    expect(intersection.length).toBe(0);
  });

  it('parent left with no instrumented lines after attribution', async () => {
    const source = `
      function outer() {
        function inner() {
          if (a) {}
        }
      }
    `;

    const { extractFunctions } = await import('../src/complexity.mjs');
    const { assignCoverageOwnership } = await import('../src/core.mjs');
    const filePath = 'test/fixture/nested-empty.mjs';
    const functions = extractFunctions(source, filePath);

    const outer = functions.find(f => f.name === 'outer');
    const inner = functions.find(f => f.name === 'inner');
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();

    // Only the line inside inner is instrumented
    const fileLines = new Map([[3, true]]);

    const sortedKeys = [...fileLines.keys()].sort((a, b) => a - b);
    const sorted = [outer, inner].sort((a, b) => a.startLine - b.startLine);
    const ownership = assignCoverageOwnership(fileLines, sorted, sortedKeys);

    const outerOwned = ownership.get(sorted.indexOf(outer)) || new Set();
    expect(outerOwned.size).toBe(0);
  });

  it('three-level nesting: innermost wins at each level', async () => {
    const source = `
      function a() {
        function b() {
          function c() {
            if (x) {}
          }
        }
      }
    `;

    const { extractFunctions } = await import('../src/complexity.mjs');
    const { assignCoverageOwnership } = await import('../src/core.mjs');
    const filePath = 'test/fixture/nested-three.mjs';
    const functions = extractFunctions(source, filePath);

    const fnA = functions.find(f => f.name === 'a');
    const fnB = functions.find(f => f.name === 'b');
    const fnC = functions.find(f => f.name === 'c');
    expect(fnA).toBeDefined();
    expect(fnB).toBeDefined();
    expect(fnC).toBeDefined();

    // Only the line inside c is instrumented
    const fileLines = new Map([[4, true]]);

    const sortedKeys = [...fileLines.keys()].sort((a, b) => a - b);
    const sorted = [fnA, fnB, fnC].sort((a, b) => a.startLine - b.startLine);
    const ownership = assignCoverageOwnership(fileLines, sorted, sortedKeys);

    const ownedA = ownership.get(sorted.indexOf(fnA)) || new Set();
    const ownedB = ownership.get(sorted.indexOf(fnB)) || new Set();
    const ownedC = ownership.get(sorted.indexOf(fnC)) || new Set();

    expect(ownedC.size).toBeGreaterThan(0); // innermost gets the if line
    expect(ownedB.size).toBe(0); // middle gets nothing
    expect(ownedA.size).toBe(0); // outer gets nothing
  });

  it('sibling nested functions each own their own lines', async () => {
    const source = `
      function outer() {
        function innerA() {
          if (a) {}
        }
        function innerB() {
          if (b) {}
        }
      }
    `;

    const { extractFunctions } = await import('../src/complexity.mjs');
    const { assignCoverageOwnership } = await import('../src/core.mjs');
    const filePath = 'test/fixture/nested-siblings.mjs';
    const functions = extractFunctions(source, filePath);

    const outer = functions.find(f => f.name === 'outer');
    const innerA = functions.find(f => f.name === 'innerA');
    const innerB = functions.find(f => f.name === 'innerB');
    expect(outer).toBeDefined();
    expect(innerA).toBeDefined();
    expect(innerB).toBeDefined();

    // Only lines inside innerA and innerB are instrumented
    const fileLines = new Map([[3, true], [6, true]]);

    const sortedKeys = [...fileLines.keys()].sort((a, b) => a - b);
    const sorted = [outer, innerA, innerB].sort((a, b) => a.startLine - b.startLine);
    const ownership = assignCoverageOwnership(fileLines, sorted, sortedKeys);

    const ownedOuter = ownership.get(sorted.indexOf(outer)) || new Set();
    const ownedA = ownership.get(sorted.indexOf(innerA)) || new Set();
    const ownedB = ownership.get(sorted.indexOf(innerB)) || new Set();

    expect(ownedOuter.size).toBe(0);
    expect(ownedA.size).toBeGreaterThan(0);
    expect(ownedB.size).toBeGreaterThan(0);
    const overlap = [...ownedA].filter(l => ownedB.has(l));
    expect(overlap.length).toBe(0);
  });

  it('nested arrow function: if line owned by arrow, not parent', async () => {
    const source = `
      function outer() {
        const inner = () => {
          if (a) {}
        };
      }
    `;

    const filePath = 'test/fixture/nested-arrow.mjs';
    const { fns: [outer, inner], assignCoverageOwnership } = await setupNested(source, filePath);
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();

    const fileLines = new Map([[3, true]]);

    const sortedKeys = [...fileLines.keys()].sort((a, b) => a - b);
    const sorted = [outer, inner].sort((a, b) => a.startLine - b.startLine);
    const ownership = assignCoverageOwnership(fileLines, sorted, sortedKeys);

    const outerOwned = ownership.get(sorted.indexOf(outer)) || new Set();
    const innerOwned = ownership.get(sorted.indexOf(inner)) || new Set();

    expect(innerOwned.size).toBeGreaterThan(0);
    expect(outerOwned.has(3)).toBe(false);
  });

  it('nested function inside class method: inner owns lines, method does not', async () => {
    const source = `
      class Foo {
        method() {
          function inner() {
            if (a) {}
          }
        }
      }
    `;

    const filePath = 'test/fixture/nested-class.mjs';
    const { fns: [method, inner], assignCoverageOwnership } = await setupNested(source, filePath, ['Foo.method', 'inner']);
    expect(method).toBeDefined();
    expect(inner).toBeDefined();

    const fileLines = new Map([[4, true]]);

    const sortedKeys = [...fileLines.keys()].sort((a, b) => a - b);
    const sorted = [method, inner].sort((a, b) => a.startLine - b.startLine);
    const ownership = assignCoverageOwnership(fileLines, sorted, sortedKeys);

    const methodOwned = ownership.get(sorted.indexOf(method)) || new Set();
    const innerOwned = ownership.get(sorted.indexOf(inner)) || new Set();

    expect(innerOwned.size).toBeGreaterThan(0);
    expect(methodOwned.size).toBe(0);
  });

  it('sparse LCOV + nesting: outer has null percentage, inner has 0.5', async () => {
    const source = `
      function outer() {
        function inner() {
          if (a) {}
          if (b) {}
        }
      }
    `;

    const filePath = 'test/fixture/nested-sparse.mjs';
    const { fns: [outer, inner], assignCoverageOwnership } = await setupNested(source, filePath);
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();

    // first if covered=true, second if covered=false
    const fileLines = new Map([[3, true], [4, false]]);

    const sortedKeys = [...fileLines.keys()].sort((a, b) => a - b);
    const sorted = [outer, inner].sort((a, b) => a.startLine - b.startLine);
    const ownership = assignCoverageOwnership(fileLines, sorted, sortedKeys);

    const outerOwned = ownership.get(sorted.indexOf(outer)) || new Set();
    const innerOwned = ownership.get(sorted.indexOf(inner)) || new Set();

    expect(outerOwned.size).toBe(0);
    expect(innerOwned.size).toBe(2);
    const innerCovered = [...innerOwned].filter(l => fileLines.get(l)).length;
    expect(innerCovered).toBe(1);
  });

  it('empty coverage + nesting: outer has null percentage, inner has 0.0', async () => {
    const source = `
      function outer() {
        function inner() {
          if (a) {}
        }
      }
    `;

    const filePath = 'test/fixture/nested-empty-cov.mjs';
    const { fns: [outer, inner], assignCoverageOwnership } = await setupNested(source, filePath);
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();

    // all lines hitCount=0
    const fileLines = new Map([[3, false]]);

    const sortedKeys = [...fileLines.keys()].sort((a, b) => a - b);
    const sorted = [outer, inner].sort((a, b) => a.startLine - b.startLine);
    const ownership = assignCoverageOwnership(fileLines, sorted, sortedKeys);

    const outerOwned = ownership.get(sorted.indexOf(outer)) || new Set();
    const innerOwned = ownership.get(sorted.indexOf(inner)) || new Set();

    expect(outerOwned.size).toBe(0);
    expect(innerOwned.size).toBe(1);
    const innerCovered = [...innerOwned].filter(l => fileLines.get(l)).length;
    expect(innerCovered).toBe(0);
  });
});

describe('non-nested score stability', () => {
  it('simple function with full coverage has CRAP 1.0 and risk low', async () => {
    const source = `export function simple(a, b) {
      return a + b;
    }`;

    const { extractFunctions } = await import('../src/complexity.mjs');
    const { assignCoverageOwnership } = await import('../src/core.mjs');
    const { crapScore, riskLevel } = await import('../src/crap.mjs');
    const filePath = 'test/fixture/simple.mjs';
    const functions = extractFunctions(source, filePath);

    const simple = functions.find(f => f.name === 'simple');
    expect(simple).toBeDefined();

    // All lines covered
    const fileLines = new Map();
    for (let i = simple.startLine; i <= simple.endLine; i++) fileLines.set(i, true);

    const sortedKeys = [...fileLines.keys()].sort((a, b) => a - b);
    const sorted = [simple];
    const ownership = assignCoverageOwnership(fileLines, sorted, sortedKeys);

    const owned = ownership.get(0) || new Set();
    expect(owned.size).toBeGreaterThan(0);

    const covered = [...owned].filter(l => fileLines.get(l)).length;
    const fraction = covered / owned.size;
    const crap = crapScore(simple.cc, fraction);
    const risk = riskLevel(crap);

    expect(crap).toBeCloseTo(1.0);
    expect(risk).toBe('low');
  });
});

describe('assignCoverageOwnership edge cases', () => {
  it('returns an empty Map for an empty functions array', async () => {
    const { assignCoverageOwnership } = await import('../src/core.mjs');
    const fileLines = new Map([[1, true], [2, true]]);
    const ownership = assignCoverageOwnership(fileLines, [], [1, 2]);
    expect(ownership).toBeInstanceOf(Map);
    expect(ownership.size).toBe(0);
  });

  it('returns empty-set-per-index when fileLines is null (no throw)', async () => {
    const { extractFunctions } = await import('../src/complexity.mjs');
    const { assignCoverageOwnership } = await import('../src/core.mjs');
    const fns = extractFunctions('function a() { return 1; } function b() { return 2; }', 't.mjs');
    expect(() => {
      const ownership = assignCoverageOwnership(null, fns, [1, 2]);
      expect(ownership).toBeInstanceOf(Map);
      expect(ownership.size).toBe(fns.length);
      for (const set of ownership.values()) {
        expect(set).toBeInstanceOf(Set);
        expect(set.size).toBe(0);
      }
    }).not.toThrow();
  });

  it('returns empty-set-per-index when sortedKeys is undefined (no throw)', async () => {
    const { extractFunctions } = await import('../src/complexity.mjs');
    const { assignCoverageOwnership } = await import('../src/core.mjs');
    const fns = extractFunctions('function a() { return 1; }', 't.mjs');
    const ownership = assignCoverageOwnership(new Map([[1, true]]), fns, undefined);
    expect(ownership.size).toBe(fns.length);
    for (const set of ownership.values()) expect(set.size).toBe(0);
  });

  it('returns empty-set-per-index when sortedKeys is an empty array (no throw)', async () => {
    const { extractFunctions } = await import('../src/complexity.mjs');
    const { assignCoverageOwnership } = await import('../src/core.mjs');
    const fns = extractFunctions('function a() { return 1; }', 't.mjs');
    const ownership = assignCoverageOwnership(new Map(), fns, []);
    expect(ownership.size).toBe(fns.length);
    for (const set of ownership.values()) expect(set.size).toBe(0);
  });

  it('single non-nested function owns all of its instrumented lines', async () => {
    const { extractFunctions } = await import('../src/complexity.mjs');
    const { assignCoverageOwnership } = await import('../src/core.mjs');
    const source = 'export function solo(a) {\n  return a + 1;\n}';
    const fns = extractFunctions(source, 't.mjs');
    const solo = fns[0];
    expect(solo).toBeDefined();

    const fileLines = new Map();
    for (let i = solo.startLine; i <= solo.endLine; i++) fileLines.set(i, true);
    const sortedKeys = [...fileLines.keys()].sort((a, b) => a - b);

    const ownership = assignCoverageOwnership(fileLines, [solo], sortedKeys);
    const owned = ownership.get(0) || new Set();
    // For a single, non-nested function every instrumented line must be owned
    // by it - the owned set is exactly the set of covered lines.
    const expectedLines = [...fileLines.keys()].sort((a, b) => a - b);
    expect([...owned].sort((a, b) => a - b)).toEqual(expectedLines);
    expect(owned.size).toBe(solo.endLine - solo.startLine + 1);
  });

  it('parent keeps its own lines while nested child owns its own range', async () => {
    const { extractFunctions } = await import('../src/complexity.mjs');
    const { assignCoverageOwnership } = await import('../src/core.mjs');
    const source = [
      'function outer() {',
      '  const x = 1;',
      '  function inner() {',
      '    if (a) {}',
      '  }',
      '  const y = 2;',
      '}',
    ].join('\n');

    const fns = extractFunctions(source, 't.mjs');
    const outer = fns.find(f => f.name === 'outer');
    const inner = fns.find(f => f.name === 'inner');
    expect(outer).toBeDefined();
    expect(inner).toBeDefined();

    // Instrument every line in the source as covered.
    const fileLines = new Map();
    for (let i = 1; i <= 7; i++) fileLines.set(i, true);
    const sortedKeys = [...fileLines.keys()].sort((a, b) => a - b);

    const sorted = [outer, inner].sort((a, b) => a.startLine - b.startLine);
    const ownership = assignCoverageOwnership(fileLines, sorted, sortedKeys);

    const outerOwned = ownership.get(sorted.indexOf(outer)) || new Set();
    const innerOwned = ownership.get(sorted.indexOf(inner)) || new Set();

    // Parent has its own lines (outside the inner range): x, y, and braces.
    expect(outerOwned.size).toBeGreaterThan(0);
    // Innermost wins its own body lines.
    expect(innerOwned.size).toBeGreaterThan(0);
    // Ownership sets are disjoint.
    const overlap = [...outerOwned].filter(l => innerOwned.has(l));
    expect(overlap.length).toBe(0);
    // Parent lines never fall inside the inner function's range.
    for (const line of outerOwned) {
      expect(line < inner.startLine || line > inner.endLine).toBe(true);
    }
  });
});

describe('analyzeFile full-model verification', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'crap4js-analyze-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function expectedEntry(fn, lineMap) {
    let instrumented = 0;
    let covered = 0;
    for (let line = fn.startLine; line <= fn.endLine; line++) {
      if (lineMap.has(line)) {
        instrumented++;
        if (lineMap.get(line)) covered++;
      }
    }
    const percentage = instrumented === 0 ? null : covered / instrumented;
    // Use the real CRAP/risk oracle so this test verifies analyzeFile's glue
    // (coverage derivation -> crapScore/riskLevel wiring) rather than
    // re-implementing the formula. Formula correctness is covered separately by
    // the riskLevel/crapScore boundary tests in test/crap.test.mjs.
    const crap = crapScore(fn.cc, percentage);
    const risk = riskLevel(crap);
    return {
      id: `${fn.file}:${fn.startLine}:${fn.name}`,
      name: fn.name,
      file: fn.file,
      startLine: fn.startLine,
      endLine: fn.endLine,
      cc: fn.cc,
      coverage: { covered, instrumented, percentage },
      crap,
      risk,
    };
  }

  it('produces the exact glued model for a single fully-covered function', async () => {
    const { analyzeFile } = await import('../src/core.mjs');
    const { extractFunctions } = await import('../src/complexity.mjs');

    const source = 'export function add(a, b) {\n  return a + b;\n}';
    const filePath = join(tempDir, 'add.mjs');
    writeFileSync(filePath, source, 'utf8');

    const functions = extractFunctions(source, filePath);
    const fn = functions[0];
    expect(fn.name).toBe('add');

    const lineMap = new Map();
    for (let i = fn.startLine; i <= fn.endLine; i++) lineMap.set(i, true);
    const coverageData = new Map([[filePath, lineMap]]);

    const entries = analyzeFile(filePath, coverageData);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(expectedEntry(fn, lineMap));
    // Known exact values for this trivial case.
    expect(entries[0].coverage).toEqual({ covered: 3, instrumented: 3, percentage: 1 });
    expect(entries[0].crap).toBe(1);
    expect(entries[0].risk).toBe('low');
  });

  it('produces exact models for two functions with mixed coverage, in source order', async () => {
    const { analyzeFile } = await import('../src/core.mjs');
    const { extractFunctions } = await import('../src/complexity.mjs');

    const source = [
      'export function add(a, b) {',
      '  return a + b;',
      '}',
      'export function risky(x) {',
      '  if (x) return 1;',
      '  return 0;',
      '}',
    ].join('\n');
    const filePath = join(tempDir, 'mixed.mjs');
    writeFileSync(filePath, source, 'utf8');

    const functions = extractFunctions(source, filePath);
    expect(functions.map(f => f.name)).toEqual(['add', 'risky']);

    // add: fully covered. risky: lines 4-7, one line uncovered (line 7 false).
    const lineMap = new Map([
      [1, true], [2, true], [3, true],
      [4, true], [5, true], [6, true], [7, false],
    ]);
    const coverageData = new Map([[filePath, lineMap]]);

    const entries = analyzeFile(filePath, coverageData);
    expect(entries).toHaveLength(functions.length);
    // Entries follow original function order (not sorted by CRAP).
    expect(entries.map(e => e.name)).toEqual(['add', 'risky']);

    for (const fn of functions) {
      const entry = entries.find(e => e.name === fn.name);
      expect(entry).toEqual(expectedEntry(fn, lineMap));
    }

    const riskyEntry = entries.find(e => e.name === 'risky');
    expect(riskyEntry.coverage).toEqual({ covered: 3, instrumented: 4, percentage: 0.75 });
    expect(riskyEntry.cc).toBe(2);
    expect(riskyEntry.crap).toBeCloseTo(2.0625, 4);
    expect(riskyEntry.risk).toBe('low');
  });

  it('treats a function with no coverage lines as null coverage/CRAP/risk', async () => {
    const { analyzeFile } = await import('../src/core.mjs');
    const { extractFunctions } = await import('../src/complexity.mjs');

    const source = 'export function orphan() {\n  return 42;\n}';
    const filePath = join(tempDir, 'orphan.mjs');
    writeFileSync(filePath, source, 'utf8');

    const functions = extractFunctions(source, filePath);
    // No coverage data at all for this file.
    const coverageData = new Map();

    const entries = analyzeFile(filePath, coverageData);
    expect(entries).toHaveLength(1);
    const fn = functions[0];
    expect(entries[0]).toEqual(expectedEntry(fn, new Map()));
    expect(entries[0].coverage).toEqual({ covered: 0, instrumented: 0, percentage: null });
    expect(entries[0].crap).toBeNull();
    expect(entries[0].risk).toBeNull();
  });
});
