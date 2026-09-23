/**
 * Product-level configuration. Every product edits this file.
 * Keep values honest: they end up in metadata, structured data and legal pages.
 */
export const site = {
  name: 'Pixlite',
  slug: 'pixlite',
  tagline: 'Convert, compress and resize images in your browser — nothing uploaded.',
  description:
    'Pixlite converts HEIC/WebP/AVIF/PNG/JPG, compresses to an exact KB target, resizes and strips hidden metadata — batches up to 200 images, entirely on your device.',
  locale: 'en',
  ogLocale: 'en_US',
  themeColor: '#0b0f0d',
  backgroundColor: '#0b0f0d',
  accent: '#baff29',
  author: { name: 'RouraRoble', url: 'https://github.com/RouraRoble' },
  contactEmail: 'roura.roble@gmail.com',
  launched: '2026-09-23',
  category: 'MultimediaApplication', // schema.org SoftwareApplication applicationCategory
  keywords: [
    'heic to jpg',
    'compress image online',
    'convert webp to png',
    'resize image',
    'remove exif metadata',
  ] as string[],
  social: { twitter: '' },
  // Monetization / analytics hooks (all optional, env-driven at build time)
  adsenseClient: import.meta.env.PUBLIC_ADSENSE_CLIENT || '',
  beaconUrl: import.meta.env.PUBLIC_BEACON_URL || '',
  plausibleDomain: import.meta.env.PUBLIC_PLAUSIBLE_DOMAIN || '',
  // Affiliate placeholders (config-driven; see PRODUCT.md for intended partners).
  affiliate: {
    enabled: false,
    items: [] as { label: string; url: string; blurb: string }[],
  },
  limits: {
    maxFiles: 200,
    maxLongestSidePx: 4000,
    maxFileSizeMB: 60,
  },
};
export type SiteConfig = typeof site;
