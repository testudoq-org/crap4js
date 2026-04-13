import { describe, it, expect } from 'vitest';
import { crapScore, riskLevel, formatReport } from '../src/crap.mjs';

describe('crapScore', () => {
  it('returns 1 for CC=1, coverage=1.0', () => {
    expect(crapScore(1, 1.0)).toBe(1);
  });

  it('returns CC for any function with coverage=1.0', () => {
    expect(crapScore(5, 1.0)).toBe(5);
    expect(crapScore(10, 1.0)).toBe(10);
    expect(crapScore(20, 1.0)).toBe(20);
  });

  it('returns CC² + CC for coverage=0.0', () => {
    expect(crapScore(1, 0.0)).toBe(2);     // 1+1
    expect(crapScore(5, 0.0)).toBe(30);    // 25+5
    expect(crapScore(10, 0.0)).toBe(110);  // 100+10
  });

  it('returns null when coverageFraction is null', () => {
    expect(crapScore(5, null)).toBeNull();
  });

  it('returns null when coverageFraction is undefined', () => {
    expect(crapScore(5, undefined)).toBeNull();
  });

  it('computes correct intermediate values', () => {
    // CC=10, coverage=0.9 → 100*(0.1)³+10 = 100*0.001+10 = 10.1
    expect(crapScore(10, 0.9)).toBeCloseTo(10.1, 5);
    // CC=12, coverage=0.45 → 144*(0.55)³+12 = 144*0.166375+12 ≈ 35.958
    expect(crapScore(12, 0.45)).toBeCloseTo(35.958, 1);
  });
});

describe('riskLevel', () => {
  it('returns low for scores < 5', () => {
    expect(riskLevel(1)).toBe('low');
    expect(riskLevel(4.9)).toBe('low');
  });

  it('returns moderate for scores 5–29.x', () => {
    expect(riskLevel(5)).toBe('moderate');
    expect(riskLevel(29.9)).toBe('moderate');
  });

  it('returns high for scores ≥ 30', () => {
    expect(riskLevel(30)).toBe('high');
    expect(riskLevel(110)).toBe('high');
  });

  it('returns null if score is null', () => {
    expect(riskLevel(null)).toBeNull();
  });
});

describe('formatReport', () => {
  const entries = [
    { name: 'simpleFn', file: 'src/auth/validator.mjs', cc: 1, coverage: 1.0, crap: 1 },
    { name: 'complexFn', file: 'src/auth/validator.mjs', cc: 12, coverage: 0.45, crap: 35.958 },
    { name: '<anonymous:47>', file: 'src/auth/validator.mjs', cc: 4, coverage: 0.0, crap: 20 },
    { name: 'unknownFn', file: 'src/util/helpers.mjs', cc: 3, coverage: null, crap: null },
  ];

  it('sorts descending by CRAP, null-coverage last', () => {
    const report = formatReport(entries);
    const lines = report.split('\n');
    // Data lines start after header (line 0: title, 1: ===, 2: header, 3: dashes)
    const dataLines = lines.slice(4).filter(l => l.trim() && !l.match(/^\d+ functions/));
    expect(dataLines[0]).toMatch(/complexFn/);
    expect(dataLines[1]).toMatch(/<anonymous:47>/);
    expect(dataLines[2]).toMatch(/simpleFn/);
    expect(dataLines[3]).toMatch(/unknownFn/);
  });

  it('shows N/A for null-coverage entries', () => {
    const report = formatReport(entries);
    const unknownLine = report.split('\n').find(l => l.includes('unknownFn'));
    expect(unknownLine).toMatch(/N\/A/);
  });

  it('includes the report header', () => {
    const report = formatReport(entries);
    expect(report).toMatch(/^CRAP Report/);
    expect(report).toMatch(/===========\n/);
  });

  it('includes a risk summary line', () => {
    const report = formatReport(entries);
    expect(report).toMatch(/1 functions at high risk, 1 at moderate\./);
  });

  it('truncates long names with …', () => {
    const longEntry = [
      { name: 'aVeryLongFunctionNameThatExceedsThirtyCharacters', file: 'src/some/really/deeply/nested/path/that/is/very/long.mjs', cc: 1, coverage: 1.0, crap: 1 },
    ];
    const report = formatReport(longEntry);
    const dataLine = report.split('\n')[4];
    // Function name truncated at 30 chars (29 + …)
    expect(dataLine.slice(0, 30)).toMatch(/…$/);
  });
});
