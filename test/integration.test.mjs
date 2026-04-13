import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { run } from '../src/core.mjs';

describe('integration', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'crap4js-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('analyses files end-to-end with correct CRAP scores', () => {
    // Create source directory
    const srcDir = join(tempDir, 'src');
    mkdirSync(srcDir, { recursive: true });

    // high-crap.mjs: CC >= 5 (3 ifs + 2 logical operators = 6 total, base 1 = 6)
    const highCrapSource = `export function riskyValidator(input) {
  if (!input) return false;
  if (input.length < 3) return false;
  if (input.length > 100) return false;
  return input.startsWith('a') && input.endsWith('z') || input === 'special';
}
`;
    writeFileSync(join(srcDir, 'high-crap.mjs'), highCrapSource);

    // low-crap.mjs: CC = 1 (no branches)
    const lowCrapSource = `export function add(a, b) {
  return a + b;
}
`;
    writeFileSync(join(srcDir, 'low-crap.mjs'), lowCrapSource);

    // Create coverage data (only for low-crap.mjs)
    const covDir = join(tempDir, 'coverage');
    mkdirSync(covDir, { recursive: true });

    const lcovContent = [
      `SF:${join(srcDir, 'low-crap.mjs').replace(/\\/g, '/')}`,
      'DA:1,1',
      'DA:2,1',
      'DA:3,1',
      'end_of_record',
    ].join('\n');
    writeFileSync(join(covDir, 'lcov.info'), lcovContent);

    const result = run({
      filters: [],
      coverageDir: covDir,
      sourceGlob: [join(srcDir, '**/*.mjs').replace(/\\/g, '/')],
      delete: false,
      runCoverage: false,
    });

    // high-crap should appear first (highest CRAP score or null last)
    const lines = result.output.split('\n');

    // riskyValidator has no coverage → null → sorted last
    // add has 100% coverage, CC=1, CRAP=1

    // Verify the output contains the function names
    expect(result.output).toContain('riskyValidator');
    expect(result.output).toContain('add');

    // add should have CRAP = 1.0 (CC=1, coverage=1.0)
    const addLine = lines.find(l => l.includes('add'));
    expect(addLine).toMatch(/1\.0/);

    // riskyValidator should show N/A coverage (no LCOV data for it)
    const riskyLine = lines.find(l => l.includes('riskyValidator'));
    expect(riskyLine).toMatch(/N\/A/);

    // Exit code should be 0 (no high-risk scored functions — null coverage doesn't count)
    expect(result.exitCode).toBe(0);
  });

  it('returns exit code 1 when a function scores > 30', () => {
    const srcDir = join(tempDir, 'src');
    mkdirSync(srcDir, { recursive: true });

    // High CC function with 0% coverage
    const highCrapSource = `export function complex(x, y, z) {
  if (x) {
    if (y) {
      if (z) {
        return x && y || z;
      }
    }
  }
  return null;
}
`;
    writeFileSync(join(srcDir, 'high-crap.mjs'), highCrapSource);

    const covDir = join(tempDir, 'coverage');
    mkdirSync(covDir, { recursive: true });

    // Coverage at 0% for all lines
    const lcovContent = [
      `SF:${join(srcDir, 'high-crap.mjs').replace(/\\/g, '/')}`,
      'DA:1,0',
      'DA:2,0',
      'DA:3,0',
      'DA:4,0',
      'DA:5,0',
      'DA:6,0',
      'DA:7,0',
      'DA:8,0',
      'DA:9,0',
      'DA:10,0',
      'DA:11,0',
      'end_of_record',
    ].join('\n');
    writeFileSync(join(covDir, 'lcov.info'), lcovContent);

    const result = run({
      filters: [],
      coverageDir: covDir,
      sourceGlob: [join(srcDir, '**/*.mjs').replace(/\\/g, '/')],
      delete: false,
      runCoverage: false,
    });

    // CC = 6 (1 base + 3 ifs + && + ||), coverage = 0%
    // CRAP = 6² + 6 = 42 → high risk
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('high risk');
  });
});
