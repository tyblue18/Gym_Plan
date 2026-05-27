/**
 * lib/calorie-utils.ts
 *
 * Shared calorie / coin helpers. Used by client UI (CalorieTracker,
 * MorningWeightPrompt) AND server engines (coinEngine, badgeEngine, weekly-recap
 * cron). Keeping the BMR formula and the goal-hit predicate in one place
 * prevents client/server drift where one side awards a coin and the other
 * doesn't recognise the day as a goal hit.
 */

import type { UserProfile } from '@/lib/AppContext';
import { COIN_KEY, GOAL_TOLERANCE } from '@/lib/constants';

// ── BMR + activity budget ────────────────────────────────────────────────────
// Mifflin-St Jeor BMR × activity multiplier − fixed deficit goal.
// Defaults match the legacy app's safe values; UserProfile fields are strings
// because they come straight from form inputs.
export function computeBaseBudget(p: UserProfile): number {
  const kg  = (parseFloat(p.weight) || 180) / 2.20462;
  const cm  = (parseFloat(p.height) || 70)  * 2.54;
  const age = parseFloat(p.age) || 29;
  const def = parseFloat(p.deficit) || 500;
  const mul = parseFloat(p.activityLevel) || 1.55;
  const bmr = Math.round(
    p.sex === 'male'
      ? 10 * kg + 6.25 * cm - 5 * age + 5
      : 10 * kg + 6.25 * cm - 5 * age - 161
  );
  return Math.max(0, Math.round(bmr * mul) - def);
}

// ── Goal-hit predicate ───────────────────────────────────────────────────────
/** True when calsEaten is within GOAL_TOLERANCE of budget AND both are > 0. */
export function hitGoal(calsEaten: unknown, budget: unknown): boolean {
  const eaten = parseFloat(String(calsEaten ?? '0'));
  const bud   = parseFloat(String(budget   ?? '0'));
  return eaten > 0 && bud > 0 && Math.abs(eaten - bud) <= GOAL_TOLERANCE;
}

// ── Coin balance (client-side localStorage cache) ────────────────────────────
// The DB is the authoritative source via /api/wallet — this is the optimistic
// client-side ledger that the header counter and CalorieTracker animate from.

export interface CoinData {
  total:        number;
  awardedDates: string[];
}

const EMPTY_COINS: CoinData = { total: 0, awardedDates: [] };

export function loadCoins(): CoinData {
  if (typeof window === 'undefined') return EMPTY_COINS;
  try {
    return JSON.parse(localStorage.getItem(COIN_KEY) ?? 'null') ?? EMPTY_COINS;
  } catch { return EMPTY_COINS; }
}

export function saveCoins(d: CoinData): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(COIN_KEY, JSON.stringify(d)); } catch { /* storage full */ }
}
