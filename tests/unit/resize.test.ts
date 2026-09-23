import { describe, expect, it } from 'vitest';
import { fitContain, scaleByPercent, coverCrop, planResize, mmToPx, inToPx, RESIZE_PRESETS } from '../../src/lib/resize';

describe('fitContain', () => {
  it('downscales preserving aspect ratio to fit within bounds', () => {
    const d = fitContain(4000, 2000, 1000, 1000);
    expect(d.width).toBe(1000);
    expect(d.height).toBe(500);
  });
  it('does not upscale by default', () => {
    const d = fitContain(400, 200, 1000, 1000);
    expect(d).toEqual({ width: 400, height: 200 });
  });
  it('handles only one bound given', () => {
    const d = fitContain(4000, 2000, 1000, null);
    expect(d.width).toBe(1000);
    expect(d.height).toBe(500);
  });
  it('is a no-op with no bounds', () => {
    expect(fitContain(300, 150)).toEqual({ width: 300, height: 150 });
  });
});

describe('scaleByPercent', () => {
  it('scales proportionally', () => {
    expect(scaleByPercent(1000, 500, 50)).toEqual({ width: 500, height: 250 });
    expect(scaleByPercent(1000, 500, 200)).toEqual({ width: 2000, height: 1000 });
  });
  it('clamps to at least 1%', () => {
    expect(scaleByPercent(1000, 500, -10)).toEqual({ width: 10, height: 5 });
  });
});

describe('coverCrop', () => {
  it('crops the wider dimension when source is wider than target ratio', () => {
    const crop = coverCrop(2000, 1000, 1, 1); // wide source -> square target
    expect(crop.cropHeight).toBe(1000);
    expect(crop.cropWidth).toBe(1000);
    expect(crop.cropX).toBe(500);
    expect(crop.cropY).toBe(0);
  });
  it('crops the taller dimension when source is taller than target ratio', () => {
    const crop = coverCrop(1000, 2000, 1, 1);
    expect(crop.cropWidth).toBe(1000);
    expect(crop.cropHeight).toBe(1000);
    expect(crop.cropY).toBe(500);
  });
});

describe('mmToPx / inToPx', () => {
  it('converts passport sizes at 300dpi', () => {
    expect(mmToPx(35)).toBe(413);
    expect(mmToPx(45)).toBe(531);
    expect(inToPx(2)).toBe(600);
  });
});

describe('planResize', () => {
  it('mode none returns source dims and full crop', () => {
    const p = planResize(800, 600, { mode: 'none' });
    expect(p).toEqual({ width: 800, height: 600, cropX: 0, cropY: 0, cropWidth: 800, cropHeight: 600 });
  });
  it('mode max applies fitContain', () => {
    const p = planResize(2000, 1000, { mode: 'max', maxWidth: 500 });
    expect(p.width).toBe(500);
    expect(p.height).toBe(250);
  });
  it('mode percent scales', () => {
    const p = planResize(1000, 1000, { mode: 'percent', percent: 25 });
    expect(p.width).toBe(250);
    expect(p.height).toBe(250);
  });
  it('mode preset with both dims applies cover crop and exact output size', () => {
    const preset = RESIZE_PRESETS.find((p) => p.key === '1080x1080')!;
    const p = planResize(4000, 2000, { mode: 'preset', preset: preset.key });
    expect(p.width).toBe(1080);
    expect(p.height).toBe(1080);
    expect(p.cropWidth).toBe(p.cropHeight);
  });
  it('mode preset with only a width (1920w) keeps aspect ratio, no crop', () => {
    const p = planResize(4000, 2000, { mode: 'preset', preset: '1920w' });
    expect(p.width).toBe(1920);
    expect(p.height).toBe(960);
    expect(p.cropWidth).toBe(4000);
  });
  it('mode preset with only a width does not stretch a source narrower than the preset', () => {
    // Regression: width used to be set unconditionally while height was fitted, stretching
    // an 800x600 source to 1920x600 instead of leaving it unscaled.
    const p = planResize(800, 600, { mode: 'preset', preset: '1920w' });
    expect(p.width).toBe(800);
    expect(p.height).toBe(600);
    expect(p.cropWidth).toBe(800);
    expect(p.cropHeight).toBe(600);
  });
  it('unknown preset falls back to source dims', () => {
    const p = planResize(800, 600, { mode: 'preset', preset: 'nope' });
    expect(p.width).toBe(800);
    expect(p.height).toBe(600);
  });
});
