/**
 * lib/dataExport.ts — User data export
 *
 * Builds a single JSON document containing everything stored locally for the
 * current user: full workout/calorie/metrics log, profile, and every settings
 * key in SETTINGS_KEYS. Triggers a browser download.
 *
 * Purpose: data ownership / portability. The app is offline-first and almost
 * everything lives in localStorage, so this is a complete snapshot — no server
 * round-trip required.
 */

import {
  DB_KEY, PROFILE_KEY,
  ATHLETE_PLAN_KEY, WORKOUT_PRESETS_KEY, TEMPLATES_KEY, EXERCISE_USAGE_KEY,
  LAST_STREAK_KEY, LIFT_PRS_KEY, MILLION_GROUPS_KEY, MACRO_GOALS_KEY,
  COIN_KEY, PROFILE_PHOTO_KEY,
} from '@/lib/constants';

/** Keys that should be included in the export. Must stay in sync with
 *  SETTINGS_KEYS in lib/syncEngine.ts plus DB_KEY and PROFILE_KEY. */
const EXPORT_KEYS = [
  DB_KEY,
  PROFILE_KEY,
  ATHLETE_PLAN_KEY,
  WORKOUT_PRESETS_KEY,
  TEMPLATES_KEY,
  EXERCISE_USAGE_KEY,
  LAST_STREAK_KEY,
  LIFT_PRS_KEY,
  MILLION_GROUPS_KEY,
  MACRO_GOALS_KEY,
  COIN_KEY,
  PROFILE_PHOTO_KEY,
] as const;

export interface ExportedData {
  /** ISO timestamp at export time */
  exportedAt: string;
  /** Schema version. Bump when the export shape changes so future importers
   *  can branch on it. */
  schemaVersion: 1;
  /** App version, currently hardcoded — replace with build env var if added. */
  appVersion: string;
  /** Every collected localStorage key. Values are JSON-parsed when possible
   *  so the output is human-readable; strings that aren't valid JSON are kept
   *  as-is. */
  data: Record<string, unknown>;
}

/** Collects all relevant localStorage entries into a structured object. */
export function buildExport(): ExportedData {
  const data: Record<string, unknown> = {};
  for (const key of EXPORT_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try { data[key] = JSON.parse(raw); }
    catch { data[key] = raw; }
  }
  return {
    exportedAt:    new Date().toISOString(),
    schemaVersion: 1,
    appVersion:    'que',
    data,
  };
}

/** Triggers a JSON file download in the browser. Filename includes the date
 *  so a user with multiple exports can tell them apart. */
export function downloadExport(): void {
  if (typeof window === 'undefined') return;
  const payload  = buildExport();
  const blob     = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const stamp    = payload.exportedAt.slice(0, 10); // YYYY-MM-DD
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = `que-export-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the click handler can finish first.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
