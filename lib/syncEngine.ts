/**
 * lib/syncEngine.ts — Cloud Sync for Que
 *
 * Strategy:
 *  • localStorage is the primary source of truth (offline-first).
 *  • Every persist call queues a debounced push to /api/sync.
 *  • On app start (after localStorage hydration), pullFromCloud() is called.
 *    Remote data is merged in — remote wins for any day that exists in both,
 *    so the most recently-synced device always wins.
 *  • All failures are silent — the app works identically offline.
 *
 * Debounce: 4 s — prevents hitting the API on every keystroke in a form.
 */

export type SyncPayload = {
  localDB?:  Record<string, unknown>;
  profile?:  Record<string, unknown>;
  settings?: Record<string, unknown>;
};

type SyncStatus = 'idle' | 'syncing' | 'error' | 'ok';

// Module-level state (not React state — no re-renders needed)
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _status: SyncStatus = 'idle';

const DEBOUNCE_MS = 4_000;

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Queue a push to the cloud. Debounced — safe to call on every keystroke.
 * No-op if called on the server or if the user is not signed in.
 */
export function queueSync(payload: SyncPayload): void {
  if (typeof window === 'undefined') return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void _push(payload);
    debounceTimer = null;
  }, DEBOUNCE_MS);
}

/**
 * Flush any pending queued sync immediately (call on beforeunload / tab hide).
 */
export function flushSync(payload: SyncPayload): void {
  if (typeof window === 'undefined') return;
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  void _push(payload);
}

/**
 * Pull the latest cloud snapshot.
 * Returns null if not authenticated or network is unavailable.
 */
export async function pullFromCloud(): Promise<SyncPayload | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/sync', { credentials: 'include' });
    if (res.status === 401) return null;  // not signed in — expected
    if (!res.ok) return null;
    return await res.json() as SyncPayload;
  } catch {
    return null;
  }
}

/** Last known sync status — readable from components if needed. */
export function getSyncStatus(): SyncStatus { return _status; }

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL
// ─────────────────────────────────────────────────────────────────────────────

async function _push(payload: SyncPayload): Promise<void> {
  _status = 'syncing';
  try {
    const res = await fetch('/api/sync', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(payload),
    });
    _status = res.ok ? 'ok' : 'error';
  } catch {
    _status = 'error';
    // Fail silently — localStorage remains the source of truth
  }
}
