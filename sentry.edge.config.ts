/**
 * Sentry — edge runtime init (middleware / edge routes). Same inert-without-DSN
 * behaviour as the server config. Loaded by instrumentation.ts `register`.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
});
