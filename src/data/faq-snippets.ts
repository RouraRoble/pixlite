/** Shared FAQ answer fragments reused (and specialised) across programmatic tool pages. */
import { withBase } from '../lib/url';

export const PRIVACY_FAQ = {
  q: 'Does this upload my photos anywhere?',
  a: `No. Pixlite decodes and re-encodes images inside your browser tab using the Canvas API and a Web Worker — files never leave your device. Open your browser's DevTools Network tab (or switch to airplane mode) while converting to verify it yourself; see the <a href="${withBase('/privacy-proof/')}">privacy proof page</a> for step-by-step instructions.`,
};

export const BATCH_FAQ = (maxFiles: number) => ({
  q: 'How many files can I convert at once?',
  a: `Up to ${maxFiles} in one batch. Files are processed one at a time in a background Web Worker so a large batch does not freeze the tab — very large batches of full-resolution photos will still use more of your device's memory the more files you add, so on an older phone keep batches to a few dozen at once.`,
});

export const METADATA_FAQ = {
  q: 'Does it strip EXIF and GPS location data?',
  a: 'Yes, automatically. Re-encoding an image always drops all embedded metadata — camera model, timestamp and GPS coordinates included. If a photo you add contains a location, Pixlite shows a warning before you export.',
};
