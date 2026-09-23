/**
 * Binary-search strategy for "compress to exactly N KB". Deterministic given a mock
 * encoder function, so it is fully unit-testable without a real canvas.
 */

export interface TargetSizeOptions {
  minQuality?: number;
  maxQuality?: number;
  maxIterations?: number;
  toleranceBytes?: number;
}

export interface TargetSizeResult<T = undefined> {
  quality: number;
  sizeBytes: number;
  iterations: number;
  /** True when the achieved size is at or under target — a hard maximum, never "close enough". */
  achieved: boolean;
  /** The payload (e.g. the encoded Blob) that `encodeAt` returned for the chosen quality. */
  data: T;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Binary-search the encoder quality (0–1) that produces output as close to `targetBytes` as
 * possible, preferring results at or under the target. `encodeAt(quality)` must resolve to
 * `{ size, data }` for that quality — `size` in bytes, and `data` the actual encoded payload
 * (e.g. a Blob) for that attempt. The caller must return this `data` alongside the size (rather
 * than separately tracking "the last thing encoded") so the payload shipped is guaranteed to be
 * the one that produced the chosen — not merely the most recently tried — size.
 */
export async function searchQualityForTarget<T = undefined>(
  targetBytes: number,
  encodeAt: (quality: number) => Promise<{ size: number; data: T }>,
  opts: TargetSizeOptions = {},
): Promise<TargetSizeResult<T>> {
  const minQuality = clamp(opts.minQuality ?? 0.1, 0.01, 1);
  const maxQuality = clamp(opts.maxQuality ?? 0.95, minQuality, 1);
  const maxIterations = Math.max(1, opts.maxIterations ?? 8);
  const toleranceBytes = opts.toleranceBytes ?? Math.max(256, Math.round(targetBytes * 0.03));

  let lo = minQuality;
  let hi = maxQuality;
  let iterations = 0;
  let bestUnder: { quality: number; size: number; data: T } | null = null;
  let bestOverall: { quality: number; size: number; data: T } | null = null;

  const record = (quality: number, size: number, data: T) => {
    if (!bestOverall || Math.abs(size - targetBytes) < Math.abs(bestOverall.size - targetBytes)) {
      bestOverall = { quality, size, data };
    }
    if (size <= targetBytes && (!bestUnder || size > bestUnder.size)) {
      bestUnder = { quality, size, data };
    }
  };

  for (let i = 0; i < maxIterations; i++) {
    iterations++;
    const q = (lo + hi) / 2;
    const { size, data } = await encodeAt(q);
    record(q, size, data);
    if (Math.abs(size - targetBytes) <= toleranceBytes) break;
    if (size > targetBytes) hi = q;
    else lo = q;
  }

  const chosen = (bestUnder ?? bestOverall)!;
  return {
    quality: chosen.quality,
    sizeBytes: chosen.size,
    iterations,
    // The target is a hard maximum (an upload portal will reject anything over it), so
    // "achieved" only counts a result at or under targetBytes — never one merely within
    // tolerance of it from above. `toleranceBytes` only controls when the search stops early.
    achieved: chosen.size <= targetBytes,
    data: chosen.data,
  };
}
