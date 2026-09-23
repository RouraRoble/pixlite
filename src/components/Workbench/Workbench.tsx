import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import './workbench.css';
import { resolveOutputFormat, type SniffedFormat, type OutputFormat } from '../../lib/mime';
import { decodeImage, isLikelyImageFile } from '../../lib/decode';
import { readFileMetadata, type FileMetadata } from '../../lib/exif';
import { encodeImage, type EncodeJobResult } from '../../lib/encode-client';
import { planResize, RESIZE_PRESETS } from '../../lib/resize';
import { formatBytes, summarizeSavings } from '../../lib/format-bytes';
import { replaceExtension, dedupeNames } from '../../lib/filename';
import { buildOsmLink, formatCoords, gpsRevealShareText } from '../../lib/gps';
import { buildZip } from '../../lib/zip';
import { site } from '../../site.config';

const MAX_FILES = site.limits.maxFiles;
const MAX_FILE_MB = site.limits.maxFileSizeMB;
const WARN_LONG_SIDE = site.limits.maxLongestSidePx;

type ResizeMode = 'none' | 'max' | 'percent' | 'preset';
type Status = 'queued' | 'decoding' | 'ready' | 'processing' | 'done' | 'error';

interface FileItem {
  id: string;
  file: File;
  name: string;
  originalSize: number;
  status: Status;
  error?: string;
  detectedFormat: SniffedFormat;
  width?: number;
  height?: number;
  bitmap?: ImageBitmap;
  thumbUrl?: string;
  meta?: FileMetadata;
  showAfter?: boolean;
  result?: {
    blob: Blob;
    url: string;
    name: string;
    width: number;
    height: number;
    achievedTarget: boolean | null;
    quality: number;
  };
}

export interface WorkbenchProps {
  initialFormat?: 'auto' | OutputFormat;
  lockFormat?: boolean;
  initialQuality?: number;
  initialResizeMode?: ResizeMode;
  initialMaxWidth?: number | null;
  initialMaxHeight?: number | null;
  initialPercent?: number | null;
  initialPreset?: string | null;
  lockResize?: boolean;
  initialTargetKB?: number | null;
  lockTargetKB?: boolean;
  acceptHint?: string;
  dropTitle?: string;
}

let uid = 0;
const nextId = () => `f${++uid}-${Date.now().toString(36)}`;

/**
 * Parse a query param as a finite integer within [min, max], or undefined if invalid/absent.
 * A value below `min` (e.g. `kb=-5`, `kb=0`, `q=-50`) is treated as nonsense and ignored —
 * clamping it *up* to `min` used to turn a corrupted link into the most destructive possible
 * setting (a 1KB target, quality 1) instead of just falling back to the page's own default.
 * A value above `max` is still clamped down, since that direction is merely "too generous".
 */
function readIntParam(p: URLSearchParams, key: string, min: number, max: number): number | undefined {
  const raw = p.get(key);
  if (!raw) return undefined;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < min) return undefined;
  return Math.min(max, n);
}

/**
 * Parse settings encoded in the page's own URL. A shared/bookmarked link is untrusted input
 * — it may be hand-crafted or corrupted — so every value is validated and clamped to a sane
 * range rather than passed straight through (a stray `q=-50` or `pct=NaN` used to reach the
 * UI verbatim). `locked` mirrors which settings this page has locked via workbench props
 * (tool pages lock format/resize/target to their exact job); a locked setting is never
 * overridden from the URL, since `?fmt=png` overriding a locked `/heic-to-jpg/` page would
 * silently break that page's whole point.
 */
