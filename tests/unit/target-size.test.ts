import { describe, expect, it } from 'vitest';
import { searchQualityForTarget } from '../../src/lib/target-size';

// Deterministic mock encoder: size grows linearly with quality, exactly like a
// well-behaved real encoder over a small enough range for the binary search to matter.
// `data` mirrors what a real encoder would hand back alongside the size (e.g. a Blob) —
// here it's just a label unique to this call, so tests can assert the right one won.
function linearEncoder(maxBytes: number) {
  let calls = 0;
  return async (q: number) => {
    const size = Math.round(maxBytes * q);
    return { size, data: `blob-${calls++}:${size}` };
  };
}

describe('searchQualityForTarget', () => {
  it('converges close to the target size within tolerance', async () => {
    const encodeAt = linearEncoder(1_000_000);
    const result = await searchQualityForTarget(250_000, encodeAt);
    expect(result.achieved).toBe(true);
    expect(Math.abs(result.sizeBytes - 250_000)).toBeLessThanOrEqual(250_000 * 0.03 + 1);
    expect(result.quality).toBeGreaterThan(0);
    expect(result.quality).toBeLessThanOrEqual(0.95);
    expect(result.iterations).toBeGreaterThan(0);
  });

  it('prefers a result at or under the target over one slightly above', async () => {
    const encodeAt = linearEncoder(2_000_000);
    const result = await searchQualityForTarget(500_000, encodeAt, { maxIterations: 12 });
    expect(result.sizeBytes).toBeLessThanOrEqual(500_000 * 1.03 + 1);
  });

  it('reports best-effort (not achieved) when the target is below the minimum quality output', async () => {
    const encodeAt = linearEncoder(1_000_000); // min quality 0.1 -> ~100,000 bytes
    const result = await searchQualityForTarget(10_000, encodeAt, { minQuality: 0.1, maxIterations: 6 });
    expect(result.achieved).toBe(false);
    expect(result.sizeBytes).toBeGreaterThan(10_000);
  });

  it('is deterministic for the same inputs', async () => {
    const a = await searchQualityForTarget(300_000, linearEncoder(1_200_000));
    const b = await searchQualityForTarget(300_000, linearEncoder(1_200_000));
    expect(a.quality).toEqual(b.quality);
    expect(a.sizeBytes).toEqual(b.sizeBytes);
    expect(a.iterations).toEqual(b.iterations);
    expect(a.achieved).toEqual(b.achieved);
  });

  it('respects maxIterations', async () => {
    const encodeAt = linearEncoder(1_000_000);
    const result = await searchQualityForTarget(250_000, encodeAt, { maxIterations: 3, toleranceBytes: 1 });
    expect(result.iterations).toBeLessThanOrEqual(3);
  });

  it('never reports achieved for a result over the target, even within tolerance', async () => {
    // Regression for the P0 "compress to N KB" bug: the search used to accept
    // size <= targetBytes + toleranceBytes as "achieved", so a result a few bytes over a
    // 200KB target could be reported (and shipped) as a success. The target is a hard
    // maximum — an upload portal enforcing "under 200KB" will reject anything over it.
    const target = 204_800; // 200 KiB
    // An encoder whose output always lands slightly *over* the target at every quality in
    // range, simulating a search that can never actually hit the limit.
    const encodeAt = async (q: number) => ({ size: Math.round(target + 3_000 * q + 1), data: undefined });
    const result = await searchQualityForTarget(target, encodeAt, { maxIterations: 6 });
    expect(result.achieved).toBe(false);
    expect(result.sizeBytes).toBeGreaterThan(target);
  });

  it('returns the data (blob) for the chosen result, not merely the last one tried', async () => {
    // Regression for the P0 "compress to N KB" bug: the encode worker used to ship
    // `lastBlob` — the blob from the *final* iteration of the search — instead of the blob
    // that actually produced the chosen (achieved) size, which could be from an earlier
    // iteration. This asserts the library-level contract callers rely on to avoid that bug:
    // `data` always corresponds to `sizeBytes`, even when later iterations tried other sizes.
    const target = 200_000;
    const calls: { size: number; data: string }[] = [];
    let i = 0;
    const encodeAt = async (q: number) => {
      const size = Math.round(1_000_000 * q); // q=0.1 (min quality) -> 100,000, well under target
      const attempt = { size, data: `attempt-${i++}` };
      calls.push(attempt);
      return attempt;
    };
    const result = await searchQualityForTarget<string>(target, encodeAt);
    expect(result.achieved).toBe(true);
    expect(result.sizeBytes).toBeLessThanOrEqual(target);
    // The returned data must be the attempt whose size matches the chosen sizeBytes — a
    // caller (like the encode worker) that ships `result.data` is therefore guaranteed to
    // ship the blob that actually produced the reported size, whether or not that attempt
    // happened to be the last one the search tried.
    const matching = calls.find((c) => c.data === result.data);
    expect(matching).toBeDefined();
    expect(matching!.size).toBe(result.sizeBytes);
  });
});
