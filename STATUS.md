# STATUS — Pixlite

## Summary

The product folder was resumed from a bare template scaffold (site.config, tokens, standard pages
present but all still placeholder text; no lib/, components/Workbench, data, or tests existed yet).
Built out to a complete, tested MVP in this session: the full client-side image workbench (convert,
compress-to-KB, resize, EXIF/GPS strip), 23 programmatic tool pages, 3 guides, a privacy-proof page,
distinct dark-lab visual identity, and the full test suite.

## What's done

- **Core workbench** (`src/components/Workbench/Workbench.tsx`, Preact island, `client:load`):
  drag-and-drop / click-to-browse / paste (Ctrl/Cmd+V), per-file cards (thumbnail, detected format,
  dimensions, before/after size, before/after thumbnail toggle), batch convert (sequential, capped at
  200 files), ZIP export, GPS-reveal warning with an OpenStreetMap link, shareable result summary with
  copy-link/X/WhatsApp buttons, and settings encoded in the URL query string so a link reproduces
  someone's exact configuration.
- **Decode/encode pipeline:** `createImageBitmap` (with EXIF-orientation correction) for
  JPG/PNG/WebP/GIF/BMP/AVIF; HEIC/HEIF via a lazily-loaded `libheif-js` WASM chunk. Encoding runs in a
  Web Worker over `OffscreenCanvas` with a same-thread `<canvas>` fallback. Compress-to-KB uses a
  binary-search-then-downscale strategy, implemented as a pure, unit-tested function
  (`src/lib/target-size.ts`) decoupled from the real encoder.
- **Pure, tested libraries:** `mime.ts` (magic-byte sniffing), `resize.ts` (fit/cover/percent/preset
  maths, passport mm→px conversion), `target-size.ts`, `filename.ts`, `format-bytes.ts`, `gps.ts` — 51
  unit tests, all passing.
- **23 programmatic tool pages** (`src/pages/[tool].astro` + `src/data/tools.json` +
  `src/lib/tool-meta.ts`): every format conversion pair, compress (generic/JPEG/PNG/target-KB ×4),
  resize (generic/1080×1080/passport), remove-exif. Each has an exact-match H1, answer-first intro, a
  real per-page format-facts table, FAQ (with FAQPage schema), related-tools links, and a locked/preset
  workbench configuration.
- **3 guides** with Article/HowTo + FAQ schema: why Windows can't open HEIC, JPG vs PNG vs WebP
  (comparison table), how to reduce an image's size for upload.
- **`/privacy-proof/`** page with three concrete, self-serve verification methods (DevTools Network
  tab, airplane mode, read-the-source).
- **Identity:** dark "photo lab" theme committed as the default (not a media-query fallback) —
  near-black background, electric-lime accent, Space Grotesk (display) + Inter (body) + JetBrains Mono
  (numbers), a custom favicon mark. No purple-gradient/three-card template look.
- **Standard pages:** about (methodology, libraries + licences table, format-facts sources, known
  limits, monetization plan, last-updated date), contact, privacy (image/EXIF-specific), terms, 404,
  robots.txt, sitemap, manifest, default + per-page OG images (satori).
- **Mission housekeeping:** `MoreTools.astro` copied from the foundation template and rendered above
  the footer on the home page and every tool/guide page; `public/cdaf6d28d35c143e38586b7eb7f2a727.txt`
  (IndexNow key) added.
- **CSP:** `'wasm-unsafe-eval'` added for the libheif WASM module, `blob:`/`worker-src` added for the
  object-URL downloads and the encode worker; no inline event handlers, no external scripts.

## Test results (this session, final run)

```
npm test
 Test Files  7 passed (7)
      Tests  51 passed (51)

MSYS_NO_PATHCONV=1 SITE=https://rouraroble.github.io BASE=/pixlite npm run build
[build] 33 page(s) built in ~2.5s
[seo] audited 33 pages · 0 errors · 0 warnings

MSYS_NO_PATHCONV=1 BASE=/pixlite npm run test:e2e
  77 passed (10.7s)

npm run build   (plain, root base)
[build] 33 page(s) built in ~2.4s
[seo] audited 33 pages · 0 errors · 0 warnings
```

Home-page JS is ~50KB uncompressed (Workbench island + Preact runtime) — the heavy dependencies
(libheif WASM ~1.9MB, jszip ~96KB, exifr ~75KB) are dynamically imported only when actually needed
(a HEIC file added / ZIP export clicked / metadata read) and are not in the home page's script tags.