function readQueryDefaults(locked: { format?: boolean; resize?: boolean; targetKB?: boolean }): Partial<WorkbenchProps> {
  if (typeof window === 'undefined') return {};
  try {
    const p = new URLSearchParams(window.location.search);
    const out: Partial<WorkbenchProps> = {};
    if (!locked.format) {
      const fmt = p.get('fmt');
      if (fmt && ['auto', 'jpeg', 'png', 'webp'].includes(fmt)) out.initialFormat = fmt as never;
    }
    const q = readIntParam(p, 'q', 1, 100);
    if (q !== undefined) out.initialQuality = q;
    if (!locked.resize) {
      const rz = p.get('rz');
      if (rz && ['none', 'max', 'percent', 'preset'].includes(rz)) out.initialResizeMode = rz as ResizeMode;
      const mw = readIntParam(p, 'mw', 1, 20000);
      if (mw !== undefined) out.initialMaxWidth = mw;
      const mh = readIntParam(p, 'mh', 1, 20000);
      if (mh !== undefined) out.initialMaxHeight = mh;
      const pct = readIntParam(p, 'pct', 1, 200);
      if (pct !== undefined) out.initialPercent = pct;
      const preset = p.get('preset');
      if (preset && RESIZE_PRESETS.some((rp) => rp.key === preset)) out.initialPreset = preset;
    }
    if (!locked.targetKB) {
      const kb = readIntParam(p, 'kb', 1, 51200);
      if (kb !== undefined) out.initialTargetKB = kb;
    }
    return out;
  } catch {
    return {};
  }
}

