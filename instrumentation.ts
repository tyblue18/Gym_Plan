/**
 * Next.js instrumentation entrypoint (auto-loaded — no config flag needed in
 * Next 15). Initialises Sentry for the active server runtime and forwards
 * server-side request errors to it via the App Router `onRequestError` hook.
 */
import * as Sentry from '@sentry/nextjs';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Captures errors thrown while handling a server request (API routes, RSC,
// server actions). No-op unless Sentry was initialised with a DSN above.
export const onRequestError = Sentry.captureRequestError;
