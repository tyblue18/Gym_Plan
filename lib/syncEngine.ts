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
let pendingLocalDB: Record<string, unknown> = {};
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
  // Accumulate localDB days so rapid successive calls don't lose earlier data
  if (payload.localDB) {
    pendingLocalDB = { ...pendingLocalDB, ...payload.localDB };
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void _push({ localDB: pendingLocalDB, settings: gatherSettings() });
    pendingLocalDB = {};
    debounceTimer = null;
  }, DEBOUNCE_MS);
}

/**
 * Immediate push — bypasses debounce. Drains any accumulated pending data too.
 * Use for photo uploads, preset saves, and other one-shot settings changes.
 */
export function pushNow(payload: SyncPayload): void {
  if (typeof window === 'undefined') return;
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  void _push({
    localDB: { ...pendingLocalDB, ...(payload.localDB ?? {}) },
    settings: { ...gatherSettings(), ...(payload.settings ?? {}) },
  });
  pendingLocalDB = {};
}

/**
 * Flush any pending debounced sync immediately (e.g. on visibilitychange).
 * No-op if nothing is queued.
 */
export function flushPending(): void {
  if (!debounceTimer && Object.keys(pendingLocalDB).length === 0) return;
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  void _push({ localDB: pendingLocalDB, settings: gatherSettings() });
  pendingLocalDB = {};
}

/**
 * Pull the latest cloud snapshot.
 * Returns null if not authenticated or network is unavailable.
 * Also fires que-badge-earned if the server had pending badges from a prior push's after().
 */
export async function pullFromCloud(): Promise<SyncPayload | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/sync', { credentials: 'include' });
    if (res.status === 401) return null;
    if (!res.ok) return null;
    const json = await res.json() as SyncPayload & {
      newBadges?: Array<{ slug: string; label: string; icon: string; category: string }>;
    };
    if (json.newBadges?.length) {
      window.dispatchEvent(new CustomEvent('que-badge-earned', { detail: json.newBadges }));
    }
    return json;
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

async function _push(payload: SyncPayload, attempt = 0): Promise<void> {
  dispatch('syncing');
  try {
    const res  = await fetch('/api/sync', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(payload),
    });

    if (res.ok) {
      const json = await res.json() as {
        conflicts?:     Array<{ date: string; data: unknown }>;
        newBadges?:     Array<{ slug: string; label: string; icon: string; category: string }>;
        revokedBadges?: Array<{ slug: string; label: string; icon: string; category: string }>;
        newCoins?:      Array<{ date: string; coins: number }>;
        walletBalance?: number;
      };
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
      if (json.newBadges?.length) {
        window.dispatchEvent(new CustomEvent('que-badge-earned', { detail: json.newBadges }));
      }
      if (json.revokedBadges?.length) {
        window.dispatchEvent(new CustomEvent('que-badges-revoked', { detail: json.revokedBadges }));
      }
      if (json.newCoins?.length) {
        // Server confirmed these dates — add them to queCalorieCoins.awardedDates
        // so the client never double-shows the coin animation.
        try {
          const stored = JSON.parse(localStorage.getItem('queCalorieCoins') ?? 'null')
            ?? { total: 0, awardedDates: [] };
          const known = new Set<string>(stored.awardedDates);
          for (const { date } of json.newCoins) known.add(date);
          localStorage.setItem('queCalorieCoins', JSON.stringify({ ...stored, awardedDates: Array.from(known) }));
        } catch { /* storage full */ }
        window.dispatchEvent(new CustomEvent('que-coins-awarded', {
          detail: { newCoins: json.newCoins, walletBalance: json.walletBalance },
        }));
      }
      // Notify AppContext to stamp _syncedAt on the pushed dates so subsequent
      // pushes in the same session don't trigger false conflicts.
      if (payload.localDB && Object.keys(payload.localDB).length > 0) {
        window.dispatchEvent(new CustomEvent('que-sync-ack', {
          detail: { dates: Object.keys(payload.localDB), syncedAt: new Date().toISOString() },
        }));
      }
      dispatch('ok');
    } else if (res.status === 401 || res.status === 429) {
      // Auth failure or rate limit — don't retry
      dispatch('error');
    } else if (attempt < 2) {
      // Server error — retry with backoff (3s, then 9s).
      // Re-gather settings so a weight correction between failure and retry
      // uses the current queLiftPRs, not the stale value from the original push.
      const retryPayload = { ...payload, settings: gatherSettings() };
      setTimeout(() => void _push(retryPayload, attempt + 1), 3000 * (attempt + 1));
    } else {
      dispatch('error');
    }
  } catch {
    // Network error — retry with backoff (3s, then 9s)
    if (attempt < 2) {
      const retryPayload = { ...payload, settings: gatherSettings() };
      setTimeout(() => void _push(retryPayload, attempt + 1), 3000 * (attempt + 1));
    } else {
      dispatch('error');
    }
  }
}
