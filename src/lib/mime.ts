/**
 * Magic-byte format sniffing. Never trust file extensions or the browser-reported
 * MIME type alone — read the first bytes of the file so a renamed .jpg that is
 * really a PNG (or a HEIC with no extension) is still handled correctly.
 */

export type SniffedFormat = 'jpeg' | 'png' | 'gif' | 'bmp' | 'webp' | 'avif' | 'heic' | null;

const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end && i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

function matches(bytes: Uint8Array, offset: number, signature: number[]): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

/** Sniff an image container format from its leading bytes (at least 32 bytes recommended). */
export function sniffFormat(bytes: Uint8Array): SniffedFormat {
  if (matches(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (matches(bytes, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (matches(bytes, 0, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (matches(bytes, 0, [0x42, 0x4d])) return 'bmp';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12).toLowerCase();
    if (AVIF_BRANDS.has(brand)) return 'avif';
    if (HEIC_BRANDS.has(brand)) return 'heic';
  }
  return null;
}

/** Read the first N bytes of a File/Blob (default 32, enough for every signature above). */
export async function readHeader(file: Blob, length = 32): Promise<Uint8Array> {
  const buf = await file.slice(0, length).arrayBuffer();
  return new Uint8Array(buf);
}

export async function sniffFile(file: Blob): Promise<SniffedFormat> {
  return sniffFormat(await readHeader(file));
}

export const FORMAT_LABELS: Record<Exclude<SniffedFormat, null>, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  gif: 'GIF',
  bmp: 'BMP',
  webp: 'WebP',
  avif: 'AVIF',
  heic: 'HEIC/HEIF',
};

export type OutputFormat = 'jpeg' | 'png' | 'webp';
export const OUTPUT_MIME: Record<OutputFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Resolve the encoder MIME type for a "auto" output choice: keep JPEG/WebP inputs in their
 * own format (re-encoding to save size), and safely default anything the canvas API cannot
 * losslessly represent as an output codec (PNG, GIF, BMP, HEIC, AVIF) to PNG.
 */
export function resolveOutputFormat(detected: SniffedFormat, selected: 'auto' | OutputFormat): OutputFormat {
  if (selected !== 'auto') return selected;
  if (detected === 'jpeg') return 'jpeg';
  if (detected === 'webp') return 'webp';
  return 'png';
}
