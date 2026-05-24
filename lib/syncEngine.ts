/**
 * lib/syncEngine.ts — Cloud Sync for Que
 *
 * Strategy:
 *  • localStorage is the primary source of truth (offline-first).
 *  • Every localDB change queues a debounced push (includes settings snapshot).
 *  • On app start (after localStorage hydration), pullFromCloud() is called.
 *    Remote data is merged in — remote wins, so the most recently-synced device wins.
 *  • All failures are silent — the app works identically offline.
 *
 * Debounce: 4 s — prevents hitting the API on every keystroke.
 */

export type SyncPayload = {
  localDB?:  Record<string, unknown>;
  profile?:  Record<string, unknown>;
  settings?: Record<string, unknown>;
};

type SyncStatus = 'idle' | 'syncing' | 'error' | 'ok';

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _status: SyncStatus = 'idle';

const DEBOUNCE_MS = 4_000;

// All localStorage keys that belong in the synced "settings" blob
const SETTINGS_KEYS = [
  'queAthletePlan',        // cut/bulk plan
  'queWorkoutPresets',     // saved workout presets
  'ironmanTemplatesPool',  // custom templates
  'queExerciseUsage',      // exercise frequency (for sorting)
  'queLastStreak',         // calorie streak
  'queLiftPRs',            // all-time lift maxes — read by badge engine server-side
  'queMacroGoals',         // macro targets — sync across devices
  'queCalorieCoins',       // coin balance — used for battle wagering later
  'queProfilePhoto',       // profile photo URL (Vercel Blob) or base64 fallback
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads all synced settings keys from localStorage and returns them as an object.
 * Included in every push so settings are always up-to-date on every device.
 */
export function gatherSettings(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  const out: Record<string, unknown> = {};
  for (const key of SETTINGS_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try { out[key] = JSON.parse(raw); }
    catch { out[key] = raw; } // keep as string if not valid JSON
  }
  return out;
}

/**
 * Restores all settings keys from a remote settings object into localStorage
 * and fires any necessary events (e.g. profile photo change).
 */
export function restoreSettings(settings: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  for (const [key, val] of Object.entries(settings)) {
    if (val === null || val === undefined) continue;
    try {
      const str = typeof val === 'string' ? val : JSON.stringify(val);
      localStorage.setItem(key, str);
    } catch { /* storage full */ }
  }
  if (settings['queProfilePhoto']) {
    window.dispatchEvent(new Event('queProfilePhotoChanged'));
  }
}

/**
 * Queue a debounced push. Always includes a fresh settings snapshot so
 * profile photo, presets, and plan stay in sync across devices.
 */
export function queueSync(payload: SyncPayload): void {
  if (typeof window === 'undefined') return;
  const withSettings: SyncPayload = {
    ...payload,
    settings: { ...gatherSettings(), ...(payload.settings ?? {}) },
  };
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void _push(withSettings);
    debounceTimer = null;
  }, DEBOUNCE_MS);
}

/**
 * Immediate push — bypasses debounce. Use for photo uploads and other
 * one-shot settings changes that don't go through localDB.
 */
export function pushNow(payload: SyncPayload): void {
  if (typeof window === 'undefined') return;
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  void _push({
    ...payload,
    settings: { ...gatherSettings(), ...(payload.settings ?? {}) },
  });
}

/**
 * Pull the latest cloud snapshot.
 * Returns null if not authenticated or network is unavailable.
 */
export async function pullFromCloud(): Promise<SyncPayload | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/sync', { credentials: 'include' });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    return await res.json() as SyncPayload;
  } catch {
    return null;
  }
}

export function getSyncStatus(): SyncStatus { return _status; }

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL
// ─────────────────────────────────────────────────────────────────────────────

function dispatch(status: SyncStatus) {
  _status = status;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('que-sync', { detail: status }));
  }
}

async function _push(payload: SyncPayload): Promise<void> {
  dispatch('syncing');
  try {
    const res  = await fetch('/api/sync', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(payload),
    });

    if (res.ok) {
      const json = await res.json() as { conflicts?: Array<{ date: string; data: unknown }> };
      if (json.conflicts?.length) {
        // Server won these days — write them to localStorage and notify AppContext
        try {
          const raw = localStorage.getItem('ironmanCoreDB_v2');
          const db  = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
          for (const { date, data } of json.conflicts) db[date] = data;
          localStorage.setItem('ironmanCoreDB_v2', JSON.stringify(db));
          window.dispatchEvent(new CustomEvent('que-conflict', { detail: json.conflicts }));
        } catch { /* storage full — skip */ }
      }
      dispatch('ok');
    } else {
      dispatch('error');
    }
  } catch {
    dispatch('error');
  }
}
