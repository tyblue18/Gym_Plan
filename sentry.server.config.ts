/**
 * Sentry — server runtime init (loaded by instrumentation.ts `register`).
 *
 * Fully inert unless SENTRY_DSN is set, so it's safe to ship before the Sentry
 * project exists and harmless in local dev. No build-time wrapper
 * (withSentryConfig) is used — wiring is purely through Next's built-in
 * instrumentation hooks, so the webpack build is untouched. Source-map upload
 * (readable stack traces) can be added later via the Sentry wizard once it's
 * verified on a preview deploy.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // 10% performance sampling — enough for request context, negligible quota at
  // launch volume. Drop to 0 for errors-only if you ever get close to the cap.
  tracesSampleRate: 0.1,
  // Privacy: never attach IP / headers / user identifiers automatically.
  sendDefaultPii: false,
});
