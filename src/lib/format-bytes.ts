/** Human-readable byte formatting and before/after savings summaries. */

export function formatBytes(bytes: number, decimals = 1): string {
  if (!isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)) - 1);
  const value = bytes / Math.pow(1024, i + 1);
  return `${value.toFixed(decimals)} ${units[i]}`;
}

export interface Savings {
  percent: number;
  savedBytes: number;
  grew: boolean;
  label: string;
}

/** Summarise the change from an original size to a new size (used for the shareable result card). */
export function summarizeSavings(originalBytes: number, newBytes: number): Savings {
  const diff = originalBytes - newBytes;
  const percent = originalBytes > 0 ? Math.round((diff / originalBytes) * 100) : 0;
  const grew = newBytes > originalBytes;
  const label = grew
    ? `Grew ${Math.abs(percent)}% (${formatBytes(originalBytes)} → ${formatBytes(newBytes)})`
    : `Saved ${percent}% (${formatBytes(originalBytes)} → ${formatBytes(newBytes)})`;
  return { percent, savedBytes: Math.max(0, diff), grew, label };
}
