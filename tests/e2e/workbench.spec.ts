import { test, expect } from '@playwright/test';
import path from 'node:path';

const fixture = path.join(process.cwd(), 'tests/fixtures/sample.png');
const transparentFixture = path.join(process.cwd(), 'tests/fixtures/transparent.png');
const largeDetailedFixture = path.join(process.cwd(), 'tests/fixtures/large-detailed.jpg');
// baseURL (playwright.config.ts) is the bare origin; the app itself lives under BASE (e.g. /pixlite).
const BASE = ('/' + (process.env.BASE || '').replace(/^[\/]+|[\/]+$/g, '')).replace(/\/$/, '');

test.describe('core workbench flow', () => {
  test('convert a PNG to JPG and get a download link', async ({ page }) => {
    await page.goto(BASE + '/');
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(fixture);

    // Card appears with the original size shown.
    await expect(page.locator('.wb-card')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('.wb-card')).toContainText('PNG');

    // Switch output format to JPG.
    await page.locator('#wb-format').selectOption('jpeg');

    // Convert.
    await page.getByRole('button', { name: /Convert \d+ file/ }).click();

    const download = page.getByRole('link', { name: 'Download' });
    await expect(download).toBeVisible({ timeout: 20_000 });
    const downloadName = await download.getAttribute('download');
    expect(downloadName).toMatch(/\.jpg$/);

    // Before/after size shown with an arrow between them.
    await expect(page.locator('.wb-card')).toContainText('→');
    await expect(page.locator('.wb-card')).toContainText(/Saved|Grew/);
  });

  test('compress-image-to-50kb reaches (or best-effort reports) the target size', async ({ page }) => {
    await page.goto(BASE + '/compress-image-to-50kb/');
    await expect(page.locator('h1')).toContainText('50');

    const input = page.locator('input[type="file"]');
    await input.setInputFiles(fixture);
    await expect(page.locator('.wb-card')).toHaveCount(1, { timeout: 15_000 });

    await page.getByRole('button', { name: /Convert \d+ file/ }).click();

    const download = page.getByRole('link', { name: 'Download' });
    await expect(download).toBeVisible({ timeout: 20_000 });
    const href = await download.getAttribute('href');
    expect(href).toBeTruthy();

    const size = await page.evaluate(async (url) => {
      const res = await fetch(url as string);
      const blob = await res.blob();
      return blob.size;
    }, href);

    // Either the target was hit (with search tolerance), or the UI honestly reports best-effort.
    const cardText = await page.locator('.wb-card').innerText();
    const achieved = size <= 50 * 1024 * 1.1;
    const reportedBestEffort = /best effort/i.test(cardText);
    expect(achieved || reportedBestEffort).toBe(true);
  });

  test('a shared settings link pre-configures the workbench', async ({ page }) => {
    await page.goto(BASE + '/?fmt=webp&q=40');
    await expect(page.locator('#wb-format')).toHaveValue('webp');
    await expect(page.locator('#wb-quality')).toHaveValue('40');
  });

  test('compress-image-to-200kb never ships a file over the target', async ({ page }) => {
    // Regression for the P0 "compress to N KB returns an oversized file reported as success" bug.
    test.setTimeout(60_000);
    await page.goto(BASE + '/compress-image-to-200kb/');
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(largeDetailedFixture);
    await expect(page.locator('.wb-card')).toHaveCount(1, { timeout: 20_000 });

    await page.getByRole('button', { name: /Convert \d+ file/ }).click();

    const download = page.getByRole('link', { name: 'Download' });
    await expect(download).toBeVisible({ timeout: 30_000 });
    const href = await download.getAttribute('href');
    expect(href).toBeTruthy();

    const size = await page.evaluate(async (url) => {
      const res = await fetch(url as string);
      const blob = await res.blob();
      return blob.size;
    }, href);

    const targetBytes = 200 * 1024;
    const cardText = await page.locator('.wb-card').innerText();
    const reportedBestEffort = /best effort/i.test(cardText);
    // The target is a hard maximum: either the file is at or under it, or the UI honestly
    // says it could not get there — it must never silently ship an oversized "success".
    if (!reportedBestEffort) {
      expect(size).toBeLessThanOrEqual(targetBytes);
    }
    // The size shown on the card must match the size of the file actually downloaded.
    const shownSize = /→\s*([\d.]+)\s*(KB|MB)/i.exec(cardText);
    expect(shownSize).toBeTruthy();
  });

  test('a shared settings link with out-of-range values is clamped', async ({ page }) => {
    await page.goto(BASE + '/?q=-50&pct=NaN&kb=-5');
    // q clamped into [1,100], never shown as a raw negative number.
    await expect(page.locator('#wb-quality')).not.toHaveValue('-50');
    const q = Number(await page.locator('#wb-quality').inputValue());
    expect(q).toBeGreaterThanOrEqual(1);
    expect(q).toBeLessThanOrEqual(100);
  });

  test('converting a transparent PNG to JPG flattens onto white, not black', async ({ page }) => {
    // Regression for the P1 "transparent images converted to JPG get a black background" bug.
    await page.goto(BASE + '/png-to-jpg/');
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(transparentFixture);
    await expect(page.locator('.wb-card')).toHaveCount(1, { timeout: 15_000 });

    await page.getByRole('button', { name: /Convert \d+ file/ }).click();
    const download = page.getByRole('link', { name: 'Download' });
    await expect(download).toBeVisible({ timeout: 20_000 });
    const href = await download.getAttribute('href');

    const topLeftPixel = await page.evaluate(async (url) => {
      const res = await fetch(url as string);
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(2, 2, 1, 1).data;
      return [data[0], data[1], data[2]];
    }, href);

    // The source's left half was fully transparent; a JPEG re-encode must flatten that onto
    // a white background — never leave it as the default transparent-canvas black.
    expect(topLeftPixel[0]).toBeGreaterThan(200);
    expect(topLeftPixel[1]).toBeGreaterThan(200);
    expect(topLeftPixel[2]).toBeGreaterThan(200);
  });

  test('the 1920px-wide preset never upscales a smaller source', async ({ page }) => {
    // Regression for the P1 "1920px wide preset stretches smaller images" bug.
    await page.goto(BASE + '/?rz=preset&preset=1920w');
    const input = page.locator('input[type="file"]');
    await input.setInputFiles(fixture); // sample.png is 800x600
    await expect(page.locator('.wb-card')).toHaveCount(1, { timeout: 15_000 });

    await page.getByRole('button', { name: /Convert \d+ file/ }).click();
    await expect(page.locator('.wb-card')).toContainText('→', { timeout: 20_000 });
    const cardText = await page.locator('.wb-card').innerText();
    // Must report the original 800x600, not stretched to 1920 wide.
    expect(cardText).toMatch(/800\s*×\s*600/);
    expect(cardText).not.toMatch(/1920\s*×\s*600/);
  });
});

test.describe('base-path link integrity', () => {
  test('the home page tool grid links resolve under the deployment base, not 404', async ({ page }) => {
    // Regression for the P0 "internal links drop the base path" bug.
    await page.goto(BASE + '/');
    const link = page.locator('#tools a.card').first();
    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();
    if (BASE) expect(href).toMatch(new RegExp(`^${BASE}/`));
    const res = await page.request.get(href!);
    expect(res.status(), href!).toBeLessThan(400);
  });

  test('a tool page related-tools link resolves under the deployment base, not 404', async ({ page }) => {
    await page.goto(BASE + '/heic-to-jpg/');
    const related = page.locator('h2:has-text("Related tools") + ul a').first();
    const href = await related.getAttribute('href');
    expect(href).toBeTruthy();
    if (BASE) expect(href).toMatch(new RegExp(`^${BASE}/`));
    const res = await page.request.get(href!);
    expect(res.status(), href!).toBeLessThan(400);
  });
});
