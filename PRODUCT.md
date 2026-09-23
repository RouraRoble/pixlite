# Pixlite

Convert, compress and resize images — entirely in the browser, unlimited batches, nothing uploaded.

- **Live (once deployed):** `https://rouraroble.github.io/pixlite/`
- **Spec:** `mission/specs/pixlite.md`
- **Launched:** 2026-09-23

## What it is

Pixlite is a client-side image workbench. Drop in JPG, PNG, WebP, GIF, BMP, AVIF or HEIC/HEIF files
and it converts between formats, compresses to an exact KB target, resizes (max dimensions,
percentage, or presets like a 1080×1080 social square or passport photo size) and strips all EXIF
metadata (including GPS location) — all inside the browser tab, using the Canvas API and a Web
Worker. No file is ever sent to a server. 23 programmatic tool pages pre-configure the workbench for
one exact job each (e.g. `/heic-to-jpg/`, `/compress-image-to-200kb/`), plus 3 long-form guides and a
dedicated `/privacy-proof/` page that shows visitors exactly how to verify the "nothing uploaded"
claim themselves.

## Core architecture

- `src/lib/mime.ts` — magic-byte format sniffing (PNG/JPEG/GIF/BMP/WebP/AVIF/HEIC), independent of
  filename or the browser-reported MIME type.
- `src/lib/resize.ts` — pure fit/cover/percentage/preset resize maths (unit tested).
- `src/lib/target-size.ts` — the binary-search strategy for "compress to N KB", decoupled from any
  real encoder so it is deterministically unit-tested with a mock encoder.
- `src/lib/decode.ts` — decodes any input to an `ImageBitmap`. Normal formats use the browser's
  native `createImageBitmap()` (with `imageOrientation: 'from-image'` so EXIF rotation is baked into
  the pixels before metadata is stripped); HEIC/HEIF is decoded with `libheif-js` (WASM), imported
  lazily only when a HEIC file is actually added.
- `src/workers/encode.ts` + `src/lib/encode-client.ts` — resize + encode run in a Web Worker via
  `OffscreenCanvas` (falls back to a same-thread `<canvas>` for browsers without
  `Worker`+`OffscreenCanvas`). The worker runs the full "binary-search quality, then scale down if
  still over target" loop for a compress-to-KB job in one message round-trip.
- `src/lib/exif.ts` — reads EXIF/GPS locally with `exifr` to warn about a hidden location before
  export; `src/lib/gps.ts` builds the OpenStreetMap link and the (coordinate-free) share text.
- `src/lib/zip.ts` — batch ZIP export via `jszip`.
- `src/components/Workbench/Workbench.tsx` — the Preact island (`client:load`) that ties it together:
  drop zone / file picker / paste, per-file cards with thumbnail + before/after toggle, batch convert
  (sequential, so a large batch doesn't blow up memory), ZIP export, and a shareable result summary.
- `src/lib/tool-meta.ts` + `src/data/tools.json` — generates each programmatic tool page's title,
  description, H1, answer-first intro and workbench preset from a small per-format facts catalogue
  (`src/lib/formats.ts`), so every page carries real, format-specific data instead of templated
  boilerplate.

## URL-state sharing

Since the product's whole premise is "your files never leave your device", the shareable state is
the **workbench's settings** (output format, quality, resize mode, KB target), encoded as query
params (`?fmt=&q=&rz=&mw=&mh=&pct=&preset=&kb=`) and kept in sync via `history.replaceState`. A tool
page additionally locks/presets specific settings via component props. This lets someone bookmark or
send "compress to WebP at 60% quality, resized to 1920px wide" without ever transmitting an image.

## Data sources & licences

| Source | Used for | Licence |
| --- | --- | --- |
| MDN Web Docs — Image file type and format guide | Format facts tables (transparency, animation, browser support) | CC-BY-SA (facts summarised in our own words, not reproduced verbatim) |
| W3C PNG spec, Google WebP docs, HEIF format docs | Format facts cross-check | Public specs |
| `libheif-js` (wraps `libheif`) | HEIC/HEIF decoding | **LGPL-3.0** — used unmodified, loaded as its own lazy script chunk, not statically linked; see About page for the source link |
| `exifr` | Local EXIF/GPS reading | MIT |
| `jszip` | Client-side ZIP export | MIT |
| `satori` + `sharp` | Build-time OG image generation (never runs in the browser) | MIT / Apache-2.0 |

No third-party dataset of personal data is used or collected. No statistics or testimonials are
invented; the format-comparison numbers (`~25–35% smaller than JPG` for WebP, etc.) are stated as
typical ranges, not measured lab numbers, and the About page says so explicitly.

## Formulas

- **Resize (contain):** `scale = min(maxW/srcW, maxH/srcH)`, never upscales unless explicitly asked.
- **Resize (cover/preset):** centred crop to the target aspect ratio, then scaled to the exact preset
  pixel size.
- **Compress to target KB:** binary-search encoder quality in `[0.1, 0.95]` (max 8 iterations) until
  the output is within ~3% of the target; if the minimum quality still exceeds the target, scale the
  image down by ~18% and repeat (up to 4 extra rounds). The achieved size is always reported, even
  when the exact target could not be reached ("best effort").
- **Passport size:** `px = round(mm / 25.4 * dpi)` at 300dpi (35×45mm → 413×531px); US 2×2in →
  600×600px. Sizing only — no background/pose/biometric validation is attempted or claimed.

## Known limits (also stated on the About page)

- No AVIF **encoding** (browsers cannot encode AVIF from a canvas yet) — AVIF can be converted away
  from, not to.
- GIF input keeps only the first frame; no animated GIF/WebP output.
- PNG's "compress to target size" is unavailable (PNG is lossless — no quality dial); the UI disables
  the field and explains why.
- Passport-size tool resizes to standard pixel dimensions only — no background colour / head
  position / biometric compliance check.
- `image-to-pdf` from the spec was intentionally **not built** in this MVP pass (marked optional in
  the spec, "skip if time is short") — see Next improvements.

## Monetization hooks (not live)

- `<AdSlot>` placeholders below the workbench and on every tool page (render nothing until
  `PUBLIC_ADSENSE_CLIENT` is set).
- `site.config.ts` has an `affiliate` object (`enabled: false`, empty `items[]`) ready for
  cloud-storage or photo-printing affiliate links once a partner is chosen — intentionally left empty
  rather than inventing a fake partner.
- Future "Pro" ideas (not built): saved presets synced via `localStorage` export/import, a folder-watch
  mode using the File System Access API for repeat batch jobs.

## Mission housekeeping

- `src/components/MoreTools.astro` copied from `foundation/template` and rendered just above the
  footer on the home page, every tool page and every guide page.
- `public/cdaf6d28d35c143e38586b7eb7f2a727.txt` — IndexNow verification file (content matches
  `foundation/indexnow.key`).
