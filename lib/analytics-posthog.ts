/**
 * lib/analytics-posthog.ts — PostHog client init + thin capture/identify wrappers.
 *
 * Used for the activation/retention funnel (signup → onboarding → first log →
 * day-2 return). Events are sent through lib/telemetry.trackEvent so there's a
 * single typed catalog and call site.
 *
 * Design choices:
 *   • Inert unless NEXT_PUBLIC_POSTHOG_KEY is set, and prod-only (mirrors
 *     trackEvent) so dev runs don't pollute the project.
 *   • api_host '/ingest' is reverse-proxied in next.config.mjs to PostHog, so
 *     ad/privacy blockers that block posthog.com can't drop the events.
 *   • Session recording is DISABLED — the app shows personal health/nutrition
 *     data and we don't want it recorded. Funnels + retention need only events.
 *   • person_profiles 'identified_only' keeps anonymous person bloat (and cost)
 *     down while still recording the events funnels are built from.
 */

import posthog from 'posthog-js';

let inited = false;

export function initPostHog(): void {
  if (inited || typeof window === 'undefined') return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;                                  // no key → stays inert
  if (process.env.NODE_ENV !== 'production') return; // prod-only, like trackEvent

  posthog.init(key, {
    api_host:                 '/ingest',
    ui_host:                  'https://us.posthog.com',
    capture_pageview:         true,
    capture_pageleave:        true,
    autocapture:              false,  // we emit explicit, typed funnel events
    disable_session_recording: true,  // never record screens (personal health data)
    person_profiles:          'identified_only',
    respect_dnt:              true,
  });
  inited = true;
}

/** Send an event to PostHog (no-op until init succeeds). */
export function phCapture(event: string, props?: Record<string, unknown>): void {
  if (!inited) return;
  try { posthog.capture(event, props); } catch { /* analytics must never break UX */ }
}

/** Tie subsequent events to a stable account id for cross-device retention. */
export function phIdentify(id: string): void {
  if (!inited) return;
  try { posthog.identify(id); } catch { /* noop */ }
}
