/**
 * lib/diet-science.test.ts
 *
 * Locks the diet-plan SCIENCE to known reference values so the public
 * "research-based" claim can't silently regress in a refactor. Covers:
 *   • Mifflin-St Jeor BMR + activity-multiplier TDEE + deficit/surplus
 *   • ACSM running equation, Compendium MET cardio, net-of-resting energy
 *   • Effective deficit/surplus, weekly-rate (3500 kcal/lb), goal-capping
 *   • Plan-aware goal predicate (cut/bulk vs maintenance, ±100 fallback)
 *
 * These are pure functions — no React, no DOM, no network.
 */

import { describe, it, expect } from 'vitest';
import type { UserProfile } from '@/lib/AppContext';
import { computeBaseBudget, isGoalDay, dayMaintenanceFromRecord } from '@/lib/calorie-utils';
import {
  computeCardioBurn, getEffectiveDailyKcal, planWeeklyRate, planExpectedChange,
  EMPTY_CARDIO, type CardioFields, type AthletePlan,
} from '@/lib/metricsTypes';

// 180 lb, 70 in, 30 y/o male — the reference subject used throughout.
// deficit '500' (computeBaseBudget treats an unset/0 deficit as the 500 default).
const male = (over: Partial<UserProfile> = {}): UserProfile => ({
  weight: '180', height: '70', age: '30', sex: 'male',
  deficit: '500', activityLevel: '1', ...over,
});

const cardio = (over: Partial<CardioFields> = {}): CardioFields => ({ ...EMPTY_CARDIO, ...over });

// ── BMR / TDEE (Mifflin-St Jeor) ───────────────────────────────────────────
describe('Mifflin-St Jeor BMR + TDEE', () => {
  it('computes the textbook male BMR (Mifflin)', () => {
    // BMR = 10·81.647 + 6.25·177.8 − 5·30 + 5 = 1782.7 → 1783; ×1.0 − 500 = 1283
    expect(computeBaseBudget(male())).toBe(1283);
  });

  it('uses the −161 female constant', () => {
    // female BMR = male − 5 − 161 = 1617; ×1.0 − 500 = 1117
    expect(computeBaseBudget(male({ sex: 'female' }))).toBe(1117);
  });

  it('applies the activity multiplier (TDEE)', () => {
    // TDEE = round(1783 × 1.55) = 2764; − 500 = 2264
    expect(computeBaseBudget(male({ activityLevel: '1.55' }))).toBe(2264);
  });

  it('subtracts a cut deficit and adds a bulk surplus (negative deficit)', () => {
    expect(computeBaseBudget(male({ activityLevel: '1.55', deficit: '500' }))).toBe(2264);
    expect(computeBaseBudget(male({ activityLevel: '1.55', deficit: '-500' }))).toBe(3264);
  });

  it('never returns a negative budget', () => {
    expect(computeBaseBudget(male({ activityLevel: '1.55', deficit: '5000' }))).toBe(0);
  });
});

// ── Cardio burn (ACSM running, Compendium METs, net of rest) ────────────────
describe('cardio burn', () => {
  it('derives pace + speed from a 5 mi / 40 min run', () => {
    const m = computeCardioBurn(male(), cardio({ runDist: '5', runTime: '40' }));
    expect(m.runSpeed).toBe(7.5);          // (5/40)*60
    expect(m.runPaceStr).toBe('8:00 /mi'); // 40/5
  });

  it('burns a physiologically sane NET amount for that run (~660 kcal)', () => {
    // ACSM gross ≈ 714 kcal; net of resting (≈1.24 kcal/min × 40) ≈ 665.
    const m = computeCardioBurn(male(), cardio({ runDist: '5', runTime: '40' }));
    expect(m.runBurn).toBeGreaterThan(640);
    expect(m.runBurn).toBeLessThan(690);
  });

  it('is net of resting energy — strictly less than the gross ACSM cost', () => {
    const min = 40;
    const m = computeCardioBurn(male(), cardio({ runDist: '5', runTime: String(min) }));
    // Reconstruct gross from the ACSM equation and confirm the stored burn is lower.
    const kg = 180 / 2.20462;
    const grossish = ((0.2 * 7.5 * 26.8224 + 3.5) * kg / 1000) * 5 * min;
    expect(m.runBurn).toBeLessThan(grossish);
  });

  it('scales with body mass (heavier burns more for the same run)', () => {
    const light = computeCardioBurn(male({ weight: '150' }), cardio({ runDist: '5', runTime: '40' }));
    const heavy = computeCardioBurn(male({ weight: '220' }), cardio({ runDist: '5', runTime: '40' }));
    expect(heavy.runBurn).toBeGreaterThan(light.runBurn);
  });

  it('counts bike + swim and excludes steps from activityBurn', () => {
    const m = computeCardioBurn(male(), cardio({ bikeDist: '20', bikeTime: '60', swimTime: '30', steps: '12000' }));
    expect(m.bikeBurn).toBeGreaterThan(0);
    expect(m.swimBurn).toBeGreaterThan(0);
    // activityBurn is run+bike+swim only; steps are reported separately.
    expect(m.activityBurn).toBe(m.runBurn + m.bikeBurn + m.swimBurn);
    expect(m.stepBurn).toBeGreaterThan(0);
  });

  it('zero cardio → zero burn', () => {
    const m = computeCardioBurn(male(), cardio());
    expect(m.activityBurn).toBe(0);
    expect(m.runBurn).toBe(0);
  });
});

