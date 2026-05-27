'use client';

/**
 * Root error boundary (App Router). Only renders if the root layout/template
 * itself throws — the catastrophic case the per-tab ErrorBoundaries can't catch.
 * Reports through the shared reportError funnel (→ in-house log + Sentry) and
 * shows a minimal branded fallback with a reload.
 */
import { useEffect } from 'react';
import { reportError } from '@/lib/errorReporter';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { boundary: 'root', extra: { digest: error.digest } });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#07080A', color: '#E8EAED', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 13, color: '#9EA1A8', maxWidth: 320, lineHeight: 1.5, margin: 0 }}>
            The app hit an unexpected error and couldn&apos;t recover. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{ marginTop: 8, padding: '12px 24px', borderRadius: 8, border: '1px solid #4FC3F7', background: '#4FC3F7', color: '#07080A', fontWeight: 700, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer' }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
