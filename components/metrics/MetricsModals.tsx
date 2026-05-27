'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import Lottie from 'lottie-react';
import celebrateData from '@/public/Celebrate_animation.json';
import {
  MONTHS,
  type LocalDB,
  type DayRecord,
  type UserProfile,
} from '@/lib/AppContext';
import {
  type AthletePlan,
  type BudgetMetrics,
  type PlanIntensity,
  INTENSITY_KCAL,
  INTENSITY_LABELS,
  loadPlan,
  savePlanToStorage,
  getEffectiveDailyKcal,
  getPlanBaseline,
  getPlanCompliance,
  parseNum,
  fmt,
  fmtDateLong,
} from '@/lib/metricsTypes';
import {
  drawProjection,
  drawPlanChart,
  drawProgressChart,
} from '@/lib/metricsCharts';
import { trackEvent } from '@/lib/telemetry';

// ─────────────────────────────────────────────────────────────────────────────
// MilestoneModal
// ─────────────────────────────────────────────────────────────────────────────

export function MilestoneModal({ open, onClose, pct, weightChange }: {
  open: boolean; onClose: () => void; pct: number; weightChange: number;
}) {
  const labels: Record<number, { title: string; sub: string }> = {
    25: { title: 'Quarter way!',   sub: 'Keep the momentum going.' },
    50: { title: 'Halfway there!', sub: 'You\'re exactly on schedule.' },
    75: { title: 'Almost done!',   sub: 'The finish line is in sight.' },
  };
  const info = labels[pct] ?? { title: `${pct}% complete`, sub: '' };
  const sign = weightChange > 0 ? '+' : '';
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[400] flex items-end md:items-center justify-center backdrop-blur-sm px-3 md:px-0"
          style={{ background: 'rgba(7,8,10,0.90)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="w-full md:max-w-[380px] rounded-t-lg md:rounded-lg border border-[var(--line-2)] bg-[var(--bg-1)] overflow-hidden"
            initial={{ opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 48 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--positive), 0 40px 80px rgba(0,0,0,0.6)' }}
          >
            <div className="flex justify-center pt-4 pb-0 bg-[var(--bg-2)]">
              <Lottie animationData={celebrateData} loop={false} autoplay={true} style={{ width: 150, height: 150 }} />
            </div>
            <div className="px-6 pb-6 text-center space-y-2">
              <span className="inline-block font-mono text-[9px] font-bold tracking-[2px] uppercase text-[var(--positive)] border border-[var(--positive)]/40 rounded-sm px-2 py-0.5">
                {pct}% Milestone
              </span>
              <h3 className="font-display text-[24px] tracking-[2px] uppercase text-[var(--positive)]">{info.title}</h3>
              {weightChange !== 0 && (
                <p className="font-mono text-[11px] font-bold text-[var(--ink-1)]">
                  {sign}{weightChange.toFixed(1)} lbs so far
                </p>
              )}
              <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[0.5px]">{info.sub}</p>
              <button onClick={onClose} className="que-btn-primary w-full py-3 mt-2">Keep going!</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CelebrationModal
// ─────────────────────────────────────────────────────────────────────────────

export function CelebrationModal({ open, onClose, localDB, calsEaten, budget }: {
  open: boolean; onClose: () => void;
  localDB: LocalDB; calsEaten: number; budget: number;
}) {
  const plan   = open ? loadPlan() : null;
  const sign   = (n: number) => n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);

  const { latestWeight, actualChange, weeksSince, status, baseline } = useMemo(() => {
    if (!plan) return { latestWeight: null, actualChange: null, weeksSince: 0, status: 'no-data', baseline: 0 };
    // Filter to plan window — a pre-plan weight isn't "current" progress.
    const entries = (Object.entries(localDB) as [string, DayRecord][])
      .filter(([ds, r]) => ds >= plan.startDate && parseNum(String(r.weight ?? '0')) > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, r]) => parseNum(String(r.weight)));
    const latest = entries.length > 0 ? entries[entries.length - 1] : null;
    const wks    = Math.max(0, (Date.now() - new Date(plan.startDate + 'T00:00:00').getTime()) / (7 * 86400000));
    const eff    = getEffectiveDailyKcal(plan);
    const rate   = plan.type === 'cut' ? -(eff * 7 / 3500) : (eff * 7 / 3500);
    const exp    = rate * wks;
    const base   = getPlanBaseline(plan, localDB);
    const act    = latest !== null ? latest - base : null;
    let   st     = 'no-data';
    if (act !== null && wks >= 0.5 && Math.abs(exp) > 0.05) {
      const thr = Math.abs(exp) * 0.2, d = act - exp;
      st = plan.type === 'cut' ? (d < -thr ? 'ahead' : d > thr ? 'behind' : 'on-track')
                                : (d > thr  ? 'ahead' : d < -thr ? 'behind' : 'on-track');
    } else if (act !== null) { st = 'on-track'; }
    return { latestWeight: latest, actualChange: act, weeksSince: wks, status: st, baseline: base };
  }, [plan, localDB, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusLabel = { ahead: 'Ahead of pace', 'on-track': 'On track', behind: 'Behind pace', 'no-data': '' }[status] ?? '';
  const statusColor = { ahead: 'var(--positive)', 'on-track': 'var(--accent)', behind: 'var(--warn)', 'no-data': 'var(--ink-3)' }[status] ?? 'var(--ink-3)';
  const deficit = budget - calsEaten;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[400] flex items-end md:items-center justify-center backdrop-blur-sm px-3 md:px-0"
          style={{ background: 'rgba(7,8,10,0.90)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="w-full md:max-w-[420px] rounded-t-lg md:rounded-lg border border-[var(--line-2)] bg-[var(--bg-1)] overflow-hidden"
            initial={{ opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 48 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--positive), 0 40px 80px rgba(0,0,0,0.6)' }}
          >
            <div className="relative flex justify-center items-center pt-2 pb-0 bg-[var(--bg-2)]">
              <Lottie
                animationData={celebrateData}
                loop={false}
                autoplay={true}
                style={{ width: 180, height: 180 }}
              />
              <button onClick={onClose}
                className="absolute top-3 right-3 text-[var(--ink-2)] hover:text-[var(--ink-0)] transition-colors p-1">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-4">
              <div className="text-center">
                <h3 className="font-display text-[26px] tracking-[2px] uppercase text-[var(--positive)] leading-tight">
                  Goal hit!
                </h3>
                <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[1px] mt-1">
                  {fmt(calsEaten)} / {fmt(budget)} kcal · {deficit >= 0 ? `${fmt(deficit)} kcal under` : `${fmt(-deficit)} kcal over`}
                </p>
              </div>

              {plan && (
                <div className="rounded border border-[var(--positive)]/30 bg-[var(--positive)]/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[9px] font-bold tracking-[2px] text-[var(--ink-3)] uppercase">Plan progress</p>
                    <span className="font-mono text-[9px] font-bold tracking-[1px] uppercase" style={{ color: statusColor }}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Start',   value: `${baseline.toFixed(1)} lb` },
                      { label: 'Current', value: latestWeight ? `${latestWeight.toFixed(1)} lb` : '—' },
                      { label: 'Change',  value: actualChange !== null ? `${sign(actualChange)} lb` : '—', accent: true },
                    ].map(t => (
                      <div key={t.label} className="text-center">
                        <p className="font-mono text-[8px] text-[var(--ink-3)] uppercase tracking-[1px] mb-0.5">{t.label}</p>
                        <p className="font-mono text-[11px] font-bold" style={{ color: t.accent ? statusColor : 'var(--ink-0)' }}>{t.value}</p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <p className="font-mono text-[8px] text-[var(--ink-3)] tracking-[0.5px]">
                        Week {Math.ceil(weeksSince)} of {plan.weeksTarget}
                      </p>
                      <p className="font-mono text-[8px] text-[var(--ink-3)] tracking-[0.5px]">
                        {Math.round((weeksSince / plan.weeksTarget) * 100)}%
                      </p>
                    </div>
                    <div className="h-1.5 bg-[var(--bg-3)] rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: statusColor }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (weeksSince / plan.weeksTarget) * 100)}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <button type="button" onClick={onClose} className="que-btn-primary w-full py-3">
                Keep it up!
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PlanProgressModal
// ─────────────────────────────────────────────────────────────────────────────

export function PlanProgressModal({ open, onClose, localDB, profile }: {
  open: boolean;
  onClose: () => void;
  localDB: LocalDB;
  profile: UserProfile;
}) {
  const [planVersion, setPlanVersion] = useState(0);
  const plan      = open ? loadPlan() : null;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = () => setPlanVersion(v => v + 1);
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [open]);

  const {
    weightEntries, chartPts, weeksSince, planWeeklyRate,
    expectedChange, firstWeight, actualChange, actualWeeklyRate, status,
    projectedTotalWeeks, compliance, kcalAdjust, baselineDivergence,
  } = useMemo(() => {
    if (!plan) return {
      weightEntries: [], chartPts: [], weeksSince: 0, planWeeklyRate: 0,
      expectedChange: 0, firstWeight: 0, actualChange: null, actualWeeklyRate: null,
      status: 'no-data' as const, projectedTotalWeeks: null,
      compliance: null as ReturnType<typeof getPlanCompliance> | null,
      kcalAdjust: null as { kcal: number; weeksLeft: number; reached: boolean } | null,
      baselineDivergence: null as { projAtPlanEnd: number; gap: number } | null,
    };

    const entries = (Object.entries(localDB) as [string, DayRecord][])
      .filter(([, rec]) => parseNum(String(rec.weight ?? '0')) > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ds, rec]) => ({ date: ds, weight: parseNum(String(rec.weight)) }));

    const msElapsed   = Date.now() - new Date(plan.startDate + 'T00:00:00').getTime();
    const totalDays   = Math.max(0, Math.floor(msElapsed / 86400000));
    const wks         = Math.max(0, msElapsed / (7 * 86400000));

    const planStartMs = new Date(plan.startDate + 'T00:00:00').getTime();
    const cPts = entries.map(e => ({
      ...e,
      week: (new Date(e.date + 'T00:00:00').getTime() - planStartMs) / (7 * 86400000),
    })).filter(p => p.week >= 0);

    // Resolve the plan's true starting weight (first weigh-in near start if it
    // exists, else plan.startWeight). Shared with the chart, MilestoneModal,
    // CelebrationModal, and ProjectionModal so "change since start" is
    // computed identically everywhere.
    const baseWeight  = getPlanBaseline(plan, localDB);

    const eff         = getEffectiveDailyKcal(plan);
    const rate        = plan.type === 'cut'
      ? -(eff * 7 / 3500)
      :  (eff * 7 / 3500);
    const expChange   = rate * wks;
    // "Latest" must be a weigh-in *within* the plan window. Using the full
    // history would let a pre-plan weight masquerade as current progress when
    // the user hasn't logged anything since starting the plan.
    const windowEntries = entries.filter(e => e.date >= plan.startDate);
    const latest        = windowEntries.length > 0 ? windowEntries[windowEntries.length - 1] : null;
    // Compare against the resolved baseline, not the planned start. Lets a
    // user whose first weigh-in differs from plan.startWeight see correct
    // ahead/on-track/behind status.
    const actChange     = latest ? latest.weight - baseWeight : null;

    // Smoothed weight: mean of the last 3 in-window weigh-ins (or fewer if
    // that's all there is). Daily readings fluctuate ±1–2 lb from water alone,
    // which can flip ahead↔behind status from a single bad reading. The
    // smoothed value is used for the status determination and the goal-shift
    // recommendation; raw `latest` is still used for display (Latest tile,
    // chart dots) so the user sees their actual scale reading.
    const smoothCount     = Math.min(3, windowEntries.length);
    const smoothedWeight  = smoothCount > 0
      ? windowEntries.slice(-smoothCount).reduce((s, e) => s + e.weight, 0) / smoothCount
      : null;
    const actChangeSmooth = smoothedWeight !== null ? smoothedWeight - baseWeight : null;

    let actRate: number | null = null;
    if (windowEntries.length >= 2 && latest) {
      const first = windowEntries[0];
      const span  = (new Date(latest.date + 'T00:00:00').getTime() - new Date(first.date + 'T00:00:00').getTime()) / 86400000;
      if (span >= 4) actRate = ((latest.weight - first.weight) / span) * 7;
    }

    let st: 'ahead' | 'on-track' | 'behind' | 'no-data' = 'no-data';
    if (actChangeSmooth !== null && totalDays >= 3 && Math.abs(expChange) > 0.05) {
      const thr = Math.abs(expChange) * 0.2, delta = actChangeSmooth - expChange;
      if (plan.type === 'cut') st = delta < -thr ? 'ahead' : delta > thr ? 'behind' : 'on-track';
      else                     st = delta > thr  ? 'ahead' : delta < -thr ? 'behind' : 'on-track';
    } else if (actChangeSmooth !== null) { st = 'on-track'; }

    let projWks: number | null = null;
    if (actRate !== null && Math.abs(actRate) > 0.01) {
      projWks = Math.max(0, wks + (plan.goalWeight - (smoothedWeight ?? baseWeight)) / actRate);
    }

    // Baseline divergence: if the resolved baseline (first weigh-in) differs
    // from plan.startWeight, the chart's perfect-pace line — anchored at the
    // baseline — ends at a different weight than the goal at week N. Surface
    // this so the user knows the goal won't be hit at the plan rate just from
    // baseline shift (independent of their actual compliance).
    let baselineDivergence: { projAtPlanEnd: number; gap: number } | null = null;
    if (Math.abs(baseWeight - plan.startWeight) > 0.5) {
      const projAtPlanEnd = baseWeight + rate * plan.weeksTarget;
      const gap           = plan.goalWeight - projAtPlanEnd; // signed
      if (Math.abs(gap) > 0.5) baselineDivergence = { projAtPlanEnd, gap };
    }

    // Per-day calorie-compliance metrics (real balance vs. true maintenance).
    const comp = getPlanCompliance(plan, localDB, profile);

    // Recommended kcal/day intake shift. Signed: positive → eat more, negative
    // → eat less. Works for cuts and bulks because the sign already encodes
    // "more/less" through requiredRate.
    //
    // Two phases:
    //   reached → user has already crossed the goal in the right direction.
    //             Suggest maintenance, not "to hit goal in N wks".
    //   adjust  → user is mid-plan; compute the rate delta needed to land
    //             exactly on goal at plan.weeksTarget.
    let adj: { kcal: number; weeksLeft: number; reached: boolean } | null = null;
    if (actRate !== null && wks >= 1 && smoothedWeight !== null) {
      const weeksLeft = Math.max(0, plan.weeksTarget - wks);
      // Use smoothed weight so a single noisy reading doesn't flip the
      // "reached" badge or swing the recommended shift.
      const reached   = plan.type === 'cut'
        ? smoothedWeight <= plan.goalWeight
        : smoothedWeight >= plan.goalWeight;
      if (reached) {
        // Maintenance shift: counteract the current actRate so weight holds.
        const kcalDelta = Math.round((-actRate * 3500) / 7);
        if (Math.abs(kcalDelta) >= 50) adj = { kcal: kcalDelta, weeksLeft, reached: true };
      } else if (weeksLeft >= 0.5 && weeksLeft <= 52) {
        const weightLeft   = plan.goalWeight - smoothedWeight;   // signed
        const requiredRate = weightLeft / weeksLeft;              // signed lb/wk
        const rateDelta    = requiredRate - actRate;               // signed lb/wk
        const kcalDelta    = Math.round((rateDelta * 3500) / 7);   // signed kcal/day
        if (Math.abs(kcalDelta) >= 50) adj = { kcal: kcalDelta, weeksLeft, reached: false };
      }
    }

    return {
      // weightEntries is now plan-window only so the Recent Weigh-ins list
      // doesn't show pre-plan history next to plan-specific deltas/status.
      weightEntries: windowEntries, chartPts: cPts, weeksSince: wks,
      planWeeklyRate: rate, expectedChange: expChange,
      firstWeight: baseWeight,
      actualChange: actChange, actualWeeklyRate: actRate,
      status: st, projectedTotalWeeks: projWks,
      compliance: comp, kcalAdjust: adj, baselineDivergence,
    };
  }, [plan, localDB, profile, open, planVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open || !plan) return;
    drawProgressChart(canvas, plan, chartPts, weeksSince, firstWeight || undefined);
  }, [open, plan, chartPts, weeksSince, firstWeight]);

  const latest = weightEntries[weightEntries.length - 1];

  const statusCfg = {
    ahead:      { label: 'AHEAD OF PACE',       color: 'var(--positive)' },
    'on-track': { label: 'ON TRACK',             color: 'var(--accent)'   },
    behind:     { label: 'BEHIND PACE',          color: 'var(--warn)'     },
    'no-data':  { label: 'LOG WEIGHT TO TRACK',  color: 'var(--ink-3)'    },
  }[status];

  const sign = (n: number) => n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[300] flex items-end md:items-center justify-center backdrop-blur-sm px-3 md:px-0"
          style={{ background: 'rgba(7,8,10,0.88)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="w-full md:max-w-[560px] max-h-[88dvh] flex flex-col rounded-t-lg md:rounded-lg border border-[var(--line-2)] bg-[var(--bg-1)] overflow-hidden"
            initial={{ opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 48 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.6)' }}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--line)] flex-shrink-0">
              <div>
                <h3 className="font-display text-[20px] tracking-[2px] uppercase text-[var(--ink-0)]">Plan Progress</h3>
                {plan && (
                  <p className="font-mono text-[9px] text-[var(--ink-3)] tracking-[1px] mt-0.5">
                    {plan.type.toUpperCase()} · {INTENSITY_LABELS[plan.type][plan.intensity]} · week {Math.ceil(weeksSince)} of {plan.weeksTarget}
                  </p>
                )}
              </div>
              <button onClick={onClose} className="text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors p-1">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto overscroll-contain flex-1 p-4 md:p-5 space-y-4">
              <div className="rounded border px-4 py-2.5 text-center"
                style={{ borderColor: statusCfg.color, background: `${statusCfg.color}12` }}>
                <span className="font-mono text-[10px] font-bold tracking-[2px] uppercase" style={{ color: statusCfg.color }}>
                  {statusCfg.label}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[
                  // Use the resolved baseline so Start + Change = Latest stays internally consistent.
                  { label: 'Start',    value: firstWeight ? firstWeight.toFixed(1) : plan!.startWeight.toFixed(1), unit: 'lb' },
                  { label: 'Latest',   value: latest ? latest.weight.toFixed(1) : '—', unit: latest ? 'lb' : '' },
                  { label: 'Change',   value: actualChange !== null ? sign(actualChange) : '—', unit: actualChange !== null ? 'lb' : '', accent: true },
                  { label: 'Expected', value: sign(expectedChange), unit: 'lb', dim: true },
                ].map(t => (
                  <div key={t.label} className="rounded border border-[var(--line)] bg-[var(--bg-2)] p-2.5">
                    <p className="font-mono text-[8px] font-bold tracking-[1px] text-[var(--ink-3)] uppercase mb-1">{t.label}</p>
                    <p className="font-display text-[16px] leading-none"
                      style={{ color: t.dim ? 'var(--ink-3)' : t.accent ? 'var(--accent)' : 'var(--ink-0)' }}>{t.value}</p>
                    {t.unit && <p className="font-mono text-[8px] text-[var(--ink-3)] mt-0.5">{t.unit}</p>}
                  </div>
                ))}
              </div>

              <div className="rounded border border-[var(--line)] bg-[var(--bg-2)] p-3">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-6 h-px border-t border-dashed" style={{ borderColor: 'rgba(79,195,247,0.5)' }} />
                    <span className="font-mono text-[8px] text-[var(--ink-3)] tracking-[0.5px]">Perfect pace</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--positive)]" />
                    <span className="font-mono text-[8px] text-[var(--ink-3)] tracking-[0.5px]">Ahead</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--danger)]" />
                    <span className="font-mono text-[8px] text-[var(--ink-3)] tracking-[0.5px]">Behind</span>
                  </div>
                </div>
                {chartPts.length === 0 ? (
                  <div className="h-[160px] flex items-center justify-center">
                    <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[1px] uppercase">Log weight to see chart</p>
                  </div>
                ) : (
                  <canvas ref={canvasRef} className="block w-full h-[200px]" />
                )}
              </div>

              {actualWeeklyRate !== null && (
                <div className="rounded border border-[var(--line)] bg-[var(--bg-2)] divide-y divide-[var(--line)]">
                  {[
                    { label: 'Actual pace', value: `${sign(actualWeeklyRate)} lb / wk`, color: status === 'ahead' ? 'var(--positive)' : status === 'behind' ? 'var(--warn)' : 'var(--ink-0)' },
                    { label: 'Plan rate',   value: `${sign(planWeeklyRate)} lb / wk`,   color: 'var(--ink-3)' },
                    ...(projectedTotalWeeks !== null ? [{ label: 'At this pace', value: `~${Math.ceil(projectedTotalWeeks)} wks total`, color: 'var(--ink-1)' }] : []),
                  ].map(r => (
                    <div key={r.label} className="flex justify-between items-center px-3 py-2.5">
                      <span className="font-mono text-[10px] text-[var(--ink-3)] tracking-[0.5px]">{r.label}</span>
                      <span className="font-mono text-[11px] font-bold tracking-[0.5px]" style={{ color: r.color }}>{r.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Baseline divergence — shown when the resolved baseline differs
                  meaningfully from plan.startWeight, so the perfect-pace line
                  doesn't actually hit the goal at week N. Independent of user
                  compliance: it's a fixed offset from where the user started
                  vs. where the plan assumed. */}
              {baselineDivergence && plan && (
                <div className="rounded border border-[var(--ink-3)]/30 bg-[var(--bg-2)] px-4 py-3">
                  <p className="font-mono text-[9px] font-bold tracking-[2px] text-[var(--ink-3)] uppercase mb-1.5">
                    Baseline shifted
                  </p>
                  <p className="font-mono text-[11px] text-[var(--ink-0)] tracking-[0.3px] leading-relaxed">
                    Your first weigh-in was {firstWeight.toFixed(1)} lb, not the {plan.startWeight.toFixed(1)} lb entered at plan creation. At the plan rate from your actual baseline, you&apos;ll be at{' '}
                    <span className="font-bold text-[var(--accent)]">{baselineDivergence.projAtPlanEnd.toFixed(1)} lb</span>{' '}
                    at week {plan.weeksTarget} — {Math.abs(baselineDivergence.gap).toFixed(1)} lb {baselineDivergence.gap > 0
                      ? (plan.type === 'cut' ? 'short of' : 'past')
                      : (plan.type === 'cut' ? 'past'      : 'short of')} the {plan.goalWeight.toFixed(1)} lb goal.
                  </p>
                  <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1 tracking-[0.3px]">
                    See the recommended adjustment below to hit the original goal in time.
                  </p>
                </div>
              )}

              {/* kcal-shift recommendation. Two phases:
                  - reached: user has crossed the goal — suggest maintenance shift.
                  - adjust: user is mid-plan — shift needed to land on goal at weeksTarget.
                  Hidden when the shift is < 50 kcal/day (noise). */}
              {kcalAdjust && (
                <div
                  className="rounded border px-4 py-3"
                  style={{
                    borderColor: kcalAdjust.reached
                      ? 'var(--accent)'
                      : kcalAdjust.kcal < 0 ? 'var(--warn)' : 'var(--positive)',
                    background:  kcalAdjust.reached
                      ? 'rgba(79,195,247,0.06)'
                      : kcalAdjust.kcal < 0 ? 'rgba(255,181,71,0.06)' : 'rgba(109,255,153,0.06)',
                  }}
                >
                  <p className="font-mono text-[9px] font-bold tracking-[2px] uppercase mb-1.5"
                    style={{
                      color: kcalAdjust.reached
                        ? 'var(--accent)'
                        : kcalAdjust.kcal < 0 ? 'var(--warn)' : 'var(--positive)',
                    }}>
                    {kcalAdjust.reached ? 'Goal reached · maintain' : 'Recommended adjustment'}
                  </p>
                  <p className="font-mono text-[11px] text-[var(--ink-0)] tracking-[0.3px] leading-relaxed">
                    <span
                      className="font-display text-[18px] mr-1"
                      style={{
                        color: kcalAdjust.reached
                          ? 'var(--accent)'
                          : kcalAdjust.kcal < 0 ? 'var(--warn)' : 'var(--positive)',
                      }}
                    >
                      {kcalAdjust.kcal > 0 ? '+' : '−'}{fmt(Math.abs(kcalAdjust.kcal))}
                    </span>
                    kcal/day {kcalAdjust.reached
                      ? 'to hold current weight'
                      : `to hit goal in ${Math.ceil(kcalAdjust.weeksLeft)} wks`}
                  </p>
                  <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1 tracking-[0.3px]">
                    {kcalAdjust.reached
                      ? `You've passed your goal — current pace would drift past it. Eat ${kcalAdjust.kcal > 0 ? 'more' : 'less'} to hold.`
                      : kcalAdjust.kcal < 0
                        ? 'Eat less or add cardio to catch up'
                        : 'You can eat more — currently overshooting the plan'}
                  </p>
                </div>
              )}

              {/* Calorie compliance derived from logged calsEaten/budget per
                  day. Distinct from the time-based "Expected" stat above. */}
              {compliance && compliance.daysElapsed > 0 && (() => {
                // Direction colors: a real caloric deficit is good for cuts,
                // bad for bulks; vice versa for a surplus. Neutral when no
                // logged days or the balance is near zero.
                const dirColor = (signed: number): string => {
                  if (compliance.daysLogged === 0 || Math.abs(signed) < 0.01) return 'var(--ink-0)';
                  const isGood = plan!.type === 'cut' ? signed < 0 : signed > 0;
                  return isGood ? 'var(--positive)' : 'var(--warn)';
                };
                return (
                <div>
                  <p className="font-mono text-[9px] font-bold tracking-[2px] text-[var(--ink-3)] uppercase mb-2">
                    Calorie Ledger
                  </p>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {[
                      {
                        label: 'Logged',
                        value: `${compliance.daysLogged}/${compliance.daysElapsed}`,
                        sub:   `${compliance.daysElapsed > 0 ? Math.round((compliance.daysLogged / compliance.daysElapsed) * 100) : 0}%`,
                        color: 'var(--ink-0)',
                      },
                      {
                        label: 'On target',
                        value: `${compliance.daysOnTarget}`,
                        sub:   compliance.daysLogged > 0 ? `${Math.round((compliance.daysOnTarget / compliance.daysLogged) * 100)}% of logged` : '—',
                        color: compliance.daysOnTarget >= compliance.daysLogged / 2 ? 'var(--positive)' : 'var(--ink-0)',
                      },
                      {
                        label: 'Avg balance',
                        value: compliance.daysLogged > 0 ? `${compliance.avgDailyBalance > 0 ? '+' : ''}${fmt(Math.round(compliance.avgDailyBalance))}` : '—',
                        sub:   'kcal / day',
                        color: dirColor(compliance.avgDailyBalance),
                      },
                      {
                        label: 'By calories',
                        value: compliance.daysLogged > 0 ? sign(compliance.calorieBasedChange) : '—',
                        sub:   compliance.daysLogged > 0 ? 'lb implied' : '',
                        color: dirColor(compliance.calorieBasedChange),
                      },
                    ].map(s => (
                      <div key={s.label} className="rounded border border-[var(--line)] bg-[var(--bg-2)] p-2.5">
                        <p className="font-mono text-[8px] font-bold tracking-[1px] text-[var(--ink-3)] uppercase mb-0.5">{s.label}</p>
                        <p className="font-display text-[15px] leading-none" style={{ color: s.color }}>{s.value}</p>
                        {s.sub && <p className="font-mono text-[8px] text-[var(--ink-3)] mt-0.5">{s.sub}</p>}
                      </div>
                    ))}
                  </div>
                  <p className="font-mono text-[8px] text-[var(--ink-3)] tracking-[0.5px]">
                    Balance = calsEaten − maintenance. By-calories ≈ Σ balance / 3,500.
                  </p>
                </div>
                );
              })()}

              {weightEntries.length > 0 && (
                <div>
                  <p className="font-mono text-[9px] font-bold tracking-[2px] text-[var(--ink-3)] uppercase mb-2">Recent Weigh-ins</p>
                  <div className="rounded border border-[var(--line)] bg-[var(--bg-2)] divide-y divide-[var(--line)]">
                    {[...weightEntries].reverse().slice(0, 6).map((e, i, arr) => {
                      const prev = arr[i + 1];
                      // For the oldest entry in the visible 6, prev is undefined.
                      // Look up the chronologically previous entry from the full
                      // history (not just what's on-screen) so the delta reflects
                      // a true day-to-day change, not a months-long jump back to
                      // the plan baseline.
                      let priorWeight: number | null = null;
                      if (prev) {
                        priorWeight = prev.weight;
                      } else {
                        const idx = weightEntries.findIndex(x => x.date === e.date);
                        if (idx > 0) priorWeight = weightEntries[idx - 1].weight;
                      }
                      const delta  = priorWeight !== null ? e.weight - priorWeight : 0;
                      const isGood = plan!.type === 'cut' ? delta <= 0 : delta >= 0;
                      return (
                        <div key={e.date} className="flex items-center justify-between px-3 py-2">
                          <span className="font-mono text-[10px] text-[var(--ink-2)]">{fmtDateLong(e.date)}</span>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-[10px] font-bold text-[var(--ink-1)]">{e.weight.toFixed(1)} lb</span>
                            <span className="font-mono text-[9px] font-bold w-14 text-right"
                              style={{ color: delta === 0 ? 'var(--ink-3)' : isGood ? 'var(--positive)' : 'var(--danger)' }}>
                              {delta === 0 ? '—' : `${sign(delta)} lb`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="font-mono text-[8px] text-[var(--ink-3)] mt-1.5 tracking-[0.5px]">
                    Delta shown vs previous entry · missing days excluded
                  </p>
                </div>
              )}

              {weightEntries.length === 0 && (
                <div className="rounded border border-dashed border-[var(--line-2)] py-8 text-center">
                  <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[1px] uppercase">
                    No weight logged since plan started
                  </p>
                  <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1 tracking-[0.5px]">
                    Log weight in Today&apos;s Log to track progress
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PlanModal
// ─────────────────────────────────────────────────────────────────────────────

export function PlanModal({ open, onClose, profile, persistProfile, m, localDB, todayStr }: {
  open: boolean; onClose: () => void;
  profile: UserProfile;
  /** Persists profile changes (mirrors AppContext.persistProfile). Used on
   *  save to align profile.deficit with plan intent so the budget formula
   *  reflects the chosen surplus/deficit (avoids the "bulk-but-eating-at-a-deficit" trap). */
  persistProfile: (updates: Partial<UserProfile>) => void;
  m: BudgetMetrics;
  localDB: LocalDB;
  todayStr: string;
}) {
  const [planType,    setPlanType]    = useState<'cut' | 'bulk' | null>(null);
  const [intensity,   setIntensity]   = useState<PlanIntensity>('moderate');
  const [startWeight, setStartWeight] = useState('');
  const [goalMode,    setGoalMode]    = useState<'weight' | 'weeks'>('weight');
  const [goalWeight,  setGoalWeight]  = useState('');
  const [goalWeeks,   setGoalWeeks]   = useState('12');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) return;
    const saved = loadPlan();
    if (saved) {
      setPlanType(saved.type);
      setIntensity(saved.intensity ?? 'moderate');
      setStartWeight(String(saved.startWeight));
      setGoalWeight(String(saved.goalWeight));
      setGoalWeeks(String(saved.weeksTarget));
    } else {
      const tw = localDB[todayStr]?.weight ?? profile.weight;
      setStartWeight(String(tw || ''));
      setPlanType(null); setIntensity('moderate'); setGoalWeight(''); setGoalWeeks('12');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Goal direction sanity — independent of projData so we can surface a clear
  // error even when projData returns null. A cut requires the target weight
  // to be below the starting weight; a bulk requires above. Without this,
  // Math.abs in the weeks calc accepts any input and renders a chart whose
  // projection line moves the OPPOSITE direction of the goal — visually
  // contradictory and unrecoverable from the chart alone.
  const goalDirectionError = useMemo<'cut-goal-too-high' | 'bulk-goal-too-low' | null>(() => {
    if (!planType || goalMode !== 'weight') return null;
    const sw = parseNum(startWeight);
    const gw = parseNum(goalWeight);
    if (sw <= 0 || gw <= 0) return null;
    if (planType === 'cut'  && gw >= sw) return 'cut-goal-too-high';
    if (planType === 'bulk' && gw <= sw) return 'bulk-goal-too-low';
    return null;
  }, [planType, goalMode, startWeight, goalWeight]);

  const projData = useMemo(() => {
    if (!planType || !startWeight) return null;
    const sw = parseNum(startWeight);
    if (sw <= 0) return null;
    const kcal         = INTENSITY_KCAL[intensity];
    const cardioAdjust = m.activityBurn * 0.4;
    // Cut: cardio enlarges the deficit. Bulk: cardio shrinks the surplus (clamped ≥ 0
    // so a heavy-cardio user with a small surplus picks a higher intensity instead
    // of getting a nonsensical negative-rate "bulk").
    const effective = planType === 'cut'
      ? kcal + cardioAdjust
      : Math.max(0, kcal - cardioAdjust);
    const weeklyRate = planType === 'cut'
      ? -(effective * 7 / 3500)
      :  (effective * 7 / 3500);
    if (weeklyRate === 0) return null;
    let weeks: number; let gw: number; let weeksNeeded: number | null = null;
    if (goalMode === 'weight') {
      gw = parseNum(goalWeight); if (gw <= 0) return null;
      // Skip projection when the goal direction is wrong — the UI shows a
      // dedicated validation error instead.
      if (planType === 'cut'  && gw >= sw) return null;
      if (planType === 'bulk' && gw <= sw) return null;
      const raw   = Math.ceil(Math.abs((gw - sw) / weeklyRate));
      weeksNeeded = raw;
      weeks       = Math.max(1, Math.min(52, raw));
    } else {
      weeks = Math.max(1, parseInt(goalWeeks) || 12);
      gw    = sw + weeklyRate * weeks;
    }
    const pts = Array.from({ length: weeks + 1 }, (_, w) => sw + weeklyRate * w);
    // wasCapped: target requires >52 wks at chosen intensity. The chart only
    // shows the capped duration, so callers need to warn the user that the
    // goal won't actually be reached in this window.
    const wasCapped = weeksNeeded !== null && weeksNeeded > 52;
    // If capped, suggest the lowest intensity that *would* hit the goal in
    // ≤52 wks. The rate is (effective × 7 / 3500) where effective scales
    // linearly with the chosen kcal (cardio adjust is constant for the day).
    // Returns null if even the most aggressive setting can't fit.
    let suggestedIntensity: { level: PlanIntensity; weeks: number } | null = null;
    if (wasCapped && goalMode === 'weight') {
      const order: PlanIntensity[] = ['slight', 'moderate', 'aggressive'];
      const currentIdx = order.indexOf(intensity);
      for (let i = currentIdx + 1; i < order.length; i++) {
        const tryKcal = INTENSITY_KCAL[order[i]];
        const tryEff  = planType === 'cut'
          ? tryKcal + cardioAdjust
          : Math.max(0, tryKcal - cardioAdjust);
        if (tryEff <= 0) continue;
        const tryRate = tryEff * 7 / 3500; // unsigned magnitude
        const tryWks  = Math.ceil(Math.abs(gw - sw) / tryRate);
        if (tryWks <= 52) {
          suggestedIntensity = { level: order[i], weeks: tryWks };
          break;
        }
      }
    }
    return { pts, weeks, startWeight: sw, goalWeight: gw, weeklyRate, effective, kcal, cardioAdjust, weeksNeeded, wasCapped, suggestedIntensity };
  }, [planType, intensity, startWeight, goalMode, goalWeight, goalWeeks, m.activityBurn]);

  const actualData = useMemo(() => {
    const saved = loadPlan(); if (!saved) return [];
    return Object.entries(localDB)
      .filter(([ds, rec]) => rec.weight && ds >= saved.startDate)
      .map(([ds, rec]) => {
        const w = (new Date(ds + 'T00:00:00').getTime() - new Date(saved.startDate + 'T00:00:00').getTime()) / (7 * 86400000);
        return { week: w, weight: parseNum(String(rec.weight)) };
      }).filter(d => d.weight > 0 && d.week >= 0);
  }, [localDB]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !projData || !open) return;
    drawPlanChart(canvas, projData.pts, actualData, planType!, projData.goalWeight);
  }, [projData, actualData, open, planType]);

  const handleSave = useCallback(() => {
    if (!projData || !planType) return;
    const kcal = INTENSITY_KCAL[intensity];
    const isUpdate = !!loadPlan();
    savePlanToStorage({
      type: planType, intensity, dailyKcal: kcal,
      // Snapshot the activity burn used to derive the projection so progress
      // tracking can apply the same cardio adjustment via getEffectiveDailyKcal().
      creationActivityBurn: Math.round(m.activityBurn),
      startDate: todayStr,
      startWeight: projData.startWeight, goalWeight: projData.goalWeight,
      weeksTarget: projData.weeks,
    });
    trackEvent(isUpdate ? 'plan_updated' : 'plan_created', {
      type: planType,
      intensity,
      weeksTarget: projData.weeks,
    });
    // Align profile.deficit with plan intent. Cuts use a positive deficit
    // (budget = tdee − dailyKcal + eatBack), bulks store a negative value so
    // the same budget formula produces the intended surplus
    // (budget = tdee + dailyKcal + eatBack). Without this, a bulk user with
    // the default deficit=500 would be told to eat at a real deficit even
    // though the plan projects weight gain.
    persistProfile({ deficit: String(planType === 'cut' ? kcal : -kcal) });
    onClose();
  }, [projData, planType, intensity, m.activityBurn, todayStr, persistProfile, onClose]);

  const isValid = !!projData && !!planType;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[300] flex items-end md:items-center justify-center backdrop-blur-sm px-3 md:px-0"
          style={{ background: 'rgba(7,8,10,0.88)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="w-full md:max-w-[640px] max-h-[90dvh] flex flex-col rounded-t-lg md:rounded-lg border border-[var(--line-2)] bg-[var(--bg-1)]"
            initial={{ opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 48 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.6)' }}
          >
            <div className="overflow-y-auto flex-1 p-4 md:p-6 overscroll-contain">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-display text-[22px] md:text-[26px] tracking-[2px] uppercase text-[var(--ink-0)]">
                  Create Plan
                </h3>
                <button onClick={onClose} className="text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors p-1">
                  <X size={20} />
                </button>
              </div>

              <p className="que-label mb-2">Plan Type</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {(['cut', 'bulk'] as const).map(type => (
                  <button key={type} onClick={() => setPlanType(type)}
                    className={[
                      'flex flex-col gap-1 rounded border p-3 text-left transition-all',
                      planType === type
                        ? type === 'cut' ? 'border-[var(--accent)] bg-[var(--accent-12)]' : 'border-[var(--positive)] bg-[var(--positive-12)]'
                        : 'border-[var(--line-2)] bg-[var(--bg-2)] hover:border-[var(--line-3)]',
                    ].join(' ')}
                  >
                    <span className={[
                      'font-display text-[18px] uppercase tracking-[1px] leading-none',
                      planType === type ? (type === 'cut' ? 'text-[var(--accent)]' : 'text-[var(--positive)]') : 'text-[var(--ink-0)]',
                    ].join(' ')}>
                      {type === 'cut' ? '↓ Cut' : '↑ Bulk'}
                    </span>
                    <span className="font-mono text-[9px] text-[var(--ink-2)] tracking-[0.5px]">
                      {type === 'cut' ? 'Deficit · lose fat' : 'Surplus · build muscle'}
                    </span>
                  </button>
                ))}
              </div>

              {planType && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
                  <p className="que-label mb-2">Intensity</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['slight', 'moderate', 'aggressive'] as PlanIntensity[]).map(lvl => {
                      const label     = INTENSITY_LABELS[planType][lvl];
                      const kcal      = INTENSITY_KCAL[lvl];
                      const active    = intensity === lvl;
                      const accentCol = planType === 'cut' ? 'var(--accent)' : 'var(--positive)';
                      return (
                        <button key={lvl} onClick={() => setIntensity(lvl)}
                          className={[
                            'flex flex-col items-center gap-1 rounded border py-3 px-2 transition-all text-center',
                            active
                              ? planType === 'cut' ? 'border-[var(--accent)] bg-[var(--accent-12)]' : 'border-[var(--positive)] bg-[var(--positive-12)]'
                              : 'border-[var(--line-2)] bg-[var(--bg-2)] hover:border-[var(--line-3)]',
                          ].join(' ')}
                        >
                          <span className="font-display text-[22px] leading-none"
                            style={{ color: active ? accentCol : 'var(--ink-1)' }}>
                            {fmt(kcal)}
                          </span>
                          <span className="font-mono text-[8px] text-[var(--ink-3)] tracking-[0.5px] uppercase">kcal</span>
                          <span className="font-mono text-[8px] tracking-[0.5px] mt-0.5"
                            style={{ color: active ? accentCol : 'var(--ink-2)' }}>
                            {label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              <div className="mb-3">
                <label className="que-label">Starting Weight / lbs</label>
                <input type="number" inputMode="decimal" className="que-input"
                  value={startWeight} onChange={e => setStartWeight(e.target.value)} placeholder="lbs" />
              </div>

              <p className="que-label mb-2">Goal</p>
              <div className="flex bg-[var(--bg-2)] border border-[var(--line)] rounded-sm p-1 gap-0.5 mb-2">
                {(['weight', 'weeks'] as const).map(mode => (
                  <button key={mode} onClick={() => setGoalMode(mode)}
                    className={[
                      'flex-1 py-1.5 rounded-sm font-mono text-[10px] font-bold tracking-[1px] uppercase transition-all',
                      goalMode === mode ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--ink-2)] hover:text-[var(--ink-0)]',
                    ].join(' ')}
                  >
                    {mode === 'weight' ? 'Target Weight' : 'Time Period'}
                  </button>
                ))}
              </div>
              {goalMode === 'weight' ? (
                <div className="mb-4">
                  <label className="que-label">Goal Weight / lbs</label>
                  <input type="number" inputMode="decimal" className="que-input"
                    value={goalWeight} onChange={e => setGoalWeight(e.target.value)}
                    placeholder={planType === 'cut' ? 'e.g. 175' : 'e.g. 195'} />
                </div>
              ) : (
                <div className="mb-4">
                  <label className="que-label">Duration / weeks</label>
                  <input type="number" inputMode="numeric" className="que-input"
                    value={goalWeeks} onChange={e => setGoalWeeks(e.target.value)} placeholder="12" />
                </div>
              )}

              {projData && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {[
                      { label: 'Per Week', value: `${projData.weeklyRate > 0 ? '+' : ''}${Math.abs(projData.weeklyRate).toFixed(2)} lbs`, color: projData.weeklyRate < 0 ? 'var(--accent)' : 'var(--positive)' },
                      { label: 'Duration', value: `${projData.weeks} wks`, color: 'var(--ink-0)' },
                      { label: 'Goal',     value: `${projData.goalWeight.toFixed(1)} lb`, color: 'var(--ink-0)' },
                    ].map(s => (
                      <div key={s.label} className="rounded border border-[var(--line)] bg-[var(--bg-2)] p-2.5 md:p-3">
                        <p className="font-mono text-[8px] md:text-[9px] font-bold tracking-[1px] text-[var(--ink-3)] uppercase mb-1">{s.label}</p>
                        <p className="font-display text-[15px] md:text-[18px] leading-none" style={{ color: s.color }}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {m.activityBurn > 0 && projData && (
                    <div className="flex items-center gap-2 rounded border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2">
                      <span
                        className="block w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: planType === 'cut' ? 'var(--positive)' : 'var(--warn)' }}
                      />
                      <p className="font-mono text-[9px] text-[var(--ink-1)] tracking-[0.5px]">
                        {planType === 'cut' ? (
                          <>
                            <span className="text-[var(--positive)] font-bold">+{fmt(Math.round(projData.cardioAdjust))} kcal/day</span>{' '}
                            cardio adds to deficit — {fmt(projData.kcal)} base + 40% of {fmt(Math.round(m.activityBurn))} cardio = {fmt(Math.round(projData.effective))} eff.
                          </>
                        ) : (
                          <>
                            <span className="text-[var(--warn)] font-bold">−{fmt(Math.round(projData.cardioAdjust))} kcal/day</span>{' '}
                            cardio reduces surplus — {fmt(projData.kcal)} base − 40% of {fmt(Math.round(m.activityBurn))} cardio = {fmt(Math.round(projData.effective))} eff.
                          </>
                        )}
                      </p>
                    </div>
                  )}

                  {projData.wasCapped && (
                    <div className="mt-2 rounded border border-[var(--warn)]/40 bg-[var(--warn)]/8 px-3 py-2">
                      <div className="flex items-start gap-2">
                        <span className="block w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: 'var(--warn)' }} />
                        <p className="font-mono text-[9px] text-[var(--warn)] tracking-[0.5px] leading-relaxed">
                          Goal needs ~{projData.weeksNeeded} wks at this intensity — capped at 52 wks.
                          {projData.suggestedIntensity ? (
                            <>
                              {' '}<button
                                type="button"
                                onClick={() => setIntensity(projData.suggestedIntensity!.level)}
                                className="underline underline-offset-2 hover:text-[var(--ink-0)] transition-colors font-bold"
                              >
                                Switch to {INTENSITY_LABELS[planType!][projData.suggestedIntensity.level]}
                              </button>{' '}
                              to reach goal in ~{projData.suggestedIntensity.weeks} wks.
                            </>
                          ) : (
                            <> Even the most aggressive intensity can&apos;t fit in 52 wks — pick a closer target weight.</>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {projData ? (
                <div className="mb-4">
                  <p className="que-label mb-2">Projected Progression</p>
                  <canvas ref={canvasRef} className="block w-full h-[150px] md:h-[180px] rounded" />
                  {actualData.length > 0 && (
                    <div className="flex gap-3 mt-2 justify-center flex-wrap">
                      {[['var(--positive)', 'Ahead'], ['var(--danger)', 'Behind'], ['var(--accent)', 'Projected']].map(([col, label]) => (
                        <span key={label} className="flex items-center gap-1.5 font-mono text-[9px] text-[var(--ink-2)] tracking-[0.5px]">
                          <span className="block w-2 h-2 rounded-full flex-shrink-0" style={{ background: col }} /> {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : goalDirectionError ? (
                <div className="mb-4 rounded border border-[var(--danger)]/40 bg-[var(--danger)]/8 px-3 py-3">
                  <p className="font-mono text-[10px] text-[var(--danger)] tracking-[0.5px] leading-relaxed">
                    {goalDirectionError === 'cut-goal-too-high'
                      ? `Cut goal must be lower than starting weight. Set a target below ${parseNum(startWeight).toFixed(1)} lb, or switch to Bulk.`
                      : `Bulk goal must be higher than starting weight. Set a target above ${parseNum(startWeight).toFixed(1)} lb, or switch to Cut.`}
                  </p>
                </div>
              ) : planType === 'bulk' && m.activityBurn * 0.4 >= INTENSITY_KCAL[intensity] ? (
                <div className="mb-4 rounded border border-[var(--warn)]/40 bg-[var(--warn)]/8 px-3 py-3">
                  <p className="font-mono text-[10px] text-[var(--warn)] tracking-[0.5px] leading-relaxed">
                    Cardio burn of {fmt(Math.round(m.activityBurn))} kcal/day cancels out the
                    {' '}{fmt(INTENSITY_KCAL[intensity])} kcal surplus (40% of cardio counts against surplus).
                    Pick a higher intensity or reduce logged cardio to enable this bulk.
                  </p>
                </div>
              ) : planType && (
                <div className="mb-4 rounded border border-dashed border-[var(--line-2)] py-8 text-center">
                  <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[1px] uppercase">
                    Fill in your goal to see the projection
                  </p>
                </div>
              )}

              {actualData.length > 0 && projData && (() => {
                const latest = actualData[actualData.length - 1].weight;
                const delta  = latest - projData.startWeight;
                const isGood = planType === 'cut' ? delta <= 0 : delta >= 0;
                return (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="mb-4 rounded border border-[var(--line)] bg-[var(--bg-2)] p-4"
                  >
                    <h4 className="que-section-label mb-3"><span className="dot" />CURRENT PROGRESS</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="font-mono text-[9px] tracking-[1.5px] text-[var(--ink-3)] uppercase mb-1">Latest Weight</p>
                        <p className="font-display text-[24px] text-[var(--ink-0)] leading-none">
                          {latest.toFixed(1)}<span className="font-mono text-[12px] text-[var(--ink-2)] ml-1">lbs</span>
                        </p>
                      </div>
                      <div>
                        <p className="font-mono text-[9px] tracking-[1.5px] text-[var(--ink-3)] uppercase mb-1">
                          Total {planType === 'cut' ? 'Lost' : 'Gained'}
                        </p>
                        <p className="font-display text-[24px] leading-none" style={{ color: isGood ? 'var(--positive)' : 'var(--danger)' }}>
                          {delta > 0 ? '+' : ''}{delta.toFixed(1)}<span className="font-mono text-[12px] text-[var(--ink-2)] ml-1">lbs</span>
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })()}
            </div>

            <div
              className="flex-shrink-0 px-4 pt-4 md:px-6 md:pt-6 border-t border-[var(--line)] bg-[var(--bg-1)]"
              style={{ paddingBottom: 'max(16px, calc(12px + env(safe-area-inset-bottom)))' }}
            >
              <button onClick={handleSave} disabled={!isValid} className="que-btn-primary w-full py-4">
                {loadPlan() ? 'Update Plan' : 'Save Plan'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProjectionModal
// ─────────────────────────────────────────────────────────────────────────────

export function ProjectionModal({ open, m, weightLbs, calsEaten, localDB, onClose }: {
  open: boolean; m: BudgetMetrics; weightLbs: number;
  calsEaten: number; localDB: LocalDB; onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ptsRef    = useRef<number[]>([]);
  const [selDay, setSelDay] = useState<number | null>(null);

  const plan = open ? loadPlan() : null;

  const hasEaten   = calsEaten > 0 && m.budget > 0;
  const isCut      = !plan || plan.type === 'cut';
  const overBudget = hasEaten && calsEaten > m.budget;
  const productive = hasEaten && (isCut ? calsEaten <= m.budget : calsEaten >= m.budget * 0.9);
  const budgetGap  = m.budget - calsEaten;

  const { latestWeight, status: planStatus, weeksSince } = useMemo(() => {
    if (!plan || !open) return { latestWeight: null, status: 'no-data', weeksSince: 0 };
    // Filter to plan window — pre-plan weights aren't current progress.
    const entries = (Object.entries(localDB) as [string, DayRecord][])
      .filter(([ds, r]) => ds >= plan.startDate && parseNum(String(r.weight ?? '0')) > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, r]) => parseNum(String(r.weight)));
    const latest = entries.length > 0 ? entries[entries.length - 1] : null;
    const wks = Math.max(0, (Date.now() - new Date(plan.startDate + 'T00:00:00').getTime()) / (7 * 86400000));
    const eff  = getEffectiveDailyKcal(plan);
    const rate = plan.type === 'cut' ? -(eff * 7 / 3500) : (eff * 7 / 3500);
    const exp  = rate * wks;
    const base = getPlanBaseline(plan, localDB);
    const act  = latest !== null ? latest - base : null;
    let st = 'no-data';
    if (act !== null && wks >= 0.5 && Math.abs(exp) > 0.05) {
      const thr = Math.abs(exp) * 0.2, d = act - exp;
      st = plan.type === 'cut' ? (d < -thr ? 'ahead' : d > thr ? 'behind' : 'on-track')
                                : (d > thr  ? 'ahead' : d < -thr ? 'behind' : 'on-track');
    } else if (act !== null) { st = 'on-track'; }
    return { latestWeight: latest, status: st, weeksSince: wks };
  }, [plan, localDB, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const trajectory = useMemo(() => {
    if (!plan || !hasEaten || !m.tdee || weightLbs <= 0) return null;
    const dailyBalance = calsEaten - (m.tdee + m.activityBurn);
    const lbsPerDay    = dailyBalance / 3500;
    const remaining    = plan.type === 'cut'
      ? (latestWeight ?? weightLbs) - plan.goalWeight
      : plan.goalWeight - (latestWeight ?? weightLbs);
    const movingRight  = plan.type === 'cut' ? lbsPerDay < 0 : lbsPerDay > 0;
    if (!movingRight || remaining <= 0) return { movingRight: false as const, weeks: 0, label: '' };
    const weeks = remaining / (Math.abs(lbsPerDay) * 7);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + Math.round(weeks * 7));
    return {
      movingRight: true as const,
      weeks,
      label: `${MONTHS[targetDate.getMonth()].slice(0, 3)} ${targetDate.getFullYear()}`,
    };
  }, [plan, hasEaten, m, weightLbs, calsEaten, latestWeight]); // eslint-disable-line react-hooks/exhaustive-deps

  const statusColor = { ahead: 'var(--positive)', 'on-track': 'var(--accent)', behind: 'var(--warn)', 'no-data': 'var(--ink-3)' }[planStatus] ?? 'var(--ink-3)';
  const statusLabel = { ahead: 'Ahead of pace', 'on-track': 'On track', behind: 'Behind pace', 'no-data': '' }[planStatus] ?? '';

  const [weight30, setWeight30] = useState<number | null>(null);

  useEffect(() => {
    if (!open || weightLbs <= 0) return;
    const dailyNet  = calsEaten > 0
      ? calsEaten - (m.tdee + m.activityBurn)
      : (m.budget - m.tdee) - m.activityBurn;
    const lbsPerDay = dailyNet / 3500;
    const pts = Array.from({ length: 36 }, (_, i) => weightLbs + lbsPerDay * i);
    ptsRef.current = pts;
    setWeight30(pts[30]);
    setSelDay(null);
  }, [open, m, weightLbs, calsEaten]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open || weightLbs <= 0) return;
    drawProjection(canvas, weightLbs, m, calsEaten, selDay);
  }, [open, m, weightLbs, calsEaten, selDay]);

  const handleInteraction = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !ptsRef.current.length) return;
    const rect = canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const W    = canvas.offsetWidth || 300;
    const raw  = Math.round((cssX - 52) / (W - 52 - 16) * 35);
    const day  = Math.max(0, Math.min(35, raw));
    setSelDay(Math.min(Math.round(day / 7) * 7, 35));
  }, []);

  const info = selDay !== null ? (() => {
    const wt   = ptsRef.current[selDay] ?? weightLbs;
    const week = Math.round(selDay / 7);
    const d    = new Date(); d.setDate(d.getDate() + selDay);
    return { wt, week, date: `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`, delta: wt - weightLbs };
  })() : null;

  const projDelta30 = weight30 !== null ? weight30 - weightLbs : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[300] flex items-end md:items-center justify-center backdrop-blur-sm px-3 md:px-0"
          style={{ background: 'rgba(7,8,10,0.88)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="w-full md:max-w-[620px] rounded-t-lg md:rounded-lg border border-[var(--line-2)] bg-[var(--bg-1)] p-4 md:p-6"
            initial={{ opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 48 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.6)' }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-mono text-[9px] font-bold tracking-[3px] text-[var(--positive)] uppercase mb-1">
                  ✓ Session Logged
                </p>
                <h3 className="font-display text-[22px] md:text-[26px] tracking-[2px] uppercase text-[var(--ink-0)] leading-none">
                  Weight Projection
                </h3>
              </div>
              <button onClick={onClose} className="text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors p-1 flex-shrink-0 -mt-1 ml-3">
                <X size={20} />
              </button>
            </div>

            {hasEaten && (
              <div
                className="mb-3 rounded p-3 flex items-center justify-between gap-3"
                style={{
                  border: `1px solid ${productive ? 'rgba(109,255,153,0.3)' : 'rgba(255,77,94,0.3)'}`,
                  background: productive ? 'rgba(109,255,153,0.05)' : 'rgba(255,77,94,0.05)',
                }}
              >
                <div>
                  <p className="font-mono text-[8px] font-bold tracking-[2px] uppercase mb-1"
                    style={{ color: productive ? 'var(--positive)' : 'var(--danger)' }}>
                    {productive ? '● Productive Day' : overBudget ? '● Over Budget' : '● Under Target'}
                  </p>
                  <p className="font-mono text-[10px] text-[var(--ink-2)]">
                    {fmt(calsEaten)} eaten · {fmt(m.budget)} budget
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono text-[11px] font-bold"
                    style={{ color: productive ? 'var(--positive)' : 'var(--danger)' }}>
                    {budgetGap >= 0 ? `−${fmt(budgetGap)}` : `+${fmt(-budgetGap)}`}
                  </p>
                  <p className="font-mono text-[8px] text-[var(--ink-3)] tracking-[0.5px]">
                    {budgetGap >= 0 ? 'under' : 'over'}
                  </p>
                </div>
              </div>
            )}

            {plan && (
              <div className="mb-3 rounded border border-[var(--line-2)] bg-[var(--bg-2)] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[8px] font-bold tracking-[2px] text-[var(--ink-3)] uppercase">
                    Plan · Wk {Math.ceil(weeksSince)} of {plan.weeksTarget}
                  </p>
                  {planStatus !== 'no-data' && (
                    <span className="font-mono text-[8px] font-bold tracking-[1px] uppercase"
                      style={{ color: statusColor }}>{statusLabel}</span>
                  )}
                </div>

                {trajectory ? (
                  trajectory.movingRight ? (
                    <div className="flex items-baseline justify-between">
                      <p className="font-mono text-[9px] text-[var(--ink-3)]">At today&apos;s pace</p>
                      <p className="font-mono text-[11px] font-bold text-[var(--ink-0)]">
                        Goal in{' '}
                        <span style={{ color: statusColor }}>
                          {trajectory.weeks < 52
                            ? `${Math.round(trajectory.weeks)} wks`
                            : `${(trajectory.weeks / 52).toFixed(1)} yrs`}
                        </span>
                        {' · '}{trajectory.label}
                      </p>
                    </div>
                  ) : (
                    <p className="font-mono text-[9px]" style={{ color: 'var(--warn)' }}>
                      At today&apos;s intake you are moving away from your {plan.type} goal.
                    </p>
                  )
                ) : hasEaten ? null : (
                  <p className="font-mono text-[9px] text-[var(--ink-3)]">
                    Log calories to see your pace to goal.
                  </p>
                )}
              </div>
            )}

            {weight30 !== null && weightLbs > 0 && projDelta30 !== null && (
              <div className="mb-3 rounded border border-[var(--line-2)] bg-[var(--bg-2)] px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[8px] font-bold tracking-[2.5px] text-[var(--ink-3)] uppercase mb-1">
                    In 30 Days
                  </p>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="font-display text-[32px] leading-none"
                      style={{ color: projDelta30 <= 0 ? 'var(--accent)' : 'var(--danger)' }}
                    >
                      {weight30.toFixed(1)}
                    </span>
                    <span className="font-display text-[16px] text-[var(--ink-2)]">lbs</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p
                    className="font-display text-[26px] leading-none"
                    style={{ color: projDelta30 <= 0 ? 'var(--accent)' : 'var(--danger)' }}
                  >
                    {projDelta30 > 0 ? '+' : ''}{projDelta30.toFixed(1)}
                  </p>
                  <p className="font-mono text-[8px] text-[var(--ink-3)] tracking-[0.5px] mt-0.5">lbs change</p>
                </div>
              </div>
            )}

            <AnimatePresence mode="wait">
              {info ? (
                <motion.div
                  key={selDay}
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="mb-4 rounded border border-[var(--accent)] bg-[var(--accent-12)] px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-mono text-[9px] font-bold tracking-[2px] text-[var(--accent)] uppercase mb-1.5">
                      Week {info.week} · {info.date}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display tabular text-[36px] leading-none text-[var(--ink-0)]"
                        style={{ textShadow: '0 0 20px var(--accent-40)' }}>
                        {info.wt.toFixed(1)}
                      </span>
                      <span className="font-display text-[18px] text-[var(--ink-2)]">lbs</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-display text-[24px] leading-none ${info.delta <= 0 ? 'text-[var(--positive)]' : 'text-[var(--danger)]'}`}>
                      {info.delta > 0 ? '+' : ''}{info.delta.toFixed(1)}
                    </p>
                    <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1 tracking-[1px] uppercase">lbs from now</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="mb-4 rounded border border-[var(--line-2)] bg-[var(--bg-2)] px-4 py-3 text-center"
                >
                  <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[1px] uppercase">
                    Tap the chart to see weekly projections
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {weightLbs > 0 ? (
              <canvas
                ref={canvasRef}
                className="block w-full h-[200px] rounded cursor-crosshair"
                style={{ touchAction: 'none' }}
                onClick={e => handleInteraction(e.clientX)}
                onTouchStart={e => { e.preventDefault(); handleInteraction(e.touches[0].clientX); }}
                onTouchMove={e => { e.preventDefault(); handleInteraction(e.touches[0].clientX); }}
              />
            ) : (
              <div className="h-[200px] flex items-center justify-center rounded border border-dashed border-[var(--line-2)]">
                <p className="font-mono text-[11px] text-[var(--ink-3)] tracking-[1px] uppercase text-center px-4">
                  Log your weight to see the projection
                </p>
              </div>
            )}

            <p className="mt-3 font-mono text-[9px] text-[var(--ink-3)] text-center tracking-[1px] uppercase">
              3,500 kcal ≈ 1 lb · 60% of cardio is eaten back; 40% counts as deficit
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
