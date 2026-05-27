/**
 * Sentry — client runtime init. Next 15.3+ auto-loads this on the client (no
 * build-time wrapper needed). Inert unless NEXT_PUBLIC_SENTRY_DSN is set.
 *
 * We DISABLE Sentry's own GlobalHandlers integration: the app already funnels
 * window.error + unhandledrejection (and React boundary + explicit) errors
 * through lib/errorReporter.reportError(), which forwards to Sentry. Keeping
 * both would double-capture every uncaught error.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  integrations: integrations => integrations.filter(i => i.name !== 'GlobalHandlers'),
});

// Instruments App Router client navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
