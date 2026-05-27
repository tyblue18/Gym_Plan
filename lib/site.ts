/**
 * Site-wide constants for the public static pages (about / privacy / terms).
 * Single source so links + dates stay consistent.
 */
export const SITE = {
  name:         'Que',
  /** Voluntary support link (Ko-fi). */
  kofiUrl:      'https://ko-fi.com/tanishq18',
  /** Contact for support, privacy questions, and data/deletion requests. */
  contactEmail: 'que.fitnees@gmail.com',
  /** Bump whenever the legal pages are materially changed. */
  legalUpdated: 'May 27, 2026',
} as const;
