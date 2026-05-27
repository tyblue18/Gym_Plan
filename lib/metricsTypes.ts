// Shared types, constants, and pure utility functions for MetricsDashboard.

import { useMemo } from 'react';
import type { UserProfile, LocalDB } from '@/lib/AppContext';

// ── Locale helpers ────────────────────────────────────────────────────────────

const MONTHS_LOCAL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export function ordinal(n: number): string {
  const v = n % 100; const s = ['th','st','nd','rd'];
  return n + (s[(v-20)%10] ?? s[v] ?? s[0]);
}
export function fmtDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${MONTHS_LOCAL[d.getMonth()]} ${ordinal(d.getDate())}, ${d.getFullYear()}`;
}
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseNum(v: string | number | undefined): number {
  return parseFloat(String(v ?? '0')) || 0;
}
export function fmt(n: number): string { return Math.round(n).toLocaleString(); }

// ── Cardio fields ─────────────────────────────────────────────────────────────

export interface CardioFields {
  steps: string; runDist: string; runTime: string;
  bikeDist: string; bikeTime: string; swimTime: string;
}
export const EMPTY_CARDIO: CardioFields = {
  steps: '0', runDist: '0', runTime: '0',
  bikeDist: '0', bikeTime: '0', swimTime: '0',
};

// ── Athlete plan ──────────────────────────────────────────────────────────────

export type PlanIntensity = 'slight' | 'moderate' | 'aggressive';

export const INTENSITY_KCAL: Record<PlanIntensity, number> = {
  slight: 250, moderate: 500, aggressive: 1000,
};

export const INTENSITY_LABELS: Record<'cut' | 'bulk', Record<PlanIntensity, string>> = {
  cut:  { slight: 'Slight Deficit', moderate: 'Cut',  aggressive: 'Aggressive Cut' },
  bulk: { slight: 'Lean Bulk',      moderate: 'Bulk', aggressive: 'Dirty Bulk'      },
};

export interface AthletePlan {
  type:        'cut' | 'bulk';
  intensity:   PlanIntensity;
  /** The intensity preset value (250 / 500 / 1000). Display-only. For the
   *  rate-bearing number that progress tracking should compare against,
   *  use getEffectiveDailyKcal() — it accounts for cardio's contribution. */
  dailyKcal:   number;
  startDate:   string;
  startWeight: number;
  goalWeight:  number;
  weeksTarget: number;
  /** Snapshot of m.activityBurn at plan creation. Used by
   *  getEffectiveDailyKcal() to convert dailyKcal into an effective deficit
   *  (cut) or surplus (bulk). Optional for backwards compat with plans
   *  created before this field was added. */
  creationActivityBurn?: number;
}

import { ATHLETE_PLAN_KEY } from '@/lib/constants';
// Re-exported under the legacy PLAN_KEY name so existing imports keep working.
export const PLAN_KEY = ATHLETE_PLAN_KEY;

export function loadPlan(): AthletePlan | null {
  try { const r = localStorage.getItem(PLAN_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
export function savePlanToStorage(p: AthletePlan) {
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch { /* noop */ }
}

/**
 * Effective daily caloric delta the plan is built around.
 *
 *   Cut:  dailyKcal + 0.4 × activityBurn   (cardio enlarges the deficit)
 *   Bulk: dailyKcal − 0.4 × activityBurn   (cardio shrinks the surplus, clamped ≥ 0)
 *
 * Why 0.4 × activityBurn: the daily budget formula adds back 60% of cardio burn,
 * so only the remaining 40% lands in actual caloric balance. This matches the
 * projection used at plan creation, so progress tracking compares against the
 * same rate the user was shown.
 *
 * Legacy plans without creationActivityBurn (introduced after the field was
 * added) fall back to raw dailyKcal — the cardio adjustment is unavailable
 * since we never captured the burn at creation time.
 */
export function getEffectiveDailyKcal(plan: AthletePlan): number {
  const cardioAdjust = (plan.creationActivityBurn ?? 0) * 0.4;
  return plan.type === 'cut'
    ? plan.dailyKcal + cardioAdjust
    : Math.max(0, plan.dailyKcal - cardioAdjust);
}

/**
 * Resolves the plan's true starting weight.
 *
 * If the user logged a weight within ~1.5 days of plan.startDate, that
 * weigh-in is treated as the authoritative baseline — they were estimating
 * when they typed plan.startWeight, and the actual scale reading supersedes
 * the estimate. Otherwise falls back to plan.startWeight.
 *
 * Used by progress tracking, chart anchoring, and Recent Weigh-ins delta
 * so every "change since start" calculation uses the same reference point.
 */
export function getPlanBaseline(plan: AthletePlan, localDB: LocalDB): number {
  const planStartMs = new Date(plan.startDate + 'T00:00:00').getTime();
  const sortedDays  = Object.keys(localDB).filter(d => d >= plan.startDate).sort();
  for (const ds of sortedDays) {
    const w = parseNum(String(localDB[ds]?.weight ?? '0'));
    if (w <= 0) continue;
    const week = (new Date(ds + 'T00:00:00').getTime() - planStartMs) / (7 * 86400000);
    if (week > 0.2) break;        // first log is too far past start to override
    return w;
  }
  return plan.startWeight;
}

// ── Plan compliance (per-day caloric balance) ────────────────────────────────

export interface PlanCompliance {
  /** Whole days elapsed since plan.startDate (inclusive of today). */
  daysElapsed:           number;
  /** Days within the plan window where the user logged calsEaten. */
  daysLogged:            number;
  /** Days logged that landed inside the ±100 kcal goal band. */
  daysOnTarget:          number;
  /** Sum of (calsEaten − true maintenance) across logged days. Negative means
   *  a real caloric deficit (good for cuts, bad for bulks). */
  cumulativeBalance:     number;
  /** cumulativeBalance / daysLogged. 0 if no days logged. */
  avgDailyBalance:       number;
  /** Weight change implied by the cumulative caloric balance (lb).
   *  Calorie-based, data-driven counterpart to expectedChange. */
  calorieBasedChange:    number;
}

/**
 * Walks the plan window day-by-day and aggregates real caloric balance vs.
 * true maintenance, derived from each day's stored budget and burn.
 *
 *   budget       = tdee − profile.deficit + 0.6 × burn        (from useBudgetMetrics)
 *   ⇒ maintenance = tdee + burn = budget + profile.deficit + 0.4 × burn
 *
 * Uses the user's CURRENT profile.deficit. This is honest regardless of
 * whether the plan's intent matches the user's eating profile — if a bulk
 * user still has deficit=500, the ledger will correctly show they're in a
 * caloric deficit, prompting them to fix their config.
 *
 * Returns zeroed metrics on a missing plan or empty window.
 */
export function getPlanCompliance(
  plan:     AthletePlan,
  localDB:  LocalDB,
  profile:  UserProfile,
): PlanCompliance {
  const planStartMs = new Date(plan.startDate + 'T00:00:00').getTime();
  const todayStr    = new Date().toISOString().slice(0, 10);
  const daysElapsed = Math.max(
    0,
    Math.floor((new Date(todayStr + 'T00:00:00').getTime() - planStartMs) / 86400000) + 1,
  );

  let daysLogged       = 0;
  let daysOnTarget     = 0;
  let cumulativeBalance = 0;

  const profileDeficit = parseNum(profile.deficit) || 500;

  for (const [ds, rec] of Object.entries(localDB)) {
    if (ds < plan.startDate || ds > todayStr) continue;
    const calsEaten = parseNum(String(rec.calsEaten ?? '0'));
    const budget    = parseNum(String(rec.budget    ?? '0'));
    const burn      = parseNum(String(rec.burn      ?? '0'));
    if (calsEaten <= 0 || budget <= 0) continue;

    daysLogged++;
    if (Math.abs(calsEaten - budget) <= 100) daysOnTarget++;

    const maintenance = budget + profileDeficit + burn * 0.4;
    cumulativeBalance += calsEaten - maintenance;
  }

  return {
    daysElapsed,
    daysLogged,
    daysOnTarget,
    cumulativeBalance,
    avgDailyBalance:    daysLogged > 0 ? cumulativeBalance / daysLogged : 0,
    calorieBasedChange: cumulativeBalance / 3500,
  };
}

// ── Budget metrics ────────────────────────────────────────────────────────────

export interface BudgetMetrics {
  bmr: number; tdee: number; deficit: number; multiplier: number;
  stepMiles: number; stepBurn: number;
  runBurn: number; runPaceStr: string; runSpeed: number;
  bikeBurn: number; bikeSpeed: number;
  swimBurn: number;
  activityBurn: number; eatBack: number; budget: number;
}

export function useBudgetMetrics(profile: UserProfile, cardio: CardioFields): BudgetMetrics {
  return useMemo<BudgetMetrics>(() => {
    const wLbs = parseNum(profile.weight) || 180;
    const hIn  = parseNum(profile.height) || 70;
    const age  = parseNum(profile.age)    || 29;
    const sex  = profile.sex;
    const def  = parseNum(profile.deficit) || 500;
    const mult = parseNum(profile.activityLevel) || 1.55;
    const kg   = wLbs / 2.20462;
    const cm   = hIn  * 2.54;

    const bmr = Math.round(
      sex === 'male'
        ? 10 * kg + 6.25 * cm - 5 * age + 5
        : 10 * kg + 6.25 * cm - 5 * age - 161
    );
    const tdee = Math.round(bmr * mult);

    const steps     = parseNum(cardio.steps);
    const stride    = hIn * (sex === 'male' ? 0.418 : 0.415);
    const stepMiles = (steps * stride) / 63360;
    const stepBurn  = Math.round(stepMiles * 0.57 * wLbs);

    const rMi  = parseNum(cardio.runDist);
    const rMin = parseNum(cardio.runTime);
    let runBurn = 0, runPaceStr = '', runSpeed = 0;
    if (rMi > 0 && rMin > 0) {
      runSpeed = (rMi / rMin) * 60;
      const pace = rMin / rMi;
      const pMin = Math.floor(pace);
      const pSec = Math.round((pace - pMin) * 60).toString().padStart(2, '0');
      runPaceStr = `${pMin}:${pSec} /mi`;
      let met = 6;
      if      (runSpeed >= 9) met = 12.8;
      else if (runSpeed >= 8) met = 11.8;
      else if (runSpeed >= 7) met = 11;
      else if (runSpeed >= 6) met = 9.8;
      else if (runSpeed >= 5) met = 9;
      runBurn = Math.round(met * 3.5 * kg / 200 * rMin);
    }

    const bMi  = parseNum(cardio.bikeDist);
    const bMin = parseNum(cardio.bikeTime);
    let bikeBurn = 0, bikeSpeed = 0;
    if (bMi > 0 && bMin > 0) {
      bikeSpeed = (bMi / bMin) * 60;
      let met = 4;
      if      (bikeSpeed >= 20) met = 15;
      else if (bikeSpeed >= 16) met = 12;
      else if (bikeSpeed >= 14) met = 10;
      else if (bikeSpeed >= 12) met = 8;
      else if (bikeSpeed >= 10) met = 6;
      bikeBurn = Math.round(met * 3.5 * kg / 200 * bMin);
    }

    const sMin    = parseNum(cardio.swimTime);
    const swimBurn = sMin > 0 ? Math.round(6.0 * 3.5 * kg / 200 * sMin) : 0;

    const activityBurn = Math.round(runBurn + bikeBurn + swimBurn);
    const eatBack      = Math.round(activityBurn * 0.60);
    const budget       = Math.max(0, (tdee - def) + eatBack);

    return {
      bmr, tdee, deficit: def, multiplier: mult,
      stepMiles, stepBurn,
      runBurn, runPaceStr, runSpeed: Math.round(runSpeed * 10) / 10,
      bikeBurn, bikeSpeed: Math.round(bikeSpeed * 10) / 10,
      swimBurn,
      activityBurn, eatBack, budget,
    };
  }, [profile, cardio]);
}

// ── PR flags ──────────────────────────────────────────────────────────────────

export interface PRFlags { prRun: boolean; prBike: boolean; prSwim: boolean; prLift: boolean; }
