import { describe, it, expect } from 'vitest';
import { extractCrapReportBlock } from '../src/extract.mjs';

describe('extractCrapReportBlock', () => {
  it('returns the report block when followed by a coverage summary', () => {
    const text = [
      'CRAP Report',
      '===========',
      'Function File ...',
      '% Coverage report from vitest ...',
    ].join('\n');

    expect(extractCrapReportBlock(text)).toBe([
      'CRAP Report',
      '===========',
      'Function File ...',
    ].join('\n'));
  });

  it('returns null when no start marker is present', () => {
    expect(extractCrapReportBlock('no marker here')).toBeNull();
  });

  it('returns from start to EOF when no end marker is present', () => {
    const text = [
      'CRAP Report',
      '===========',
      'Function File ...',
      'some other content',
    ].join('\n');

    expect(extractCrapReportBlock(text)).toBe(text);
  });

  it('returns only the first block when multiple start markers exist', () => {
    const text = [
      'CRAP Report',
      '===========',
      'first block',
      '% Coverage report from ...',
      'CRAP Report',
      '===========',
      'second block',
    ].join('\n');

    expect(extractCrapReportBlock(text)).toBe([
      'CRAP Report',
      '===========',
      'first block',
    ].join('\n'));
  });

  it('returns null for empty input', () => {
    expect(extractCrapReportBlock('')).toBeNull();
  });

  it('handles end marker appearing before start marker', () => {
    const text = [
      '% Coverage report from ...',
      'CRAP Report',
      '===========',
      'data',
    ].join('\n');

    expect(extractCrapReportBlock(text)).toBe([
      'CRAP Report',
      '===========',
      'data',
    ].join('\n'));
  });
});
