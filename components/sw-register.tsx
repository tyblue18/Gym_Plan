'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Registers the service worker and surfaces an "Update available" prompt
 * when a new version installs. Without the prompt, users would only get
 * the new code on a hard refresh — easy to miss with a long-running PWA tab.
 *
 * Flow:
 *   1. register('/sw.js') returns the registration.
 *   2. Polls reg.update() every 60s so an open tab notices new deploys.
 *   3. When a fresh SW transitions to `installed` AND there's already a
 *      controller (i.e. this is an *update*, not a first install), set
 *      `pendingWorker` and reveal the prompt.
 *   4. User clicks "Update now" → tell the waiting worker to skipWaiting,
 *      then reload once it claims control (controllerchange fires).
 */
export function SWRegister() {
  const [pendingWorker, setPendingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    // Show the prompt for a waiting worker — but only when an old SW already
    // controls the page. A first-ever install has no controller and must not prompt.
    const offerWaiting = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) {
        setPendingWorker(reg.waiting);
      }
    };

    const handleLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(reg => {
          registration = reg;
          offerWaiting(reg);
          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              // 'installed' + an existing controller = genuine update.
              // 'installed' + no controller = first-ever install (no prompt).
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                setPendingWorker(installing);
              }
            });
          });
          // Poll for updates while the tab stays open.
          intervalId = setInterval(() => reg.update().catch(() => {}), 60_000);
        })
        .catch(err => {
          console.error('[SW] Registration failed:', err);
        });

      // Reload once the new SW takes control — guarantees the page renders
      // against the new caches and the new JS bundle.
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    };

    // A mobile PWA is resumed, not reloaded, so the page-load update check never
    // reruns and the 60s timer is throttled while backgrounded. Re-check on every
    // foreground so a version shipped while the app was closed is caught promptly
    // — this is the main reason the update prompt was missed on mobile.
    const onForeground = () => {
      if (document.visibilityState !== 'visible' || !registration) return;
      registration.update().catch(() => {});
      offerWaiting(registration);
    };
    document.addEventListener('visibilitychange', onForeground);

    if (document.readyState === 'complete') handleLoad();
    else window.addEventListener('load', handleLoad);

    return () => {
      document.removeEventListener('visibilitychange', onForeground);
      window.removeEventListener('load', handleLoad);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const applyUpdate = () => {
    if (!pendingWorker) return;
    pendingWorker.postMessage({ type: 'SKIP_WAITING' });
    // Reload is triggered by the controllerchange listener above.
  };

  return (
    <AnimatePresence>
      {pendingWorker && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="fixed left-1/2 -translate-x-1/2 z-[120] flex items-center gap-2.5 w-[calc(100vw-20px)] max-w-[440px] rounded-xl border bg-[var(--bg-1)] px-3.5 py-3"
          style={{
            // Sit ABOVE the bottom tab nav (which is z-100 and occupies the
            // bottom of the viewport). z-120 keeps the toast on top, and the
            // offset clears the nav height + the device safe-area inset so it's
            // never tucked behind the bar on mobile.
            bottom:      'calc(76px + env(safe-area-inset-bottom))',
            borderColor: 'var(--positive)',
            boxShadow:   '0 0 0 1px var(--positive-12), 0 18px 40px rgba(0,0,0,0.55)',
          }}
        >
          <span className="flex-1 min-w-0 font-mono text-[11px] leading-snug text-[var(--ink-1)] tracking-[0.2px]">
            <strong className="text-[var(--positive)]">New version</strong> of Que is ready.
          </span>
          <button
            type="button"
            onClick={applyUpdate}
            className="shrink-0 font-mono text-[10px] font-bold tracking-[1px] uppercase rounded-md px-3.5 py-2 bg-[var(--positive)] text-[var(--accent-ink)] hover:opacity-90 active:scale-95 transition"
          >
            Update
          </button>
          <button
            type="button"
            onClick={() => setPendingWorker(null)}
            className="shrink-0 font-mono text-[10px] tracking-[1px] uppercase text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors px-1.5 py-2"
            title="Dismiss until next deploy"
          >
            Later
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
