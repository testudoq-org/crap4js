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

  it('defaults to text format when no format is specified', () => {
    const report = formatReport(entries);
    expect(report).toMatch(/^CRAP Report/);
    expect(report).toMatch(/===========\n/);
  });

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
    const report = formatReport(entries, 'text');
    expect(report).toMatch(/^CRAP Report/);
    expect(report).toMatch(/===========\n/);
  });

  it('includes the Risk column in text format', () => {
    const report = formatReport(entries, 'text');
    expect(report).toMatch(/Risk/);    // header
    const lines = report.split('\n');
    const dataLines = lines.slice(4).filter(l => l.trim() && !l.match(/^\d+ functions/));
    expect(dataLines[0]).toMatch(/high/);       // complexFn CRAP=35.958
    expect(dataLines[1]).toMatch(/moderate/);   // <anonymous:47> CRAP=20
    expect(dataLines[2]).toMatch(/low/);        // simpleFn CRAP=1
    expect(dataLines[3]).toMatch(/N\/A/);       // unknownFn null CRAP
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

  // ── Markdown format ───────────────────────────────────────────

  it('produces a markdown pipe table', () => {
    const report = formatReport(entries, 'markdown');
    expect(report).toMatch(/^## CRAP Report/);
    expect(report).toMatch(/\| Function \| File \| CC \| Cov% \| CRAP \| Risk \|/);
    expect(report).toMatch(/\|:---|:---|---:|---:|---:|:---\|/);
  });

  it('includes Risk values in markdown rows', () => {
    const report = formatReport(entries, 'markdown');
    const lines = report.split('\n');
    const dataLines = lines.filter(l => l.startsWith('|') && !l.includes('Function') && !l.includes(':---'));
    expect(dataLines[0]).toMatch(/\| high \|/);
    expect(dataLines[1]).toMatch(/\| moderate \|/);
    expect(dataLines[2]).toMatch(/\| low \|/);
    expect(dataLines[3]).toMatch(/\| N\/A \|/);
  });

  it('includes risk summary in markdown', () => {
    const report = formatReport(entries, 'markdown');
    expect(report).toMatch(/1 functions at high risk, 1 at moderate\./);
  });

  // ── HTML format ───────────────────────────────────────────────

  it('produces a valid HTML5 document with a table', () => {
    const report = formatReport(entries, 'html');
    expect(report).toMatch(/^<!DOCTYPE html>/);
    expect(report).toMatch(/<html lang="en">/);
    expect(report).toMatch(/<head>/);
    expect(report).toMatch(/<title>CRAP Report<\/title>/);
    expect(report).toMatch(/<\/head>/);
    expect(report).toMatch(/<body>/);
    expect(report).toMatch(/<table>/);
    expect(report).toMatch(/<thead>/);
    expect(report).toMatch(/<th>Risk<\/th>/);
    expect(report).toMatch(/<\/table>/);
    expect(report).toMatch(/<\/body>/);
    expect(report).toMatch(/<\/html>$/);
  });

  it('places style block inside head', () => {
    const report = formatReport(entries, 'html');
    const headStart = report.indexOf('<head>');
    const headEnd = report.indexOf('</head>');
    const styleStart = report.indexOf('<style>');
    const styleEnd = report.indexOf('</style>');
    expect(styleStart).toBeGreaterThan(headStart);
    expect(styleEnd).toBeLessThan(headEnd);
  });

  it('applies risk CSS classes in HTML', () => {
    const report = formatReport(entries, 'html');
    expect(report).toMatch(/class="risk-high"/);
    expect(report).toMatch(/class="risk-moderate"/);
    expect(report).toMatch(/class="risk-low"/);
    expect(report).toMatch(/class="risk-na"/);
  });

  it('includes CSS styles in HTML', () => {
    const report = formatReport(entries, 'html');
    expect(report).toMatch(/\.risk-high\s*\{/);
    expect(report).toMatch(/\.risk-moderate\s*\{/);
    expect(report).toMatch(/\.risk-low\s*\{/);
  });

  it('escapes HTML entities', () => {
    const htmlEntries = [
      { name: '<script>alert(1)</script>', file: 'src/test.mjs', cc: 1, coverage: 1.0, crap: 1 },
    ];
    const report = formatReport(htmlEntries, 'html');
    expect(report).not.toMatch(/<script>/);
    expect(report).toMatch(/&lt;script&gt;/);
  });

  it('escapes single quotes in HTML output', () => {
    const htmlEntries = [
      { name: "it's", file: "o'reilly.mjs", cc: 1, coverage: 1.0, crap: 1 },
    ];
    const report = formatReport(htmlEntries, 'html');
    expect(report).not.toMatch(/it's/);
    expect(report).toMatch(/it&#39;s/);
    expect(report).toMatch(/o&#39;reilly\.mjs/);
  });

  it('includes risk summary in HTML', () => {
    const report = formatReport(entries, 'html');
    expect(report).toMatch(/<p>1 functions at high risk, 1 at moderate\.<\/p>/);
  });
});
