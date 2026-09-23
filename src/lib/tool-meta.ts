import { FORMATS, type FormatInfo } from './formats';
import { RESIZE_PRESETS } from './resize';
import { clampDescription } from './seo';
import { site } from '../site.config';

export interface ToolEntry {
  slug: string;
  mode: 'convert' | 'compress' | 'compress-target' | 'resize' | 'exif';
  from?: FormatInfo['key'] | null;
  to?: FormatInfo['key'] | null;
  targetKB?: number;
  resizePreset?: string | null;
  note?: string;
}

export interface ToolMeta {
  title: string;
  description: string;
  h1: string;
  intro: string;
  ogSubtitle: string;
  workbench: {
    initialFormat: 'auto' | 'jpeg' | 'png' | 'webp';
    lockFormat: boolean;
    initialResizeMode: 'none' | 'max' | 'percent' | 'preset';
    initialPreset: string | null;
    lockResize: boolean;
    initialTargetKB: number | null;
    lockTargetKB: boolean;
    acceptHint: string;
    dropTitle: string;
  };
}

const short = (key: FormatInfo['key']) => FORMATS[key].ext.toUpperCase();

export function getToolMeta(tool: ToolEntry): ToolMeta {
  const baseWorkbench = {
    initialFormat: 'auto' as const,
    lockFormat: false,
    initialResizeMode: 'none' as const,
    initialPreset: null as string | null,
    lockResize: false,
    initialTargetKB: null as number | null,
    lockTargetKB: false,
    acceptHint: 'JPG, PNG, WebP, GIF, BMP, AVIF, HEIC/HEIF',
    dropTitle: 'Drop images here, click to browse, or paste (Ctrl/Cmd+V)',
  };

  if (tool.mode === 'convert' && tool.from && tool.to) {
    const from = FORMATS[tool.from];
    const to = FORMATS[tool.to];
    const fromS = short(tool.from);
    const toS = short(tool.to);
    const title = `${fromS} to ${toS} Converter — Free, Private, No Upload | ${site.name}`;
    const h1 = `${fromS} to ${toS} Converter`;
    const description = clampDescription(
      `Convert ${from.name} to ${to.name} online for free. Runs entirely in your browser — no upload, batches of up to 200 images. Download instantly or as a ZIP.`,
      158,
    );
    const intro = `Drop a ${from.name} file below and Pixlite decodes it, re-encodes it as ${to.name} and hands you an instant download — nothing is sent to a server. ${to.browserSupport}${tool.note ? ' ' + tool.note : ''}`;
    return {
      title,
      description,
      h1,
      intro,
      ogSubtitle: `${from.name} → ${to.name}, 100% in-browser`,
      workbench: {
        ...baseWorkbench,
        initialFormat: to.key === 'jpeg' || to.key === 'png' || to.key === 'webp' ? to.key : 'auto',
        lockFormat: true,
        acceptHint: `${from.name} files`,
        dropTitle: `Drop ${from.name} files here, or click to browse`,
      },
    };
  }

  if (tool.mode === 'compress-target' && tool.targetKB) {
    const kb = tool.targetKB;
    const title = `Compress Image to ${kb}KB Online (No Upload)`;
    const h1 = `Compress an Image to ${kb} KB`;
    const description = clampDescription(
      `Compress any JPG, PNG or WebP photo to about ${kb}KB online, free and private. Pixlite binary-searches JPG quality, then resizes if needed, entirely in your browser.`,
      158,
    );
    const intro = `Set a target of ${kb}KB and Pixlite searches JPG quality until the output is at or under that size, scaling the image down automatically if quality alone cannot reach it — output is always JPG here, since PNG's lossless compression has no quality dial to search over. The size actually achieved is always shown, honestly — with a clear "best effort" note on the rare file where even that is not enough.`;
    return {
      title,
      description,
      h1,
      intro,
      ogSubtitle: `Target: ${kb} KB · quality auto-tuned`,
      // A page whose only job is "hit this exact KB target" must never let the format switch to
      // PNG (lossless — no target search applies), which used to silently disable the locked
      // target field while leaving the format selectable. Locking format keeps the target honoured.
      workbench: { ...baseWorkbench, initialFormat: 'jpeg', lockFormat: true, initialTargetKB: kb, lockTargetKB: true },
    };
  }

  if (tool.mode === 'compress') {
    const subject = tool.from ? FORMATS[tool.from].name : 'Image';
    const isPng = tool.from === 'png';
    const title = `Compress ${subject} Online — Free, Private (No Upload) | ${site.name}`;
    const h1 = `Compress ${subject} Online`;
    const description = clampDescription(
      isPng
        ? 'Reduce PNG file size online without uploading it. PNG is lossless, so Pixlite optimises by resizing and re-encoding — see why quality sliders do not apply to PNG.'
        : `Compress ${subject} files online — adjust quality or set an exact KB target. Runs entirely in your browser, batches of up to 200 images, nothing uploaded.`,
      158,
    );
    const intro = isPng
      ? 'PNG compression is lossless, so there is no quality slider to turn down — the pixels never change. To shrink a PNG meaningfully, resize its dimensions below, or convert it to WebP/JPG for photographic content where lossy compression is a much bigger win.'
      : `Drag the quality slider or set an exact KB target and Pixlite re-encodes your ${subject} file in the browser, showing the before/after size instantly. Nothing is uploaded at any point.`;
    return {
      title,
      description,
      h1,
      intro,
      ogSubtitle: isPng ? 'Lossless — resize to shrink' : 'Quality slider or exact KB target',
      workbench: {
        ...baseWorkbench,
        initialFormat: tool.from ?? 'auto',
        lockFormat: Boolean(tool.from),
      },
    };
  }

  if (tool.mode === 'resize') {
    if (tool.resizePreset === 'passport-mm') {
      const p = RESIZE_PRESETS.find((r) => r.key === 'passport-mm')!;
      const title = `Passport Photo Size Online — Resize Only, No Upload | ${site.name}`;
      const h1 = 'Resize a Photo to Passport Size';
      const description = clampDescription(
        `Resize a photo to the standard ${p.width}×${p.height}px passport-photo pixel size (35×45mm @300dpi) online, private, no upload. Sizing only — check your issuing office's other rules.`,
        158,
      );
      const intro = `This tool resizes your photo to ${p.width}×${p.height}px — the pixel dimensions of a standard 35×45mm passport photo at 300dpi. It only changes the size and crops to that aspect ratio; it does not check background colour, head position, lighting or any other biometric requirement, so confirm those separately with your passport office or photo service before submitting.`;
      return {
        title,
        description,
        h1,
        intro,
        ogSubtitle: `${p.width}×${p.height}px · 35×45mm @300dpi`,
        workbench: { ...baseWorkbench, initialResizeMode: 'preset', initialPreset: 'passport-mm', lockResize: true },
      };
    }
    if (tool.resizePreset === '1080x1080') {
      const p = RESIZE_PRESETS.find((r) => r.key === '1080x1080')!;
      const title = `Resize Image to 1080×1080 Online (No Upload) | ${site.name}`;
      const h1 = 'Resize an Image to 1080×1080';
      const description = clampDescription(
        `Resize any photo to a 1080×1080px square for Instagram or LinkedIn, free and private. Pixlite crops and scales in your browser — nothing is uploaded.`,
        158,
      );
      const intro = `Pixlite centre-crops your photo to a square and scales it to exactly ${p.width}×${p.height}px — the size most social platforms use for a square post. The crop and resize happen locally; nothing leaves your device.`;
      return {
        title,
        description,
        h1,
        intro,
        ogSubtitle: '1080 × 1080px · social square crop',
        workbench: { ...baseWorkbench, initialResizeMode: 'preset', initialPreset: '1080x1080', lockResize: true },
      };
    }
    const title = `Resize Image Online — Free, Private (No Upload) | ${site.name}`;
    const h1 = 'Resize an Image Online';
    const description = clampDescription(
      'Resize a photo by exact pixels, percentage, or a ready-made preset (social square, OG image, passport size) — free, private, nothing uploaded.',
      158,
    );
    const intro = 'Choose a max width/height, a percentage, or a preset below, and Pixlite scales your image locally in the browser — no upload, no waiting on a server queue.';
    return {
      title,
      description,
      h1,
      intro,
      ogSubtitle: 'Pixels, percentage or a ready preset',
      workbench: { ...baseWorkbench, initialResizeMode: 'max' },
    };
  }

  // mode === 'exif'
  const title = `Remove EXIF & GPS Metadata from Photos Online | ${site.name}`;
  const h1 = 'Remove EXIF & GPS Metadata from a Photo';
  const description = clampDescription(
    'Strip EXIF metadata — including hidden GPS location, camera model and timestamp — from a photo online. Runs in your browser; nothing is uploaded.',
    158,
  );
  const intro = 'Add a photo below: Pixlite reads its EXIF data locally to show you what is embedded (including a GPS location, if present) and then re-encodes the file, which drops all of that metadata automatically. The cleaned file never leaves your device at any point.';
  return {
    title,
    description,
    h1,
    intro,
    ogSubtitle: 'Strips GPS, camera model & timestamp',
    workbench: { ...baseWorkbench, initialFormat: 'auto' },
  };
}
