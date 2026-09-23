/**
 * Encode worker: resize + encode a decoded ImageBitmap off the main thread using
 * OffscreenCanvas. Runs the full "binary search on quality, then scale down if needed"
 * target-size strategy in one message round-trip so the UI thread never blocks.
 */
import { planResize, type ResizePlanInput } from '../lib/resize';
import { searchQualityForTarget } from '../lib/target-size';
import { OUTPUT_MIME, type OutputFormat } from '../lib/mime';

export interface EncodeRequest {
  id: number;
  bitmap: ImageBitmap;
  format: OutputFormat;
  quality: number; // 0..1, used directly when no targetBytes
  targetBytes: number | null;
  resize: ResizePlanInput;
}

export interface EncodeSuccess {
  id: number;
  ok: true;
  blob: Blob;
  width: number;
  height: number;
  quality: number;
  iterations: number;
  achievedTarget: boolean | null;
}

export interface EncodeFailure {
  id: number;
  ok: false;
  error: string;
}

const MIN_SIDE = 24;
const DOWNSCALE_ROUNDS = 4;
const DOWNSCALE_FACTOR = 0.82;

async function drawCanvas(
  bitmap: ImageBitmap,
  plan: { width: number; height: number; cropX: number; cropY: number; cropWidth: number; cropHeight: number },
  format: OutputFormat,
) {
  const canvas = new OffscreenCanvas(Math.max(1, plan.width), Math.max(1, plan.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable in worker');
  // JPEG has no alpha channel: an uncleared canvas defaults to transparent black, so any
  // transparent source pixel would be encoded as solid black instead of flattened onto a
  // background colour. Fill white first, matching the convention used by other converters.
  if (format === 'jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingEnabled = true;
  // @ts-expect-error - imageSmoothingQuality exists on modern OffscreenCanvasRenderingContext2D
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, plan.cropX, plan.cropY, plan.cropWidth, plan.cropHeight, 0, 0, plan.width, plan.height);
  return canvas;
}

self.onmessage = async (e: MessageEvent<EncodeRequest>) => {
  const req = e.data;
  try {
    const mime = OUTPUT_MIME[req.format];
    const srcW = req.bitmap.width;
    const srcH = req.bitmap.height;
    let plan = planResize(srcW, srcH, req.resize);

    const encodeAt = async (canvas: OffscreenCanvas, quality: number) =>
      canvas.convertToBlob(req.format === 'png' ? { type: mime } : { type: mime, quality });

    let blob: Blob;
    let usedQuality = req.quality;
    let iterations = 1;
    let achievedTarget: boolean | null = null;
    let outWidth = plan.width;
    let outHeight = plan.height;

    if (req.targetBytes && req.format !== 'png') {
      let bestBlob: Blob | null = null;
      let bestPlan = plan;
      let bestDiff = Infinity;
      let achieved = false;
      let totalIterations = 0;
      for (let round = 0; round <= DOWNSCALE_ROUNDS; round++) {
        const canvas = await drawCanvas(req.bitmap, plan, req.format);
        // encodeAt returns { size, data: blob } for each attempt, and searchQualityForTarget
        // hands back `data` for the chosen quality — so the blob shipped is always the one
        // that produced the chosen size, never merely the last one tried.
        const result = await searchQualityForTarget<Blob>(
          req.targetBytes,
          async (q) => {
            const b = await encodeAt(canvas, q);
            return { size: b.size, data: b };
          },
          { maxIterations: round === 0 ? 8 : 5 },
        );
        totalIterations += result.iterations;
        if (result.achieved) {
          // This round hit the target outright. It wins unconditionally — an at-or-under-
          // target result is always preferred over a merely "closer in absolute bytes" one
          // from an earlier (larger, over-target) round, so it must not be compared against
          // `bestDiff` (an earlier over-target round can easily have a smaller absolute diff
          // than a later under-target one, e.g. 204.8KB-over vs 40KB-under a 200KB target).
          bestBlob = result.data;
          usedQuality = result.quality;
          bestPlan = plan;
          achieved = true;
          break;
        }
        // Not achieved this round: keep the over-target attempt closest to the target, in
        // case no round ever achieves and this is shipped as the best-effort result.
        const diff = Math.abs(result.sizeBytes - req.targetBytes);
        if (diff < bestDiff) {
          bestBlob = result.data;
          bestDiff = diff;
          usedQuality = result.quality;
          bestPlan = plan;
        }
        if (plan.width <= MIN_SIDE || plan.height <= MIN_SIDE) break;
        plan = { ...plan, width: Math.round(plan.width * DOWNSCALE_FACTOR), height: Math.round(plan.height * DOWNSCALE_FACTOR) };
      }
      blob = bestBlob!;
      iterations = totalIterations;
      achievedTarget = achieved;
      outWidth = bestPlan.width;
      outHeight = bestPlan.height;
    } else {
      const canvas = await drawCanvas(req.bitmap, plan, req.format);
      blob = await encodeAt(canvas, req.quality);
    }

    // Close this worker-side ImageBitmap. Since the main thread does not transfer (only
    // clones) the bitmap when posting the job, this frees the worker's copy without
    // invalidating the caller's original — which stays open for a repeat conversion.
    try {
      req.bitmap.close();
    } catch {
      /* already closed */
    }

    const msg: EncodeSuccess = {
      id: req.id,
      ok: true,
      blob,
      width: outWidth,
      height: outHeight,
      quality: usedQuality,
      iterations,
      achievedTarget,
    };
    (self as unknown as Worker).postMessage(msg);
  } catch (err) {
    const msg: EncodeFailure = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
    (self as unknown as Worker).postMessage(msg);
  }
};
