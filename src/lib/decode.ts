/**
 * Decode any supported input file into an ImageBitmap, transparently handling HEIC/HEIF
 * (via a lazily-loaded libheif-js wasm chunk, only fetched when a HEIC file is added) and
 * feature-detecting AVIF/GIF/BMP support in the current browser.
 */
import { readHeader, sniffFormat, type SniffedFormat } from './mime';

export interface DecodedImage {
  bitmap: ImageBitmap;
  format: SniffedFormat;
}

let heifModulePromise: Promise<typeof import('libheif-js/wasm-bundle')> | null = null;
function loadHeif() {
  if (!heifModulePromise) heifModulePromise = import('libheif-js/wasm-bundle');
  return heifModulePromise;
}

async function decodeHeic(file: Blob): Promise<ImageBitmap> {
  const mod: any = await loadHeif();
  const libheif = mod.default ?? mod;
  const buf = await file.arrayBuffer();
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(buf);
  if (!images || !images.length) throw new Error('No image found in HEIC/HEIF file');
  const image = images[0];
  const width: number = image.get_width();
  const height: number = image.get_height();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const imageData = ctx.createImageData(width, height);
  await new Promise<void>((resolve, reject) => {
    image.display(imageData, (result: unknown) => {
      if (!result) reject(new Error('HEIC/HEIF decode failed'));
      else resolve();
    });
  });
  ctx.putImageData(imageData, 0, 0);
  return createImageBitmap(canvas);
}

/** Decode a file to an ImageBitmap, orientation-corrected. Throws with a friendly message on failure. */
export async function decodeImage(file: File): Promise<DecodedImage> {
  const header = await readHeader(file);
  const format = sniffFormat(header);

  if (format === 'heic') {
    const bitmap = await decodeHeic(file);
    return { bitmap, format };
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { bitmap, format };
  } catch (err) {
    if (format === 'avif') {
      throw new Error('This browser cannot decode AVIF images. Try Chrome, Edge or Firefox.');
    }
    throw new Error(err instanceof Error ? err.message : 'Could not decode this image');
  }
}

export function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|bmp|webp|avif|heic|heif)$/i.test(file.name);
}
