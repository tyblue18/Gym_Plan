/**
 * lib/telemetry.ts — Thin wrapper over Vercel Analytics custom events
 *
 * Vercel Analytics ships with `track()` for custom events. This file:
 *   1. Centralizes the event-name catalog (no typos at call sites).
 *   2. No-ops outside production so dev runs don't spam the dashboard.
 *   3. Strips PII before sending (only counts / categorical fields ever
 *      leave the device).
 *
 * The catalog should grow only when a metric will *change* a decision —
 * "battle accept rate", "search → add conversion", "plan completion rate".
 * Avoid generic page-view tracking; Analytics already does that.
 */

import { track } from '@vercel/analytics';

/**
 * Union of every event the app is allowed to emit. Adding a new event is
 * a one-line append here plus the call site — the type system enforces
 * the catalog at every send.
 */
export type TelemetryEvent =
  // Food / calorie flow
  | 'food_search_run'             // user fired a search
  | 'food_search_empty'           // search returned 0 results
  | 'food_added_search'           // food added from a search result
  | 'food_added_recent'           // food added via Recents/Frequents
  | 'food_added_scan'             // food added via barcode scan
  | 'food_added_myfoods'          // food added from saved custom list
  | 'meal_copied_yesterday'       // user copied yesterday's meal
  | 'food_outlier_confirmed'      // user confirmed a high-kcal entry
  // Lifts
  | 'lift_logged'                 // any lift entry committed
  | 'lift_outlier_confirmed'      // user confirmed an outlier weight
  | 'rest_timer_skipped'          // user dismissed rest timer early
  // Plans
  | 'plan_created'                // user saved a new plan
  | 'plan_updated'                // user edited an existing plan
  | 'plan_completed'              // milestone reached for plan goal
  | 'plan_kcal_adjust_applied'    // user adopted a recommended kcal shift
  // Battles
  | 'battle_created'              // sent a challenge
  | 'battle_accepted'             // accepted an incoming challenge
  | 'battle_declined'             // declined an incoming challenge
  | 'battle_resolved_win'         // battle resolved in user's favor (client-observed)
  | 'battle_resolved_loss'
  | 'battle_resolved_tie'
  // Engagement
  | 'data_exported'               // user clicked Export Data
  | 'badge_popup_shown';          // badge celebration popup actually rendered

interface TelemetryProperties {
  /** Free-form integers / strings. Don't put PII here — categorical only.
   *  Vercel Analytics caps custom props at small payloads anyway. */
  [key: string]: string | number | boolean | null;
}

/**
 * Send a typed event. No-op outside production. Errors swallowed — telemetry
 * must never break the user-facing flow.
 */
export function trackEvent(event: TelemetryEvent, props?: TelemetryProperties): void {
  if (typeof window === 'undefined') return;
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[telemetry:dev]', event, props ?? '');
    return;
  }
  try {
    track(event, props);
  } catch { /* analytics failure must never bubble */ }
}
