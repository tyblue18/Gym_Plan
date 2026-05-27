'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useApp } from '@/lib/AppContext';
import { trackEvent } from '@/lib/telemetry';
import { phIdentify } from '@/lib/analytics-posthog';

const FIRST_SEEN_KEY = 'queFirstSeenDate';

/**
 * Invisible funnel/retention instrumentation, mounted once in the app shell.
 *
 * Fires:
 *   • app_opened     — once per mount (active-user denominator)
 *   • returning_user — when today is a later calendar day than first-seen
 *   • PostHog identify(userId) — ties events to the account for cross-device
 *     retention cohorts
 *
 * The first_workout_logged / first_food_logged milestones are derived inside
 * trackEvent from the existing lift_logged / food_added_* events, so they're
 * not handled here.
 */
export function FunnelTracker() {
  const { data: session, status } = useSession();
  const { isLoaded, todayStr } = useApp();
  const openedRef = useRef(false);

  // Identify for cross-device retention (only fires once PostHog is initialised).
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.id) phIdentify(session.user.id);
  }, [status, session?.user?.id]);

  // app_opened + returning_user — once per mount, after local data has loaded
  // so todayStr reflects the client clock (not the SSR UTC default).
  useEffect(() => {
    if (!isLoaded || openedRef.current) return;
    openedRef.current = true;
    trackEvent('app_opened');
    try {
      const first = localStorage.getItem(FIRST_SEEN_KEY);
      if (!first) localStorage.setItem(FIRST_SEEN_KEY, todayStr);
      else if (todayStr > first) trackEvent('returning_user');
    } catch { /* storage blocked — skip retention signal */ }
  }, [isLoaded, todayStr]);

  return null;
}
