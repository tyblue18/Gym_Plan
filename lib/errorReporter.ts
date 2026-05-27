/**
 * lib/errorReporter.ts — Central client-side error reporter
 *
 * Pipes errors to a server endpoint (/api/log/error) which surfaces them in
 * Vercel function logs — instant visibility without an external dependency.
 * Also installs global window handlers for uncaught errors + unhandled
 * promise rejections so silent failures stop being silent.
 *
 * Designed so a Sentry / Bugsnag SDK can be wired in later by editing one
 * function (reportError) — every call site already routes through it.
 *
 * Safeguards:
 *  - Deduplicates identical errors within a 5 s window (prevents flood).
 *  - Caps total reports per session at 50 (defends against infinite loops).
 *  - Silent on its own failures — never throws from the reporter itself.
 */

import * as Sentry from '@sentry/nextjs';

const DEDUPE_WINDOW_MS = 5_000;
const SESSION_CAP      = 50;

const seen   = new Map<string, number>(); // fingerprint → lastSeenMs
let   sent   = 0;
let   installed = false;

interface ErrorContext {
  /** Where in the app the error happened (e.g. "Calendar" tab boundary). */
  boundary?:       string;
  /** Component stack from React, if available. */
  componentStack?: string;
  /** Any additional metadata the caller wants attached. */
  extra?:          Record<string, unknown>;
}

function fingerprint(message: string, stack?: string): string {
  // First two frames of the stack are usually enough to distinguish errors
  // without making the key so specific that minor line shifts spam the dedupe.
  const frames = (stack ?? '').split('\n').slice(0, 3).join('|');
  return `${message}::${frames}`;
}

export function reportError(error: Error | unknown, ctx: ErrorContext = {}): void {
  if (typeof window === 'undefined') return;
  if (sent >= SESSION_CAP) return;

  const err     = error instanceof Error ? error : new Error(String(error));
  const fp      = fingerprint(err.message, err.stack);
  const now     = Date.now();
  const lastAt  = seen.get(fp);
  if (lastAt && now - lastAt < DEDUPE_WINDOW_MS) return;
  seen.set(fp, now);
  sent++;

  const payload = {
    message:        err.message,
    stack:          err.stack,
    name:           err.name,
    url:            window.location.href,
    userAgent:      navigator.userAgent,
    timestamp:      new Date().toISOString(),
    boundary:       ctx.boundary,
    componentStack: ctx.componentStack,
    extra:          ctx.extra,
  };

  // Always log to console in dev — Vercel logs the production calls.
  console.error('[reportError]', payload);

  // Forward to Sentry (no-op unless NEXT_PUBLIC_SENTRY_DSN is set). This is the
  // single client funnel, and Sentry's own GlobalHandlers are disabled in
  // instrumentation-client.ts, so each error reaches Sentry exactly once. The
  // dedupe + session cap above apply here too, so Sentry can't be flooded.
  try {
    Sentry.captureException(err, {
      extra: { url: payload.url, source: ctx.extra?.source, ...ctx.extra },
      tags:  ctx.boundary ? { boundary: ctx.boundary } : undefined,
      ...(ctx.componentStack ? { contexts: { react: { componentStack: ctx.componentStack } } } : {}),
    });
  } catch { /* never let the reporter throw */ }

  // Fire-and-forget. `keepalive` lets the request survive a navigation/unload
  // so we don't lose the final error before the tab dies.
  try {
    fetch('/api/log/error', {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(payload),
      keepalive:   true,
      credentials: 'omit',
    }).catch(() => { /* network may be offline — already logged to console */ });
  } catch { /* sendBeacon-style: never let the reporter itself throw */ }
}

/**
 * Install global handlers. Called once from app/layout.tsx (via a client
 * component) so we catch errors thrown outside React boundaries.
 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  window.addEventListener('error', e => {
    // Ignore ResizeObserver loop errors — noisy + benign.
    if (e.message?.includes('ResizeObserver loop')) return;
    reportError(e.error ?? new Error(e.message), { extra: { source: 'window.error' } });
  });

  window.addEventListener('unhandledrejection', e => {
    const reason = e.reason as unknown;
    const err    = reason instanceof Error ? reason : new Error(String(reason));
    reportError(err, { extra: { source: 'unhandledrejection' } });
  });
}
