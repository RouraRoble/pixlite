import { describe, expect, it } from 'vitest';
import { replaceExtension, dedupeNames, sanitizeZipName } from '../../src/lib/filename';

describe('replaceExtension', () => {
  it('swaps the extension', () => {
    expect(replaceExtension('photo.HEIC', 'jpg')).toBe('photo.jpg');
    expect(replaceExtension('photo.jpeg', '.png')).toBe('photo.png');
  });
  it('handles files without an extension', () => {
    expect(replaceExtension('IMG_0001', 'webp')).toBe('IMG_0001.webp');
  });
  it('handles dotfiles / leading-dot names safely', () => {
    expect(replaceExtension('.gitignore', 'png')).toBe('.gitignore.png');
  });
});

describe('dedupeNames', () => {
  it('leaves unique names untouched', () => {
    expect(dedupeNames(['a.jpg', 'b.jpg'])).toEqual(['a.jpg', 'b.jpg']);
  });
  it('numbers collisions', () => {
    expect(dedupeNames(['a.jpg', 'a.jpg', 'a.jpg'])).toEqual(['a.jpg', 'a (1).jpg', 'a (2).jpg']);
  });
});

describe('sanitizeZipName', () => {
  it('strips path separators', () => {
    expect(sanitizeZipName('../../etc/passwd.png')).toBe('..-..-etc-passwd.png');
  });
  it('falls back to a default for empty names', () => {
    expect(sanitizeZipName('   ')).toBe('file');
  });
});
