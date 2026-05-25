// Shared types, constants, and pure utility functions for MetricsDashboard.

import { useMemo } from 'react';
import type { UserProfile } from '@/lib/AppContext';

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
  dailyKcal:   number;
  startDate:   string;
  startWeight: number;
  goalWeight:  number;
  weeksTarget: number;
}

export const PLAN_KEY = 'queAthletePlan';

export function loadPlan(): AthletePlan | null {
  try { const r = localStorage.getItem(PLAN_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
export function savePlanToStorage(p: AthletePlan) {
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch { /* noop */ }
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
