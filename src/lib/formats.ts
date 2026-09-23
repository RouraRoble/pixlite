/** Format facts catalogue — the source of truth for the per-tool-page comparison tables. */

export interface FormatInfo {
  key: 'jpeg' | 'png' | 'webp' | 'heic' | 'avif' | 'gif' | 'bmp';
  name: string;
  ext: string;
  mime: string;
  transparency: boolean;
  animation: boolean;
  compression: 'lossy' | 'lossless' | 'both';
  typicalUse: string;
  browserSupport: string;
  canEncodeInBrowser: boolean;
}

export const FORMATS: Record<FormatInfo['key'], FormatInfo> = {
  jpeg: {
    key: 'jpeg',
    name: 'JPEG',
    ext: 'jpg',
    mime: 'image/jpeg',
    transparency: false,
    animation: false,
    compression: 'lossy',
    typicalUse: 'Photos and camera output — small files, no transparency.',
    browserSupport: 'Universal — every browser, OS and app can open a JPEG.',
    canEncodeInBrowser: true,
  },
  png: {
    key: 'png',
    name: 'PNG',
    ext: 'png',
    mime: 'image/png',
    transparency: true,
    animation: false,
    compression: 'lossless',
    typicalUse: 'Screenshots, logos, illustrations and anything needing a transparent background.',
    browserSupport: 'Universal — every browser, OS and app can open a PNG.',
    canEncodeInBrowser: true,
  },
  webp: {
    key: 'webp',
    name: 'WebP',
    ext: 'webp',
    mime: 'image/webp',
    transparency: true,
    animation: true,
    compression: 'both',
    typicalUse: 'Modern web images — smaller than JPEG/PNG at the same visual quality.',
    browserSupport: 'All current browsers (Chrome, Firefox, Safari 14+, Edge). Some older apps and printers still reject it.',
    canEncodeInBrowser: true,
  },
  heic: {
    key: 'heic',
    name: 'HEIC/HEIF',
    ext: 'heic',
    mime: 'image/heic',
    transparency: true,
    animation: false,
    compression: 'both',
    typicalUse: "iPhone/iPad camera photos since iOS 11 — roughly half the size of an equivalent JPEG.",
    browserSupport: 'Safari opens it natively. Chrome, Firefox, Edge, Windows Photos and most web uploaders do not — hence converting.',
    canEncodeInBrowser: false,
  },
  avif: {
    key: 'avif',
    name: 'AVIF',
    ext: 'avif',
    mime: 'image/avif',
    transparency: true,
    animation: true,
    compression: 'both',
    typicalUse: 'Next-gen web image format — often the smallest file for a given quality, used by modern CDNs.',
    browserSupport: 'Chrome, Firefox and Edge decode it well; older Safari and most desktop apps do not.',
    canEncodeInBrowser: false,
  },
  gif: {
    key: 'gif',
    name: 'GIF',
    ext: 'gif',
    mime: 'image/gif',
    transparency: true,
    animation: true,
    compression: 'lossless',
    typicalUse: 'Short looping animations and simple graphics with few colours (256 max).',
    browserSupport: 'Universal, but limited to 256 colours per frame — large photos look banded.',
    canEncodeInBrowser: false,
  },
  bmp: {
    key: 'bmp',
    name: 'BMP',
    ext: 'bmp',
    mime: 'image/bmp',
    transparency: false,
    animation: false,
    compression: 'lossless',
    typicalUse: 'Uncompressed Windows bitmap — old scanners, some enterprise software, huge file sizes.',
    browserSupport: 'Universal to open; almost nothing produces it on purpose any more.',
    canEncodeInBrowser: false,
  },
};

export function formatPair(from: FormatInfo['key'], to: FormatInfo['key']) {
  return { from: FORMATS[from], to: FORMATS[to] };
}
