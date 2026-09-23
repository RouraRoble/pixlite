import { describe, expect, it } from 'vitest';
import { formatBytes, summarizeSavings } from '../../src/lib/format-bytes';

describe('formatBytes', () => {
  it('formats bytes, KB, MB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(12_400_000)).toBe('11.8 MB');
  });
});

describe('summarizeSavings', () => {
  it('reports percentage saved when the file shrinks', () => {
    const s = summarizeSavings(12_400_000, 1_900_000);
    expect(s.grew).toBe(false);
    expect(s.percent).toBeGreaterThanOrEqual(84);
    expect(s.label).toContain('Saved');
  });
  it('reports growth honestly when the output is larger', () => {
    const s = summarizeSavings(100_000, 150_000);
    expect(s.grew).toBe(true);
    expect(s.label).toContain('Grew');
  });
});
