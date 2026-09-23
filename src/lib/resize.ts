/** Pure resize/fit maths shared by the UI, the encode worker and its tests. */

export interface Dimensions {
  width: number;
  height: number;
}

export interface CropRect {
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
}

export interface ResizePreset {
  key: string;
  label: string;
  width: number;
  height: number;
  hint: string;
}

/** mm → px at a given DPI, rounded to the nearest whole pixel. */
export function mmToPx(mm: number, dpi = 300): number {
  return Math.round((mm / 25.4) * dpi);
}

/** in → px at a given DPI, rounded to the nearest whole pixel. */
export function inToPx(inches: number, dpi = 300): number {
  return Math.round(inches * dpi);
}

export const RESIZE_PRESETS: ResizePreset[] = [
  { key: '1080x1080', label: '1080 × 1080 — square / social post', width: 1080, height: 1080, hint: 'Instagram, LinkedIn square post' },
  { key: '1200x630', label: '1200 × 630 — OG / link preview', width: 1200, height: 630, hint: 'Open Graph share card' },
  { key: '1920w', label: '1920px wide', width: 1920, height: 0, hint: 'Full-HD wide, keeps aspect ratio' },
  { key: 'passport-mm', label: `Passport 35 × 45 mm @300dpi (${mmToPx(35)} × ${mmToPx(45)}px)`, width: mmToPx(35), height: mmToPx(45), hint: 'EU/UK passport photo size' },
  { key: 'passport-2x2in', label: `US passport 2 × 2 in @300dpi (${inToPx(2)} × ${inToPx(2)}px)`, width: inToPx(2), height: inToPx(2), hint: 'US passport / visa photo size' },
];

/**
 * Fit `srcW`×`srcH` inside a `maxW`×`maxH` box without cropping (contain), preserving
 * aspect ratio. A zero/undefined bound is treated as unconstrained. Never upscales unless
 * `allowUpscale` is set.
 */
export function fitContain(srcW: number, srcH: number, maxW?: number | null, maxH?: number | null, allowUpscale = false): Dimensions {
  const w = maxW && maxW > 0 ? maxW : Infinity;
  const h = maxH && maxH > 0 ? maxH : Infinity;
  if (!isFinite(w) && !isFinite(h)) return { width: Math.round(srcW), height: Math.round(srcH) };
  const scale = Math.min(w / srcW, h / srcH);
  const bounded = allowUpscale ? scale : Math.min(scale, 1);
  return {
    width: Math.max(1, Math.round(srcW * bounded)),
    height: Math.max(1, Math.round(srcH * bounded)),
  };
}

/** Scale by a percentage of the original (1–100+, clamped to a sane range by the caller). */
export function scaleByPercent(srcW: number, srcH: number, percent: number): Dimensions {
  const p = Math.max(1, percent) / 100;
  return { width: Math.max(1, Math.round(srcW * p)), height: Math.max(1, Math.round(srcH * p)) };
}

/**
 * Compute the centred source crop rect that fills a `targetW`×`targetH` box without
 * distortion (cover). Used for the fixed-size presets (social, OG, passport).
 */
export function coverCrop(srcW: number, srcH: number, targetW: number, targetH: number): CropRect {
  const targetRatio = targetW / targetH;
  const srcRatio = srcW / srcH;
  let cropWidth = srcW;
  let cropHeight = srcH;
  if (srcRatio > targetRatio) {
    cropWidth = Math.round(srcH * targetRatio);
  } else {
    cropHeight = Math.round(srcW / targetRatio);
  }
  const cropX = Math.round((srcW - cropWidth) / 2);
  const cropY = Math.round((srcH - cropHeight) / 2);
  return { cropX, cropY, cropWidth, cropHeight };
}

export interface ResizePlanInput {
  mode: 'none' | 'max' | 'percent' | 'preset';
  maxWidth?: number | null;
  maxHeight?: number | null;
  percent?: number | null;
  preset?: string | null;
}

export interface ResizePlan extends Dimensions, CropRect {}

/** Resolve a UI resize mode + source dimensions into a full draw plan (dest size + source crop). */
export function planResize(srcW: number, srcH: number, input: ResizePlanInput): ResizePlan {
  const full: CropRect = { cropX: 0, cropY: 0, cropWidth: srcW, cropHeight: srcH };
  if (input.mode === 'percent' && input.percent) {
    const d = scaleByPercent(srcW, srcH, input.percent);
    return { ...d, ...full };
  }
  if (input.mode === 'max' && (input.maxWidth || input.maxHeight)) {
    const d = fitContain(srcW, srcH, input.maxWidth, input.maxHeight);
    return { ...d, ...full };
  }
  if (input.mode === 'preset' && input.preset) {
    const preset = RESIZE_PRESETS.find((p) => p.key === input.preset);
    if (preset) {
      if (preset.height) {
        // Fixed-ratio preset (e.g. passport, OG card): crop to fill both dimensions exactly.
        const crop = coverCrop(srcW, srcH, preset.width, preset.height);
        return { width: preset.width, height: preset.height, ...crop };
      }
      // Width-only preset (e.g. "1920px wide"): compute both dimensions from the same
      // fitContain call so a source narrower than the preset is never stretched — it is
      // only ever scaled down (never upscaled), same as every other resize mode.
      const d = fitContain(srcW, srcH, preset.width, null);
      return { ...d, ...full };
    }
  }
  return { width: srcW, height: srcH, ...full };
}