## Known issues

- `image-to-pdf` from the spec was intentionally not built (spec marks it optional, "skip if time is
  short"); not in `tools.json`.
- No automated test exercises real HEIC or AVIF decoding end-to-end (Playwright's fixture is a PNG,
  per the spec's own E2E guidance) — the HEIC path is covered by manual browser verification and code
  review, not by an automated HEIC fixture. A real `.heic` fixture with a known-good decode would be a
  stronger regression guard.
- The before/after "compare" is a click-to-toggle on the file card's thumbnail, not a drag slider —
  the spec explicitly allows either ("slider or toggle"); a slider would read as more polished.
- PNG's target-size field is disabled with an explanation rather than attempting a lossless
  approximation (e.g. palette reduction) — honest, but means PNG has no automatic size-hitting path.
- Format-comparison numeric ranges (e.g. "WebP ~25–35% smaller than JPG") are stated as typical
  ranges sourced from MDN/format docs, not measured against Pixlite's own encoder on a benchmark set —
  the guide page says this explicitly to avoid overclaiming precision.
- `astro check` (TypeScript project check) was not run to completion this session (it prompted to
  install `@astrojs/check`, which is interactive/non-essential); `npm run build` — which is what
  actually ships — type-checks nothing extra beyond what Vite/esbuild already validates and passed
  cleanly.

## Fixes after audit 1

Audit: `mission/audits/pixlite-audit-1.md` (verdict BLOCKED, P0=2, P1=3, P2=7, P3=5). Every finding was
reproduced before fixing.

### Fixed

- **[P0] 1. Compress-to-KB shipped an oversized file reported as a success.**
  `src/workers/encode.ts` kept `lastBlob` (the final iteration's blob) instead of the blob for the
  *chosen* quality, and the tolerance let a result over the target still count as "achieved". Fixed by:
  making `src/lib/target-size.ts#searchQualityForTarget` generic — `encodeAt` now returns
  `{ size, data }` and the function hands back `data` for the chosen result, so a caller can never
  accidentally ship "whatever was encoded last" (`src/workers/encode.ts`, `src/lib/encode-client.ts`
  both updated); treating the target as a hard maximum (`achieved = chosen.size <= targetBytes`, no
  tolerance-widened success); and fixing the worker's cross-round selection, which had a second,
  closely related bug caught by the new e2e test below: it compared every round (including one that
  actually hit the target) by *absolute* byte distance from the target, so an earlier over-target round
  with a small distance could beat a later round that genuinely achieved the target. An achieving round
  now wins unconditionally. Dimensions are now tracked per-round (`bestPlan`) so the reported WxH always
  matches the shipped blob.
  Tests: `tests/unit/target-size.test.ts` (hard-max regression + data-linked-to-chosen-result
  contract), `tests/e2e/workbench.spec.ts` ("compress-image-to-200kb never ships a file over the
  target" — this is what caught the second cross-round bug after the first fix).
- **[P0] 2. 223 internal links dropped the `/pixlite` base path (404 in production).** Every hard-coded
  `href="/..."` across `index.astro`, `[tool].astro`, `faq-snippets.ts`, the 3 guide pages,
  `privacy.astro` and `privacy-proof.astro` now goes through `withBase()`. `scripts/seo-audit.mjs`
  already had base-path link validation (it now correctly fails the build on any base-less internal
  href); it was the actual site code that hadn't been wired through `withBase()` yet.
  Tests: `tests/e2e/workbench.spec.ts` ("base-path link integrity" — home tool-grid link and a tool
  page's related-tools link both fetched and asserted non-404 under `BASE=/pixlite`); both build
  commands now fail on any regression here (SEO audit is strict).
- **[P1] 3. Transparent PNG/WebP/GIF → JPG got a black background.** `drawCanvas` (both
  `src/workers/encode.ts` and the main-thread fallback in `src/lib/encode-client.ts`) now fills the
  canvas white before drawing when the output format is JPEG.
  Test: `tests/e2e/workbench.spec.ts` ("converting a transparent PNG to JPG flattens onto white, not
  black" — decodes the downloaded blob and reads the pixel value).
- **[P1] 4. KB target silently ignored when "Auto" resolved to PNG.** `Workbench.tsx#convertOne` now
  resolves to JPEG when the user set a KB target with format "Auto" and the detected input would
  otherwise resolve to PNG (HEIC/AVIF/GIF/BMP inputs) — the target now actually applies instead of
  being a silent no-op. An explicit PNG selection still disables the target field as before.
- **[P1] 5. The "1920px wide" preset stretched smaller images.** `src/lib/resize.ts#planResize` now
  computes both dimensions from the same `fitContain` call for a width-only preset, so a source
  narrower than the preset is scaled down/kept as-is, never stretched.
  Tests: `tests/unit/resize.test.ts` (regression case, 800×600 source against the 1920w preset),
  `tests/e2e/workbench.spec.ts` ("the 1920px-wide preset never upscales a smaller source").
- **[P2] 6. Share/result card overstated savings.** `totalOriginal` in `Workbench.tsx` now sums only
  files that were actually converted (matching `totalResult`), instead of every added file.
- **[P2] 9. "Unlimited batches" was false.** Replaced with "batches of up to 200 images" in
  `site.config.ts`, `index.astro` and `lib/tool-meta.ts` (which also dropped "no file-size limit games",
  false given the 60MB per-file cap).
- **[P2] 10. Factual error in the HEIC guide.** `guide/why-windows-cant-open-heic.astro` no longer says
  Microsoft sells HEIF Image Extensions (it's free); it now correctly names the separate, paid HEVC
  Video Extensions that HEIC photos also need, with links to both Store listings.
- **[P2] 12. Shared-link parameters were not validated.** `Workbench.tsx#readQueryDefaults` now clamps
  `q` to 1–100, `pct` to 1–200, `mw`/`mh` to 1–20000, `kb` to 1–51200, drops non-finite values, whitelists
  `preset` against `RESIZE_PRESETS`, and skips `fmt`/`rz`/`mw`/`mh`/`pct`/`preset`/`kb` entirely on a page
  that locks that setting (so `?fmt=png` can no longer override a locked tool page).
  Test: `tests/e2e/workbench.spec.ts` ("a shared settings link with out-of-range values is clamped").
- **[P3] 13. "Large image" warning checked width only.** `Workbench.tsx` now uses
  `Math.max(width, height)`, matching the About page's "longest side" claim.
- **[P3] 15 (partial). Privacy policy inaccuracy.** Removed the leftover "preferences and history may be
  stored in local storage" line (the product uses no localStorage) and replaced it with an accurate
  description of the URL-encoded settings.
- **[P3] 16 (partial). Header had no navigation; 404 canonical pointed at `/404/`.** `Base.astro` now
  passes About/Guides/Privacy-proof links to `SiteHeader`. `404.astro` now sets an explicit canonical to
  the site root instead of implying `/404/` is a real indexable page.

### Remaining (not fixed this pass — reasons below)

- **[P2] 7. Decoded ImageBitmaps kept for every file (memory blow-up risk).** Not addressed: fixing this
  properly means decoding lazily inside `convertOne` and closing bitmaps right after encoding (or
  transferring them to the worker), which touches the core file-lifecycle state in `Workbench.tsx` and
  needs careful testing against the retry/re-convert flows — judged too risky to do without a dedicated
  pass within this session's time budget.
- **[P2] 8. Near-duplicate programmatic pages / identical FAQ on all 23 tool pages.** Not addressed —
  this is a content-authoring task (portal-specific KB tables, per-pair FAQs for 23 pages), not a code
  fix, and was out of scope for the time available.
- **[P2] 11. Ads would render empty slots if enabled.** Not addressed — `PUBLIC_ADSENSE_CLIENT` is unset
  in this environment so the slot is currently inert; wiring `adsbygoogle.js` and the CSP `frame-src`
  correctly needs a real AdSense client to test against, which isn't available.
- **[P3] 14. Spec gaps** (camera/date EXIF fields not shown, small before/after toggle, no
  `image-to-pdf`), and the rest of **15** (analytics processor naming, OSM link note, terms boilerplate,
  LGPL licence text for libheif-js) and **16** (tool-grid link casing, capitalisation inconsistencies,
  `ul.wb-list` indent, Auto-mode AVIF/HEIC→PNG size blowup) and **17** (accessibility nits) — not
  addressed. These are real but lower-value polish items; fixing all of them was not achievable within
  the ~90 minute budget alongside every P0/P1 and the P2s above, so effort went to correctness bugs
  first as instructed.

### Verification (this pass, final run)

```
npm test
 Test Files  7 passed (7)
      Tests  54 passed (54)

MSYS_NO_PATHCONV=1 SITE=https://rouraroble.github.io BASE=/pixlite npm run build
[build] 33 page(s) built in ~2.3s
[seo] audited 33 pages · 0 errors · 0 warnings

MSYS_NO_PATHCONV=1 BASE=/pixlite npm run test:e2e
  107 passed (~15s)

npm run build   (plain, root base)
[build] 33 page(s) built in ~2.9s
[seo] audited 33 pages · 0 errors · 0 warnings
```

## Next 5 improvements, ranked by impact

1. **Real HEIC/AVIF E2E fixtures.** Add a small CC0/self-produced `.heic` and `.avif` fixture and a
   Playwright test that exercises the libheif decode path and the AVIF-unsupported-browser error
   message, closing the biggest gap between "unit tested" and "actually verified in a real browser."
2. **Drag-slider before/after compare.** Replace the click-to-toggle with a draggable divider
   (clip-path over two stacked images) for a more tactile, shareable comparison — likely to increase
   social sharing of the result card.
3. **`image-to-pdf` tool page.** Add `pdf-lib` (MIT) and a `/image-to-pdf/` page for the "combine
   photos into one PDF" long-tail query the spec flagged as optional.
4. **Affiliate partner + AdSense wiring.** `site.config.ts` has the `affiliate` object and `<AdSlot>`
   placeholders ready; once a real cloud-storage/photo-printing partner and an AdSense client ID exist,
   wiring them in is a config change, not a code change.
5. **Offline service worker.** The privacy-proof page currently says "no network requests during
   processing" rather than "fully offline after first load" — adding a minimal precache service worker
   (mentioned as optional in the spec) would let the airplane-mode claim extend to a first-visit-then-
   close-tab-then-reopen scenario, not just a single session.

## Polish pass (2026-09-23, post audit-2)

Source: `mission/audits/pixlite-audit-2.md` (verdict ACCEPTABLE, P2/P3 only), `mission/metrics/pixlite-lh.json`,
`mission/logs/orchestrator-spotchecks.md`, `mission/POST_MVP_PLAN.md` ("Template changes to port" + "AEO scan").

### 1. Open P2/P3 items from audit-2

- **[P2] N1 fixed — KB-target pages no longer let the format bypass the target.** The four
  `compress-image-to-*kb` tool pages now set `lockFormat: true` (was only `lockTargetKB: true`), so
  `?fmt=png` (or picking PNG in the UI) can no longer silently disable the locked KB target while
  leaving the field visually "200" — the format select is now disabled and stays JPG. Tool-page copy
  updated to say "JPG" instead of "JPG/WebP" since WebP is no longer reachable on these pages. Verified
  live: `/compress-image-to-200kb/?fmt=png` now has `#wb-format` disabled at `jpeg` and `#wb-target`
  disabled at `200`.
- **[P2] #7 softened — the "won't exhaust/run out of memory" FAQ claim.** `BATCH_FAQ` (used on every
  tool page) and the home page's own batch-limit FAQ answer now say a large batch "does not freeze the
  tab" but *will* use more memory the more files are added, with a "keep batches to a few dozen on an
  older phone" caveat — honest given ImageBitmaps are still retained per file (finding 7's underlying
  code issue remains open; only the false claim about it is fixed, consistent with the audit's own
  suggested fix).
- **[P2] #11 addressed at the infrastructure level — AdSlot loader.** See "Template changes ported"
  below; the ad script/CSP wiring now exists and is exercised on any build with
  `PUBLIC_ADSENSE_CLIENT` set, it's just inert (no `<script>`, no extra CSP origins) in this environment
  because no real client ID exists to test against — unchanged limitation, now closer to done.
- **[P3] N2 fixed — header nav no longer wraps above the viewport at 320px.** Ported the template's
  `SiteHeader.astro` fix: `.nav` is `flex-wrap: nowrap` with horizontal scroll (`overflow-x: auto`,
  hidden scrollbar, edge fade via `mask-image`) instead of wrapping. Verified live at a 320×800 viewport
  — all three links now sit on one row inside the header, no clipped/pushed-up text.
- **[P3] N3 fixed — corrupted shared-link values are now dropped, not clamped to the worst case.**
  `readIntParam` in `Workbench.tsx` now treats a value below the parameter's minimum (`kb<=0`, `q<=0`,
  `pct<=0`, etc.) as invalid and ignores it (falls back to the page's own default) instead of clamping
  it *up* to the minimum — `?kb=-5&q=-50` used to silently produce a 1KB/quality-1 "worst possible"
  result; it now just falls back to that page's normal defaults. Values above the maximum are still
  clamped down, per the audit's own suggested fix. The existing e2e regression test still passes (it
  only asserted the in-range outcome, which still holds).
- **[P3] N4 fixed — stale "Auto" help text and a stale code comment.** The Auto-format note under
  "Output format" now reads correctly depending on whether a KB target is set (…"to JPG, so your KB
  target applies" vs …"to PNG"). The outdated `encodeImage` catch-block comment in `encode-client.ts`
  (which said the bitmap "was transferred/closed already" — it isn't; it's structured-cloned, per the
  comment right above it) is corrected.
- **[P3] #15 partially fixed.** Privacy policy now names the two possible cookieless analytics services
  (Plausible, or the self-hosted beacon) instead of "if analytics are enabled" with no name attached, and
  adds a line about the GPS-warning's OpenStreetMap link being third-party/non-tracking and opt-in
  (click-only). About page's licence table now links to the LGPL-3.0 licence text itself
  (`gnu.org/licenses/lgpl-3.0.txt`), not just libheif-js's source repo. `terms.astro` boilerplate and the
  rest of #15/#16/#17 (accessibility nits, Auto-mode AVIF/HEIC→PNG size blowup with no KB target) remain
  open — judged lower value than the correctness/AEO/template work below within the time available.
- **[P3] #16 partially fixed.** Related-tools links (tool pages) and the home page's "Every tool" grid
  used to render the raw slug (`heic to jpg`, all-lowercase, no real capitalisation via CSS
  `text-transform: capitalize` which mis-capitalised "to"/"an" as "To"/"An"). Both now render each tool's
  real `h1` from `getToolMeta()` ("HEIC to JPG Converter", "Resize an Image to 1080×1080"), and the
  now-unnecessary/incorrect `text-transform: capitalize` rule was removed. Did not find a live "WEBP" vs
  "WebP" casing bug (the one `WEBP` string in the source is the correct literal RIFF/WebP magic-byte
  check in `mime.ts`) — likely already fine or fixed in an earlier pass; `wb-list` indent and the
  Auto-mode AVIF/HEIC→PNG size blowup were not touched (no concrete bug found for the former; the latter
  is a real but larger change, left for a dedicated pass as STATUS already noted).

### 2. Lighthouse failures

Checked `mission/metrics/pixlite-lh.json`: pixlite is already **100/100/100/100** (performance /
accessibility / best-practices / SEO), matching the orchestrator spot-check line. CLS is 0.001
(essentially zero — no island-height reservation needed), LCP 1.2s, no contrast or heading-order
failures. The only non-zero "audits" are informational `metricSavings` insights (unused CSS, cache
lifetimes, render-blocking) that don't affect the score. No Lighthouse-driven changes were needed for
this product; effort went to the AEO/template/audit items instead.

### 3. AEO freshness and structure on every programmatic/tool page

- **Visible "Last updated" line:** added to all 23 tool pages (`[tool].astro`), the home page, and
  `/privacy-proof/` — combined with the pages that already had it (about, 3→4 guides, privacy, terms),
  every non-legal-boilerplate page on the site now shows a dated freshness line near the top. (34 pages
  built total now, up from 33 — see the new guide below.)
- **datePublished/dateModified in JSON-LD:** `webAppLd()` in `lib/seo.ts` now accepts optional
  `datePublished`/`dateModified` and emits them when given; every tool page and the home page now pass
  `site.launched` for both.
- **Dataset schema:** not added. Pixlite has no country/ingredient-style "data hub" list pages the way
  holiday-atlas/worththen/gramcup do (per POST_MVP_PLAN's own examples) — its format-facts tables are
  small, single-page reference tables attached to WebApplication pages, not standalone datasets, so
  Dataset schema would not be a genuine fit. Judgement call; flagging here rather than silently skipping.
- **HowTo schema on step guides:** `how-to-reduce-image-size-for-upload` already had it.
  `why-windows-cant-open-heic` (which has three numbered fix methods) now also emits HowTo alongside its
  existing Article schema (`jsonLd` takes an array of both).

### 4. Template changes ported (from `foundation/template`, keeping pixlite's own CSP extras)

- **`astro.config.mjs`:** added the template's conditional-CSP pattern — `ADSENSE`/`PLAUSIBLE` env
  flags compute `extraScript`/`extraFrame` origin lists, added to `scriptDirective` and a new
  `frame-src` directive (was previously absent, which the default-src fallback covered less precisely).
  Pixlite's own requirements (`'wasm-unsafe-eval'` for libheif, `blob:` on `img-src`/`connect-src`,
  `worker-src 'self' blob:` for the encode worker) are kept unconditionally, unlike the generic template.
- **`src/layouts/Base.astro`:** added the AdSense loader `<script>` (only emitted when
  `site.adsenseClient` is set).
- **`src/components/AdSlot.astro`:** added the `adsbygoogle.push({})` script that requests an ad for
  each rendered slot (only emitted when a slot is actually enabled).
- **`src/components/SiteHeader.astro`:** ported the non-wrapping, horizontally-scrollable nav (fixes
  N2 above).
- Robots/sitemap `<link rel="sitemap">` was already present; no change needed there.

### 5. SEO depth with genuine value

- Added one new guide, **`/guide/image-size-cheat-sheet/`** — "Image Size Cheat Sheet: Social, Email &
  Print": a sourced table of exact pixel targets (Instagram/LinkedIn square, Story/Reel cover, OG
  link-preview, email attachment, generic web-form, EU/UK and US passport, 4×6in print), each row
  linking straight to the matching tool with its settings pre-filled via the existing URL-state feature
  (e.g. `/resize-image/?rz=max&mw=1200&mh=1800` for the 4×6in print row) — a genuinely different,
  answer-first page (not a rehash of the 3 existing guides), with Article schema + FAQ schema + a
  "Last updated" line. The passport/print figures are computed from the same `mmToPx`/`inToPx` helpers
  the workbench itself uses, so the table can't silently drift out of sync with the tools it links to.
  Added to `tests/routes.json` (smoke + axe + viewport coverage) and `src/data/guides.json` (auto-picked
  up by the OG-image route).
- Related-tools links and the home tool grid already existed; both now show proper titles instead of
  raw lowercased slugs (see #16 above), which also makes them read better as internal-link anchor text
  for SEO.
- Did not add a second/third new guide or rewrite the 23 tool pages' FAQ content (audit finding #8,
  near-duplicate FAQ) — judged lower expected value than the correctness fixes and template porting
  given the time available; flagged again for the next pass.

### 6. Share/retention polish

Not touched this pass. The existing share block (copy link, X, WhatsApp, Reddit, Email — via
`Share.astro`) and the workbench's own share-on-completion card already cover the "why would someone
share this" requirement from the brief; adding localStorage-based retention (e.g. "recently used tool")
would contradict the privacy policy's current "Pixlite does not store any preferences or history in
local storage" claim without also rewriting that page, and was judged not worth the trade-off for a
~2 hour polish pass. Left for a dedicated pass if retention becomes a priority.

### Verification (this pass, final run)

```
npm test
 Test Files  7 passed (7)
      Tests  54 passed (54)

MSYS_NO_PATHCONV=1 SITE=https://rouraroble.github.io BASE=/pixlite npm run build
[build] 34 page(s) built in ~2.5s
[seo] audited 34 pages · 0 errors · 0 warnings

MSYS_NO_PATHCONV=1 BASE=/pixlite npm run test:e2e
  111 passed (~17s)

npm run build   (plain, root base)
[build] 34 page(s) built in ~2.5s
[seo] audited 34 pages · 0 errors · 0 warnings
```

Files touched: `src/lib/tool-meta.ts`, `src/data/faq-snippets.ts`, `src/components/Workbench/Workbench.tsx`,
`src/lib/encode-client.ts`, `astro.config.mjs`, `src/layouts/Base.astro`, `src/components/AdSlot.astro`,
`src/components/SiteHeader.astro`, `src/lib/seo.ts`, `src/pages/[tool].astro`, `src/pages/index.astro`,
`src/pages/privacy-proof.astro`, `src/pages/privacy.astro`, `src/pages/about.astro`,
`src/pages/guide/why-windows-cant-open-heic.astro`, `src/data/guides.json`,
`src/pages/guide/image-size-cheat-sheet.astro` (new), `tests/routes.json`. No files outside
`products/pixlite/` were touched, and no git commands were run.
