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

    const handleLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(reg => {
          // If a worker is already waiting when we register (e.g. user
          // dismissed the prompt and refreshed manually), surface it again.
          if (reg.waiting && navigator.serviceWorker.controller) {
            setPendingWorker(reg.waiting);
          }
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
          // Poll for updates while the tab is open.
          setInterval(() => reg.update().catch(() => {}), 60_000);
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

    if (document.readyState === 'complete') handleLoad();
    else window.addEventListener('load', handleLoad);
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
          className="fixed left-1/2 -translate-x-1/2 z-[80] flex items-center gap-3 max-w-[92vw] rounded-lg border bg-[var(--bg-1)] px-4 py-2.5"
          style={{
            bottom:      'calc(20px + env(safe-area-inset-bottom))',
            borderColor: 'var(--positive)',
            boxShadow:   '0 0 0 1px var(--positive-12), 0 18px 40px rgba(0,0,0,0.55)',
          }}
        >
          <span className="font-mono text-[10px] text-[var(--ink-1)] tracking-[0.3px]">
            <strong className="text-[var(--positive)]">New version</strong> ready — refresh for the latest.
          </span>
          <button
            type="button"
            onClick={applyUpdate}
            className="font-mono text-[9px] font-bold tracking-[1px] uppercase rounded-sm px-2.5 py-1.5 bg-[var(--positive)] text-[var(--accent-ink)] hover:opacity-90 transition-opacity"
          >
            Update
          </button>
          <button
            type="button"
            onClick={() => setPendingWorker(null)}
            className="font-mono text-[9px] tracking-[1px] uppercase text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors"
            title="Dismiss until next deploy"
          >
            Later
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