export default function Workbench(props: WorkbenchProps) {
  // Initial render (including the server-rendered snapshot) always uses plain props, so the
  // first client render matches SSR exactly. Query-string overrides are applied a moment later
  // in a mount effect (below) via real state updates, so the DOM is patched by Preact's normal
  // diff (hydration alone trusts the server markup and would not otherwise repaint a mismatch).
  const [files, setFiles] = useState<FileItem[]>([]);
  const [format, setFormat] = useState<'auto' | OutputFormat>(props.initialFormat ?? 'auto');
  const [quality, setQuality] = useState<number>(props.initialQuality ?? 80);
  const [resizeMode, setResizeMode] = useState<ResizeMode>(props.initialResizeMode ?? 'none');
  const [maxWidth, setMaxWidth] = useState<number | ''>(props.initialMaxWidth ?? '');
  const [maxHeight, setMaxHeight] = useState<number | ''>(props.initialMaxHeight ?? '');
  const [percent, setPercent] = useState<number>(props.initialPercent ?? 50);
  const [preset, setPreset] = useState<string>(props.initialPreset ?? RESIZE_PRESETS[0].key);
  const [targetKB, setTargetKB] = useState<number | ''>(props.initialTargetKB ?? '');
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const merged = props;

  // Apply any settings encoded in the page's own URL (?fmt=&q=&rz=&mw=&mh=&pct=&preset=&kb=) once,
  // right after mount — this is what makes a shared/bookmarked link reproduce someone's settings.
  useEffect(() => {
    const q = readQueryDefaults({ format: props.lockFormat, resize: props.lockResize, targetKB: props.lockTargetKB });
    if (q.initialFormat !== undefined) setFormat(q.initialFormat);
    if (q.initialQuality !== undefined) setQuality(q.initialQuality);
    if (q.initialResizeMode !== undefined) setResizeMode(q.initialResizeMode);
    if (q.initialMaxWidth !== undefined) setMaxWidth(q.initialMaxWidth);
    if (q.initialMaxHeight !== undefined) setMaxHeight(q.initialMaxHeight);
    if (q.initialPercent !== undefined) setPercent(q.initialPercent);
    if (q.initialPreset !== undefined) setPreset(q.initialPreset);
    if (q.initialTargetKB !== undefined) setTargetKB(q.initialTargetKB);
    setSettingsHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- URL-state sync: settings are shareable via query params, files never leave the device.
  useEffect(() => {
    if (typeof window === 'undefined' || !settingsHydrated) return;
    const p = new URLSearchParams();
    if (format !== 'auto') p.set('fmt', format);
    if (quality !== 80) p.set('q', String(quality));
    if (resizeMode !== 'none') p.set('rz', resizeMode);
    if (resizeMode === 'max') {
      if (maxWidth) p.set('mw', String(maxWidth));
      if (maxHeight) p.set('mh', String(maxHeight));
    }
    if (resizeMode === 'percent') p.set('pct', String(percent));
    if (resizeMode === 'preset') p.set('preset', preset);
    if (targetKB) p.set('kb', String(targetKB));
    const qs = p.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [format, quality, resizeMode, maxWidth, maxHeight, percent, preset, targetKB]);

  useEffect(() => {
    return () => {
      files.forEach((f) => {
        if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl);
        if (f.result?.url) URL.revokeObjectURL(f.result.url);
        try {
          f.bitmap?.close();
        } catch {
          /* noop */
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const announce = (msg: string) => {
    setNotice(msg);
    if (liveRef.current) liveRef.current.textContent = msg;
  };

  const updateFile = (id: string, patch: Partial<FileItem>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const item = prev.find((f) => f.id === id);
      if (item) {
        if (item.thumbUrl) URL.revokeObjectURL(item.thumbUrl);
        if (item.result?.url) URL.revokeObjectURL(item.result.url);
        try {
          item.bitmap?.close();
        } catch {
          /* noop */
        }
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const clearAll = () => {
    files.forEach((f) => {
      if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl);
      if (f.result?.url) URL.revokeObjectURL(f.result.url);
      try {
        f.bitmap?.close();
      } catch {
        /* noop */
      }
    });
    setFiles([]);
    announce('Cleared all files.');
  };

  const makeThumb = async (bitmap: ImageBitmap): Promise<string> => {
    const size = 128;
    const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7));
    return blob ? URL.createObjectURL(blob) : '';
  };

  const ingestFile = async (item: FileItem) => {
    updateFile(item.id, { status: 'decoding' });
    try {
      if (item.file.size > MAX_FILE_MB * 1024 * 1024) {
        throw new Error(`File is larger than the ${MAX_FILE_MB} MB limit for this workbench.`);
      }
      const { bitmap, format: detected } = await decodeImage(item.file);
      const thumbUrl = await makeThumb(bitmap);
      updateFile(item.id, {
        status: 'ready',
        bitmap,
        detectedFormat: detected,
        width: bitmap.width,
        height: bitmap.height,
        thumbUrl,
      });
      readFileMetadata(item.file).then((meta) => updateFile(item.id, { meta }));
    } catch (err) {
      updateFile(item.id, { status: 'error', error: err instanceof Error ? err.message : 'Could not read this file' });
    }
  };

  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      const incoming = Array.from(list).filter(isLikelyImageFile);
      if (!incoming.length) {
        announce('No image files found in that selection.');
        return;
      }
      const room = MAX_FILES - files.length;
      const accepted = incoming.slice(0, Math.max(0, room));
      if (incoming.length > accepted.length) {
        announce(`Only added ${accepted.length} of ${incoming.length} files — the workbench caps a batch at ${MAX_FILES} images.`);
      } else {
        announce(`Added ${accepted.length} file${accepted.length === 1 ? '' : 's'}.`);
      }
      const items: FileItem[] = accepted.map((file) => ({
        id: nextId(),
        file,
        name: file.name,
        originalSize: file.size,
        status: 'queued',
        detectedFormat: null,
      }));
      setFiles((prev) => [...prev, ...items]);
      for (const item of items) {
        // eslint-disable-next-line no-await-in-loop
        await ingestFile(item);
      }
    },
    [files.length],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.files;
      if (items && items.length) {
        addFiles(items);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  };

  const buildEncodeSettings = () => ({
    resize: {
      mode: resizeMode,
      maxWidth: typeof maxWidth === 'number' ? maxWidth : null,
      maxHeight: typeof maxHeight === 'number' ? maxHeight : null,
      percent,
      preset,
    },
    targetBytes: targetKB ? Number(targetKB) * 1024 : null,
  });

  const convertOne = async (item: FileItem) => {
    if (!item.bitmap) return;
    updateFile(item.id, { status: 'processing' });
    try {
      const settings = buildEncodeSettings();
      let outFormat = resolveOutputFormat(item.detectedFormat, format);
      // A KB target only means something for a lossy format. When the user picked "Auto"
      // (rather than explicitly choosing PNG) and the input resolves to PNG — HEIC, AVIF,
      // GIF and BMP all do — silently dropping the target would ship a full-size PNG while
      // the UI still shows the target field as active. Resolve to JPEG instead so the target
      // actually applies; an explicit PNG selection still disables the target field in the UI.
      if (settings.targetBytes && format === 'auto' && outFormat === 'png') {
        outFormat = 'jpeg';
      }
      const effectiveTarget = outFormat === 'png' ? null : settings.targetBytes;
      const result: EncodeJobResult = await encodeImage({
        bitmap: item.bitmap,
        format: outFormat,
        quality: Math.min(1, Math.max(0.01, quality / 100)),
        targetBytes: effectiveTarget,
        resize: settings.resize,
      });
      if (item.result?.url) URL.revokeObjectURL(item.result.url);
      const outName = replaceExtension(item.name, outFormat === 'jpeg' ? 'jpg' : outFormat);
      updateFile(item.id, {
        status: 'done',
        result: {
          blob: result.blob,
          url: URL.createObjectURL(result.blob),
          name: outName,
          width: result.width,
          height: result.height,
          achievedTarget: result.achievedTarget,
          quality: result.quality,
        },
      });
    } catch (err) {
      updateFile(item.id, { status: 'error', error: err instanceof Error ? err.message : 'Conversion failed' });
    }
  };

  const convertAll = async () => {
    setBusy(true);
    announce('Converting…');
    const targets = files.filter((f) => f.status === 'ready' || f.status === 'done' || f.status === 'error');
    for (const item of targets) {
      // Re-read the latest version of the item (state may have changed between renders).
      const current = files.find((f) => f.id === item.id) ?? item;
      // eslint-disable-next-line no-await-in-loop
      await convertOne(current);
    }
    setBusy(false);
    announce('Done converting.');
  };

  const downloadZip = async () => {
    const done = files.filter((f) => f.result);
    if (!done.length) return;
    setBusy(true);
    announce('Building ZIP…');
    try {
      const names = dedupeNames(done.map((f) => f.result!.name));
      const zipBlob = await buildZip(done.map((f, i) => ({ name: names[i], blob: f.result!.blob })));
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pixlite-export.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      announce('ZIP ready.');
    } finally {
      setBusy(false);
    }
  };

  const readyCount = files.filter((f) => f.status === 'ready' || f.status === 'done').length;
  const doneCount = files.filter((f) => f.status === 'done').length;
  // Sum both sides over only the files that were actually converted — including a file that
  // was added but never converted (or failed to decode) in `totalOriginal` while its size
  // never lands in `totalResult` overstates the reported savings.
  const totalOriginal = files.reduce((s, f) => s + (f.result ? f.originalSize : 0), 0);
  const totalResult = files.reduce((s, f) => s + (f.result?.blob.size ?? 0), 0);
  const savings = doneCount ? summarizeSavings(totalOriginal, totalResult || totalOriginal) : null;

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareText = savings ? savings.label + ' with Pixlite — nothing uploaded.' : `${site.name}: ${site.tagline}`;

  const anyGps = files.some((f) => f.meta?.hasGps);

  return (
    <div class="wb">
      <label
        class="wb-drop"
        data-active={dragActive}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        <svg class="wb-drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
          <path d="M12 16V4m0 0 4 4m-4-4-4 4" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="wb-drop-title">{merged.dropTitle ?? 'Drop images here, click to browse, or paste (Ctrl/Cmd+V)'}</span>
        <span class="wb-drop-hint">
          {merged.acceptHint ?? 'JPG, PNG, WebP, GIF, BMP, AVIF, HEIC/HEIF'} · up to {MAX_FILES} files · nothing leaves this
          device
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.heic,.heif,.avif"
          aria-label="Add image files"
          onChange={(e) => {
            const target = e.currentTarget;
            if (target.files?.length) addFiles(target.files);
            target.value = '';
          }}
        />
      </label>

      <div class="wb-settings" aria-label="Conversion settings">
        <div class="wb-field">
          <label for="wb-format">Output format</label>
          <select id="wb-format" value={format} disabled={merged.lockFormat} onChange={(e) => setFormat(e.currentTarget.value as never)}>
            <option value="auto">Keep / auto</option>
            <option value="jpeg">JPG</option>
            <option value="png">PNG</option>
            <option value="webp">WebP</option>
          </select>
          <p class="wb-note">
            {targetKB
              ? '"Auto" re-compresses JPG/WebP in place and converts everything else (HEIC, AVIF, GIF, BMP) to JPG, so your KB target applies.'
              : '"Auto" re-compresses JPG/WebP in place and converts everything else (HEIC, AVIF, GIF, BMP) to PNG.'}
          </p>
        </div>

        <div class="wb-field">
          <label for="wb-quality">Quality {format !== 'png' && <span class="wb-range-value num">{quality}</span>}</label>
          <input
            id="wb-quality"
            type="range"
            min={1}
            max={100}
            value={quality}
            disabled={format === 'png'}
            onInput={(e) => setQuality(Number(e.currentTarget.value))}
          />
          <p class="wb-note">{format === 'png' ? 'PNG is lossless — quality does not apply.' : 'Higher = larger, sharper file.'}</p>
        </div>

        <div class="wb-field">
          <label for="wb-target">Target size (optional)</label>
          <div class="wb-row">
            <input
              id="wb-target"
              type="number"
              min={1}
              max={51200}
              placeholder="e.g. 200"
              disabled={merged.lockTargetKB || format === 'png'}
              value={targetKB}
              onInput={(e) => {
                const v = e.currentTarget.value;
                setTargetKB(v ? Math.max(1, Math.min(51200, Number(v))) : '');
              }}
            />
            <span class="wb-note">KB</span>
          </div>
          <p class="wb-note">
            {format === 'png' ? 'Not available for PNG (lossless) — switch to JPG/WebP to hit a KB target.' : 'Binary-searches quality, then scales down if needed.'}
          </p>
        </div>

        <div class="wb-field">
          <label for="wb-resize">Resize</label>
          <select id="wb-resize" value={resizeMode} disabled={merged.lockResize} onChange={(e) => setResizeMode(e.currentTarget.value as ResizeMode)}>
            <option value="none">Original size</option>
            <option value="max">Max width / height</option>
            <option value="percent">Scale by %</option>
            <option value="preset">Preset</option>
          </select>
          {resizeMode === 'max' && (
            <div class="wb-row" style="margin-top:6px">
              <input type="number" min={1} placeholder="Max width" aria-label="Max width in pixels" value={maxWidth} onInput={(e) => setMaxWidth(e.currentTarget.value ? Number(e.currentTarget.value) : '')} />
              <input type="number" min={1} placeholder="Max height" aria-label="Max height in pixels" value={maxHeight} onInput={(e) => setMaxHeight(e.currentTarget.value ? Number(e.currentTarget.value) : '')} />
            </div>
          )}
          {resizeMode === 'percent' && (
            <div class="wb-row" style="margin-top:6px">
              <input type="range" min={1} max={200} aria-label="Scale percentage" value={percent} onInput={(e) => setPercent(Number(e.currentTarget.value))} />
              <span class="wb-range-value num">{percent}%</span>
            </div>
          )}
          {resizeMode === 'preset' && (
            <select style="margin-top:6px" aria-label="Resize preset" value={preset} onChange={(e) => setPreset(e.currentTarget.value)}>
              {RESIZE_PRESETS.map((p) => (
                <option value={p.key} key={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div class="wb-field" style="align-self:end">
          <span class="wb-badge wb-badge--ok">Metadata stripped on export</span>
          <p class="wb-note">Re-encoding always drops EXIF/GPS/camera data — see the privacy proof page to verify.</p>
        </div>
      </div>

      <div class="wb-toolbar">
        <p class="wb-toolbar-stats num" role="status">
          {files.length} file{files.length === 1 ? '' : 's'} · {readyCount} ready · {doneCount} converted
        </p>
        <div class="wb-toolbar-actions">
          <button type="button" class="btn" disabled={!readyCount || busy} onClick={convertAll}>
            {busy ? 'Working…' : `Convert ${readyCount || ''} file${readyCount === 1 ? '' : 's'}`}
          </button>
          <button type="button" class="btn btn--secondary" disabled={!doneCount || busy} onClick={downloadZip}>
            Download ZIP
          </button>
          <button type="button" class="btn btn--secondary" disabled={!files.length || busy} onClick={clearAll}>
            Clear all
          </button>
        </div>
      </div>

      {files.length > 0 && (
        <ul class="wb-list">
          {files.map((f) => (
            <li class="wb-card" key={f.id}>
              <div class="wb-thumb">
                {f.result?.url && f.thumbUrl ? (
                  <button
                    type="button"
                    aria-label={f.showAfter ? 'Showing converted — click to show original' : 'Showing original — click to show converted'}
                    onClick={() => updateFile(f.id, { showAfter: !f.showAfter })}
                  >
                    <img src={f.showAfter ? f.result.url : f.thumbUrl} alt="" width="64" height="64" />
                  </button>
                ) : f.thumbUrl ? (
                  <img src={f.thumbUrl} alt="" width="64" height="64" />
                ) : (
                  <span class="skeleton" style="width:100%;height:100%" aria-hidden="true" />
                )}
              </div>
              <div class="wb-meta">
                <p class="wb-meta-name">{f.name}</p>
                <p class="wb-meta-line">
                  {f.detectedFormat && <span class="wb-badge">{f.detectedFormat.toUpperCase()}</span>}
                  <span class="num">{formatBytes(f.originalSize)}</span>
                  {f.width && (
                    <span class="num">
                      {f.width}×{f.height}
                    </span>
                  )}
                  {f.width && f.height && Math.max(f.width, f.height) > WARN_LONG_SIDE && <span class="wb-badge">large image</span>}
                  {f.status === 'decoding' && <span>reading…</span>}
                  {f.status === 'processing' && <span>converting…</span>}
                  {f.status === 'error' && <span class="wb-badge wb-badge--err">{f.error ?? 'error'}</span>}
                  {f.result && (
                    <>
                      <span aria-hidden="true">→</span>
                      <span class="num">
                        {formatBytes(f.result.blob.size)} ({f.result.width}×{f.result.height})
                      </span>
                      <span class="wb-badge wb-badge--ok">{summarizeSavings(f.originalSize, f.result.blob.size).label}</span>
                      {f.result.achievedTarget === false && <span class="wb-badge">best effort — could not fit target</span>}
                    </>
                  )}
                </p>
                {f.meta?.hasGps && f.meta.lat != null && f.meta.lon != null && (
                  <p class="wb-gps-note">
                    📍 This photo contains a location ({formatCoords(f.meta.lat, f.meta.lon)}) — it will be removed on export.{' '}
                    <a href={buildOsmLink(f.meta.lat, f.meta.lon)} target="_blank" rel="noopener noreferrer">
                      View on OpenStreetMap
                    </a>
                  </p>
                )}
                {f.status === 'processing' && (
                  <div class="wb-progress" aria-hidden="true">
                    <span style="width:60%" />
                  </div>
                )}
              </div>
              <div class="wb-actions">
                {f.result && (
                  <a class="btn btn--secondary" href={f.result.url} download={f.result.name}>
                    Download
                  </a>
                )}
                {f.status === 'error' && (
                  <button type="button" class="wb-icon-btn" title="Retry" onClick={() => ingestFile(f)} aria-label="Retry">
                    ↻
                  </button>
                )}
                <button type="button" class="wb-icon-btn" title="Remove" aria-label={`Remove ${f.name}`} onClick={() => removeFile(f.id)}>
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {savings && doneCount > 0 && (
        <div class="wb-summary">
          <p class="wb-summary-headline num">{savings.label}</p>
          <p class="muted small">
            {doneCount} file{doneCount === 1 ? '' : 's'} converted locally — {anyGps ? 'location data found and removed. ' : ''}nothing was
            uploaded to a server.
          </p>
          <div class="share">
            <span class="share__label">Share</span>
            <button type="button" class="share__btn" onClick={() => navigator.clipboard?.writeText(shareUrl).then(() => announce('Link copied'))}>
              Copy link
            </button>
            <a
              class="share__btn"
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(anyGps ? gpsRevealShareText(files.filter((f) => f.meta?.hasGps).length) : shareText)}&url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              X
            </a>
            <a class="share__btn" href={`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          </div>
        </div>
      )}

      <div ref={liveRef} role="status" aria-live="polite" class="visually-hidden">
        {notice}
      </div>
    </div>
  );
}
