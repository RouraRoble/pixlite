import { describe, expect, it } from 'vitest';
import { sniffFormat, resolveOutputFormat } from '../../src/lib/mime';

function bytes(...vals: number[]): Uint8Array {
  return new Uint8Array(vals);
}

describe('sniffFormat', () => {
  it('detects PNG', () => {
    expect(sniffFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0))).toBe('png');
  });
  it('detects JPEG', () => {
    expect(sniffFormat(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe('jpeg');
  });
  it('detects GIF', () => {
    expect(sniffFormat(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0))).toBe('gif');
  });
  it('detects BMP', () => {
    expect(sniffFormat(bytes(0x42, 0x4d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe('bmp');
  });
  it('detects WebP (RIFF....WEBP)', () => {
    const b = new TextEncoder().encode('RIFF....WEBP');
    expect(sniffFormat(b)).toBe('webp');
  });
  it('detects AVIF via ftyp brand', () => {
    const b = new Uint8Array(12);
    b.set(new TextEncoder().encode('ftyp'), 4);
    b.set(new TextEncoder().encode('avif'), 8);
    expect(sniffFormat(b)).toBe('avif');
  });
  it('detects HEIC via ftyp brand', () => {
    const b = new Uint8Array(12);
    b.set(new TextEncoder().encode('ftyp'), 4);
    b.set(new TextEncoder().encode('heic'), 8);
    expect(sniffFormat(b)).toBe('heic');
  });
  it('returns null for unknown/short input', () => {
    expect(sniffFormat(bytes(1, 2, 3))).toBeNull();
    expect(sniffFormat(new Uint8Array(0))).toBeNull();
  });
});

describe('resolveOutputFormat', () => {
  it('honours an explicit choice', () => {
    expect(resolveOutputFormat('png', 'webp')).toBe('webp');
    expect(resolveOutputFormat(null, 'jpeg')).toBe('jpeg');
  });
  it('keeps jpeg/webp inputs in place on auto', () => {
    expect(resolveOutputFormat('jpeg', 'auto')).toBe('jpeg');
    expect(resolveOutputFormat('webp', 'auto')).toBe('webp');
  });
  it('defaults everything else to png on auto', () => {
    for (const f of ['png', 'gif', 'bmp', 'heic', 'avif', null] as const) {
      expect(resolveOutputFormat(f, 'auto')).toBe('png');
    }
  });
});
