/**
 * Main-thread client for the encode worker (src/workers/encode.ts), with a same-thread
 * canvas fallback for browsers without Worker + OffscreenCanvas support.
 */
import { planResize, type ResizePlanInput } from './resize';
import { searchQualityForTarget } from './target-size';
import { OUTPUT_MIME, type OutputFormat } from './mime';
import type { EncodeFailure, EncodeRequest, EncodeSuccess } from '../workers/encode';

export interface EncodeJobInput {
  bitmap: ImageBitmap;
  format: OutputFormat;
  quality: number; // 0..1
  targetBytes: number | null;
  resize: ResizePlanInput;
}

export interface EncodeJobResult {
  blob: Blob;
  width: number;
  height: number;
  quality: number;
  achievedTarget: boolean | null;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: EncodeJobResult) => void; reject: (e: Error) => void }>();

export function workerEncodingSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/encode.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<EncodeSuccess | EncodeFailure>) => {
      const msg = e.data;
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      if (msg.ok) {
        entry.resolve({ blob: msg.blob, width: msg.width, height: msg.height, quality: msg.quality, achievedTarget: msg.achievedTarget });
      } else {
        entry.reject(new Error(msg.error));
      }
    };
    worker.onerror = (e) => {
      for (const [id, entry] of pending) {
        entry.reject(new Error(e.message || 'Worker error'));
        pending.delete(id);
      }
    };
  }
  return worker;
}

function encodeViaWorker(job: EncodeJobInput): Promise<EncodeJobResult> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const req: EncodeRequest = {
      id,
      bitmap: job.bitmap,
      format: job.format,
      quality: job.quality,
      targetBytes: job.targetBytes,
      resize: job.resize,
    };
    // Deliberately NOT transferring the bitmap: structured-clone keeps the caller's copy
    // usable so the same decoded image can be re-encoded again (e.g. the user tweaks
    // quality and hits Convert a second time) without re-decoding the source file.
    getWorker().postMessage(req);
  });
}

/** Fallback for browsers without OffscreenCanvas: single-pass quality search on <canvas>. */
async function encodeOnMainThread(job: EncodeJobInput): Promise<EncodeJobResult> {
  const plan = planResize(job.bitmap.width, job.bitmap.height, job.resize);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, plan.width);
  canvas.height = Math.max(1, plan.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  // JPEG has no alpha channel: an uncleared canvas defaults to transparent black, so any
  // transparent source pixel would be encoded as solid black instead of flattened onto a
  // background colour. Fill white first, matching the convention used by other converters.
  if (job.format === 'jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(job.bitmap, plan.cropX, plan.cropY, plan.cropWidth, plan.cropHeight, 0, 0, plan.width, plan.height);

  const mime = OUTPUT_MIME[job.format];
  const toBlob = (quality: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas encode failed'))),
        mime,
        job.format === 'png' ? undefined : quality,
      );
    });

  let quality = job.quality;
  let blob: Blob;
  let achievedTarget: boolean | null = null;
  if (job.targetBytes && job.format !== 'png') {
    // encodeAt returns { size, data: blob } for each attempt, and searchQualityForTarget
    // hands back `data` for the chosen quality — so the blob shipped is always the one that
    // produced the chosen (achieved-or-best-effort) size, never merely the last one tried.
    const result = await searchQualityForTarget<Blob>(job.targetBytes, async (q) => {
      const b = await toBlob(q);
      return { size: b.size, data: b };
    });
    quality = result.quality;
    achievedTarget = result.achieved;
    blob = result.data;
  } else {
    blob = await toBlob(quality);
  }
  return { blob, width: plan.width, height: plan.height, quality, achievedTarget };
}

export async function encodeImage(job: EncodeJobInput): Promise<EncodeJobResult> {
  if (workerEncodingSupported()) {
    try {
      return await encodeViaWorker(job);
    } catch (err) {
      // Worker failed unexpectedly (e.g. CSP blocked it). The bitmap is NOT transferred to the
      // worker (see encodeViaWorker above — it is structured-cloned so the caller keeps a usable
      // copy), so a main-thread fallback would be possible here; we still surface the error
      // rather than silently retrying, since a worker failure usually indicates an environment
      // problem (e.g. a blocked `worker-src`) that would just fail again on retry.
      throw err;
    }
  }
  return encodeOnMainThread(job);
}