// ── Effective deficit / surplus + weekly rate (3500 kcal/lb) ────────────────
describe('plan rate math', () => {
  const cutPlan = (over: Partial<AthletePlan> = {}): AthletePlan => ({
    type: 'cut', intensity: 'moderate', dailyKcal: 500,
    startDate: '2026-01-01', startWeight: 200, goalWeight: 190, weeksTarget: 10,
    creationActivityBurn: 0, ...over,
  });

  it('folds 40% of cardio into the effective deficit (cut) / surplus (bulk)', () => {
    expect(getEffectiveDailyKcal(cutPlan({ creationActivityBurn: 300 }))).toBe(500 + 0.4 * 300);
    expect(getEffectiveDailyKcal(cutPlan({ type: 'bulk', creationActivityBurn: 300 }))).toBe(500 - 0.4 * 300);
  });

  it('clamps a cardio-dominated bulk surplus at zero', () => {
    expect(getEffectiveDailyKcal(cutPlan({ type: 'bulk', dailyKcal: 100, creationActivityBurn: 1000 }))).toBe(0);
  });

  it('weekly rate is signed and uses 3500 kcal/lb', () => {
    expect(planWeeklyRate(cutPlan())).toBeCloseTo(-(500 * 7 / 3500), 6);        // −1.0 lb/wk
    expect(planWeeklyRate(cutPlan({ type: 'bulk' }))).toBeCloseTo(500 * 7 / 3500, 6); // +1.0
  });

  it('expected change caps at the goal (no projecting past it)', () => {
    const p = cutPlan(); // 200 → 190, −1 lb/wk, goal delta −10
    expect(planExpectedChange(p, 5)).toBeCloseTo(-5, 6);   // mid-plan, uncapped
    expect(planExpectedChange(p, 50)).toBe(-10);           // long past target → capped at goal
    const b = cutPlan({ type: 'bulk', startWeight: 180, goalWeight: 190 });
    expect(planExpectedChange(b, 50)).toBe(10);            // bulk caps at +10
  });
});

// ── Plan-aware goal predicate ───────────────────────────────────────────────
describe('isGoalDay', () => {
  it('with no plan, uses the ±100 kcal band around budget', () => {
    expect(isGoalDay(2050, 2000, null, null)).toBe(true);   // within 100
    expect(isGoalDay(2200, 2000, null, null)).toBe(false);  // 200 over
    expect(isGoalDay(0, 2000, null, null)).toBe(false);     // nothing logged
  });

  it('on a cut, any day at/below maintenance counts (with a starvation floor)', () => {
    expect(isGoalDay(2000, 1800, 2500, 'cut')).toBe(true);   // under maintenance
    expect(isGoalDay(2600, 1800, 2500, 'cut')).toBe(false);  // over maintenance
    expect(isGoalDay(900, 1800, 2500, 'cut')).toBe(false);   // below 40% floor (1000)
  });

  it('on a bulk, any day at/above maintenance counts', () => {
    expect(isGoalDay(2800, 3000, 2500, 'bulk')).toBe(true);  // over maintenance
    expect(isGoalDay(2000, 3000, 2500, 'bulk')).toBe(false); // under maintenance
  });

  it('falls back to the band when maintenance is unavailable (legacy day)', () => {
    expect(isGoalDay(2050, 2000, null, 'cut')).toBe(true);
    expect(isGoalDay(2200, 2000, null, 'cut')).toBe(false);
  });
});

describe('dayMaintenanceFromRecord', () => {
  it('returns tdee + burn when tdee is stored', () => {
    expect(dayMaintenanceFromRecord({ tdee: 2000, burn: 300 })).toBe(2300);
  });
  it('returns null without a stored tdee (legacy days fall back to ±100)', () => {
    expect(dayMaintenanceFromRecord({ burn: 300 })).toBeNull();
    expect(dayMaintenanceFromRecord({})).toBeNull();
  });
});
