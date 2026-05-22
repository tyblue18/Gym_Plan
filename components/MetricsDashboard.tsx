'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity, BarChart2, ChevronRight, Flame, Plus, Scale, TrendingUp, User, X,
} from 'lucide-react';
import {
  useApp, MONTHS,
  type DayRecord, type UserProfile,
} from '@/lib/AppContext';
import { ActivityIcon } from '@/components/ActivityIcon';
import { useSpotlightBorder } from '@/hooks/useSpotlightBorder';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface CardioFields {
  steps: string; runDist: string; runTime: string;
  bikeDist: string; bikeTime: string; swimTime: string;
}
const EMPTY_CARDIO: CardioFields = {
  steps: '0', runDist: '0', runTime: '0',
  bikeDist: '0', bikeTime: '0', swimTime: '0',
};

function ordinal(n: number): string {
  const v = n % 100; const s = ['th','st','nd','rd'];
  return n + (s[(v-20)%10] ?? s[v] ?? s[0]);
}
function fmtDateLong(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${MONTHS[d.getMonth()]} ${ordinal(d.getDate())}, ${d.getFullYear()}`;
}
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseNum(v: string | number | undefined): number {
  return parseFloat(String(v ?? '0')) || 0;
}
function fmt(n: number): string { return Math.round(n).toLocaleString(); }

// ─────────────────────────────────────────────────────────────────────────────
// ATHLETE PLAN — storage + types
// ─────────────────────────────────────────────────────────────────────────────

type PlanIntensity = 'slight' | 'moderate' | 'aggressive';

const INTENSITY_KCAL: Record<PlanIntensity, number> = {
  slight:     250,
  moderate:   500,
  aggressive: 1000,
};

const INTENSITY_LABELS: Record<'cut' | 'bulk', Record<PlanIntensity, string>> = {
  cut:  { slight: 'Slight Deficit', moderate: 'Cut',  aggressive: 'Aggressive Cut'  },
  bulk: { slight: 'Lean Bulk',      moderate: 'Bulk', aggressive: 'Dirty Bulk'       },
};

interface AthletePlan {
  type:      'cut' | 'bulk';
  intensity: PlanIntensity;
  dailyKcal: number;        // kcal deficit (cut) or surplus (bulk)
  startDate:   string;      // YYYY-MM-DD
  startWeight: number;      // lbs
  goalWeight:  number;      // lbs
  weeksTarget: number;
}

const PLAN_KEY = 'queAthletePlan';

function loadPlan(): AthletePlan | null {
  try { const r = localStorage.getItem(PLAN_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function savePlanToStorage(p: AthletePlan) {
  try { localStorage.setItem(PLAN_KEY, JSON.stringify(p)); } catch { /* noop */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// CALCULATION ENGINE 
// ─────────────────────────────────────────────────────────────────────────────

interface BudgetMetrics {
  bmr: number; tdee: number; deficit: number; multiplier: number;
  stepMiles: number; stepBurn: number;
  runBurn: number; runPaceStr: string; runSpeed: number;
  bikeBurn: number; bikeSpeed: number;
  swimBurn: number;
  activityBurn: number; eatBack: number; budget: number;
}

function useBudgetMetrics(profile: UserProfile, cardio: CardioFields): BudgetMetrics {
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

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — StepSyncPanel
// Google Fit — connects once, syncs nightly via cron.
// ─────────────────────────────────────────────────────────────────────────────

function StepSyncPanel() {
  const { updateDayRecord, todayStr } = useApp();

  const [gStatus, setGStatus] = useState<'checking' | 'connected' | 'disconnected' | 'error'>('checking');
  const [gSteps,  setGSteps]  = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/health/google-fit/steps?date=${todayStr}`, { credentials: 'include' })
      .then(r => {
        if (r.status === 404) { setGStatus('disconnected'); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d: { steps: number } | null) => {
        if (!d) return;
        setGStatus('connected');
        if (d.steps) { setGSteps(d.steps); updateDayRecord(todayStr, { steps: d.steps }); }
      })
      .catch(() => setGStatus('error'));
  }, [todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncNow = useCallback(async () => {
    setGStatus('checking');
    try {
      const res = await fetch(`/api/health/google-fit/steps?date=${todayStr}`, { credentials: 'include' });
      if (res.status === 404) { window.location.href = '/api/health/google-fit/connect'; return; }
      const data = await res.json() as { steps: number };
      setGSteps(data.steps);
      updateDayRecord(todayStr, { steps: data.steps });
      setGStatus('connected');
    } catch { setGStatus('error'); }
  }, [todayStr, updateDayRecord]);

  return (
    <div className="mt-4 pt-4 border-t border-[var(--line)]">
      <div className="rounded border border-[var(--line)] bg-[var(--bg-2)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="font-mono text-[10px] font-bold tracking-[1.5px] text-[var(--ink-1)] uppercase">Google Fit</span>
              {gStatus === 'connected' && (
                <span className="font-mono text-[8px] font-bold tracking-[1px] uppercase text-[var(--positive)] border border-[var(--positive)]/40 rounded-sm px-1.5 py-0.5">
                  Auto ✓
                </span>
              )}
            </div>
            <p className="font-mono text-[9px] text-[var(--ink-3)] tracking-[0.3px]">
              {gStatus === 'connected'
                ? gSteps !== null
                  ? `${gSteps.toLocaleString()} steps today · syncs nightly at 2 am UTC`
                  : 'Connected · syncs nightly at 2 am UTC'
                : gStatus === 'disconnected'
                ? 'Connect once — steps sync automatically every night'
                : gStatus === 'checking'
                ? 'Checking…'
                : 'Could not reach Google Fit'}
            </p>
          </div>

          {gStatus === 'disconnected' ? (
            <button onClick={() => { window.location.href = '/api/health/google-fit/connect'; }}
              className="flex-shrink-0 font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--accent)] border border-[var(--accent)]/50 rounded-sm px-2.5 py-1.5 hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] transition-all">
              Connect
            </button>
          ) : (
            <button onClick={syncNow} disabled={gStatus === 'checking'}
              className="flex-shrink-0 font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--ink-2)] border border-[var(--line-2)] rounded-sm px-2.5 py-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all disabled:opacity-40">
              {gStatus === 'checking' ? '…' : 'Sync now'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — ProfilePanel
// ─────────────────────────────────────────────────────────────────────────────

function ProfilePanel({ profile, onChange, onOpenPlan }: {
  profile: UserProfile;
  onChange: (updates: Partial<UserProfile>) => void;
  onOpenPlan: () => void;
}) {
  const activityOptions = [
    { value: '1.20', label: 'Desk job, no gym (×1.20)' },
    { value: '1.30', label: 'Desk job + light activity (×1.30)' },
    { value: '1.40', label: 'Desk + gym 3×/wk (×1.40)' },
    { value: '1.45', label: 'Desk + gym 4–5×/wk (×1.45)' },
    { value: '1.55', label: 'Active job + gym 4–5×/wk (×1.55)' },
    { value: '1.65', label: 'Physical job + heavy daily (×1.65)' },
  ];

  return (
    <div className="que-card que-card-accent mb-4">
      <div className="p-5">
        <h2 className="que-section-label mb-4"><span className="dot" />ATHLETE PROFILE</h2>

        <div className="mb-4 font-mono text-[11px] text-[var(--ink-1)] bg-[var(--bg-2)] border-l-2 border-[var(--accent)] rounded-sm px-4 py-3 leading-relaxed tracking-[0.5px]">
          Set <strong className="text-[var(--accent)]">Activity Level</strong> to match your typical week (lifting only — cardio is tracked separately).{' '}
          <span className="text-[var(--ink-2)]">Budget = TDEE − Deficit + 60% eat-back.</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Weight / lbs', field: 'weight' as const },
            { label: 'Height / in',  field: 'height' as const },
            { label: 'Age',          field: 'age'    as const },
          ].map(({ label, field }) => (
            <div key={field}>
              <label className="que-label">{label}</label>
              <input
                type="number" className="que-input"
                value={profile[field]}
                onChange={e => onChange({ [field]: e.target.value })}
              />
            </div>
          ))}

          <div>
            <label className="que-label">Sex</label>
            <select
              className="que-input cursor-pointer"
              value={profile.sex}
              onChange={e => onChange({ sex: e.target.value as 'male' | 'female' })}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          <div>
            <label className="que-label">Deficit / kcal</label>
            <input
              type="number" className="que-input"
              value={profile.deficit}
              onChange={e => onChange({ deficit: e.target.value })}
            />
          </div>

          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <label className="que-label">Lifestyle</label>
            <select
              className="que-input cursor-pointer"
              value={profile.activityLevel}
              onChange={e => onChange({ activityLevel: e.target.value })}
            >
              {activityOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end mt-4 pt-4 border-t border-[var(--line)]">
          <button onClick={onOpenPlan} className="que-btn-ghost flex items-center gap-2">
            <Plus size={13} /> Create Plan
          </button>
        </div>

        <StepSyncPanel />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — CalorieBudgetCard
// ─────────────────────────────────────────────────────────────────────────────

function CalorieBudgetCard({ m }: { m: BudgetMetrics }) {
  const spotlight = useSpotlightBorder({ color: '79,195,247', size: 280, opacity: 0.55 });

  const tiles = [
    { label: 'RUN',  value: m.runBurn,  key: 'run' },
    { label: 'BIKE', value: m.bikeBurn, key: 'bike' },
    { label: 'SWIM', value: m.swimBurn, key: 'swim' },
    { label: 'STEPS', value: m.stepBurn, key: 'step', dim: true },
  ];

  return (
    <div
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      onMouseLeave={spotlight.onMouseLeave}
      onTouchMove={spotlight.onTouchMove}
      onTouchEnd={spotlight.onTouchEnd}
      className="que-card que-card-accent mb-4"
    >
      {spotlight.Overlay}
      <div className="p-5">
        <h2 className="que-section-label mb-5"><span className="dot" />CALORIE BUDGET</h2>

        {/* Hero — oversized telemetry */}
        <div className="relative rounded p-6 mb-4 bg-[var(--bg-2)] border border-[var(--line)] overflow-hidden">
          <span
            className="absolute left-0 right-0 bottom-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }}
          />
          <span className="absolute top-3 left-5 font-mono text-[9px] tracking-[3px] text-[var(--ink-3)] uppercase">
            ◐ DAILY TARGET
          </span>
          <span className="absolute top-3 right-5 font-mono text-[9px] tracking-[3px] text-[var(--accent)] uppercase">
            LIVE
          </span>

          <div className="mt-6 flex items-end gap-3">
            <span
              className="font-display tabular leading-none text-[var(--accent)] text-[96px] sm:text-[120px] lg:text-[140px]"
              style={{ textShadow: '0 0 40px var(--accent-40)', letterSpacing: '-0.04em' }}
            >
              {fmt(m.budget)}
            </span>
            <span className="font-display text-[24px] tracking-[3px] uppercase text-[var(--ink-2)] pb-3">
              kcal
            </span>
          </div>

          <p className="mt-3 font-mono text-[11px] text-[var(--ink-3)] tracking-[1px]">
            {`${fmt(m.tdee)} − ${fmt(m.deficit)}${m.eatBack > 0 ? ` + ${fmt(m.eatBack)}` : ''} = ${fmt(m.budget)} kcal`}
          </p>
        </div>

        {/* Math breakdown — telemetry strip */}
        <div className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-4 mb-4">
          {([
            { label: 'BMR (Mifflin-St Jeor)', value: `${fmt(m.bmr)} kcal`,           indent: false, bold: false },
            { label: '× Activity Multiplier',  value: `× ${m.multiplier}`,             indent: true,  bold: false },
            { label: '= Maintenance (TDEE)',   value: `${fmt(m.tdee)} kcal`,           indent: false, bold: true  },
            null,
            { label: '− Deficit Goal',         value: `−${fmt(m.deficit)} kcal`,       indent: false, bold: false, red: true },
            { label: 'Tracked cardio burn',    value: m.activityBurn > 0 ? `${fmt(m.activityBurn)} kcal` : '— kcal', indent: true, bold: false, accent: true },
            { label: 'Run',  value: m.runBurn  > 0 ? `${fmt(m.runBurn)}  kcal` : '—', indent: true,  bold: false, icon: 'run'  as const, iconActive: m.runBurn  > 0 },
            { label: 'Bike', value: m.bikeBurn > 0 ? `${fmt(m.bikeBurn)} kcal` : '—', indent: true,  bold: false, icon: 'bike' as const, iconActive: m.bikeBurn > 0 },
            { label: 'Swim', value: m.swimBurn > 0 ? `${fmt(m.swimBurn)} kcal` : '—', indent: true,  bold: false, icon: 'swim' as const, iconActive: m.swimBurn > 0 },
            { label: '+ 60% Eat-Back',         value: m.eatBack > 0 ? `+${fmt(m.eatBack)} kcal` : '+0 kcal', indent: false, bold: false, green: true },
          ] as const).map((row, i) => {
            if (row === null) {
              return <hr key={i} className="my-1 border-0 h-px bg-[var(--line)]" />;
            }
            const hasIcon = 'icon' in row;
            return (
              <div key={i} className="flex justify-between items-center py-2 border-b border-[var(--line)] last:border-b-0">
                <span className={[
                  'flex items-center gap-2 font-mono text-[11px] tracking-[0.5px]',
                  row.indent ? 'pl-4 text-[var(--ink-3)]' : 'text-[var(--ink-1)]',
                  row.bold   ? '!text-[12px] !font-bold !text-[var(--ink-0)] uppercase tracking-[1px]' : '',
                ].join(' ')}>
                  {hasIcon && (
                    <ActivityIcon
                      kind={(row as { icon: 'run'|'bike'|'swim' }).icon}
                      active={(row as { iconActive: boolean }).iconActive}
                      size={24}
                    />
                  )}
                  {row.label}
                </span>
                <span className={[
                  'font-mono font-bold tabular text-[13px]',
                  row.indent ? 'text-[11px] text-[var(--ink-3)]' : 'text-[var(--ink-0)]',
                  row.bold   ? '!text-[16px] !text-[var(--ink-0)]' : '',
                  'red'    in row && row.red    ? '!text-[var(--danger)]'   : '',
                  'accent' in row && row.accent ? '!text-[var(--accent)]'   : '',
                  'green'  in row && row.green  ? '!text-[var(--positive)]' : '',
                  hasIcon && (row as { iconActive: boolean }).iconActive ? '!text-[var(--positive)]' : '',
                ].join(' ')}>
                  {row.value}
                </span>
              </div>
            );
          })}
        </div>

        {/* Per-activity burn tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {tiles.map(t => {
            const lit = !t.dim && t.value > 0;
            return (
              <div
                key={t.key}
                className={[
                  'relative rounded p-3 border overflow-hidden',
                  t.dim ? 'border-[var(--line)] bg-[var(--bg-2)] opacity-60'
                    : lit ? 'border-[var(--positive)]/40'
                    : 'border-[var(--line-2)] bg-[var(--bg-2)] hover:border-[var(--accent)] transition-all',
                ].join(' ')}
                style={lit ? {
                  background: 'rgba(109,255,153,0.05)',
                  animation:  'tile-glow-pulse 2.8s ease-in-out infinite',
                } : undefined}
              >
                {/* One-shot green flash on activation */}
                {lit && (
                  <span
                    key={`flash-${t.key}-active`}
                    className="absolute inset-0 pointer-events-none rounded"
                    style={{ animation: 'tile-activate 1s ease-out forwards' }}
                  />
                )}

                <div className="flex items-center justify-between mb-2">
                  <p className="font-mono text-[9px] font-bold tracking-[2px] text-[var(--ink-3)]">
                    {t.label}
                  </p>
                  {!t.dim && (
                    <ActivityIcon kind={t.key as 'run' | 'bike' | 'swim'} active={lit} size={28} />
                  )}
                </div>
                <p
                  className="font-display tabular leading-none text-[26px]"
                  style={{
                    color:      t.dim ? 'var(--ink-3)' : lit ? 'var(--positive)' : 'var(--accent)',
                    textShadow: t.dim || !lit ? 'none' : '0 0 16px rgba(109,255,153,0.3)',
                  }}
                >
                  {t.value > 0 ? fmt(t.value) : '—'}
                </p>
                <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1 tracking-[1px]">
                  {t.dim ? 'IN MULTIPLIER' : 'KCAL'}
                </p>
              </div>
            );
          })}
        </div>

        {/* ── Active Plan Progress ─────────────────────────────────────── */}
        {(() => {
          if (typeof window === 'undefined') return null;
          const plan = loadPlan(); if (!plan) return null;
          const daysSince  = Math.round((Date.now() - new Date(plan.startDate + 'T00:00:00').getTime()) / 86400000);
          const weeksSince = Math.max(0, daysSince / 7);
          const weeklyRate = plan.type === 'cut'
            ? -(plan.dailyKcal * 7 / 3500)
            :  (plan.dailyKcal * 7 / 3500);
          const projNow      = plan.startWeight + weeklyRate * weeksSince;
          const weeksLeft    = Math.max(0, plan.weeksTarget - weeksSince);
          const planAccent   = plan.type === 'cut' ? 'var(--accent)' : 'var(--positive)';
          const planBg       = plan.type === 'cut' ? 'var(--accent-12)' : 'var(--positive-12)';
          const planBorder   = plan.type === 'cut' ? 'var(--accent)' : 'var(--positive)';
          const intensityLbl = plan.intensity ? INTENSITY_LABELS[plan.type][plan.intensity] : plan.type.toUpperCase();
          return (
            <div className="mt-4 rounded border p-4" style={{ borderColor: planBorder, background: planBg }}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-[9px] font-bold tracking-[2px] text-[var(--ink-3)] uppercase">Active Plan</p>
                <span className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase px-2 py-0.5 rounded-sm"
                  style={{ color: planAccent, border: `1px solid ${planAccent}` }}>
                  {intensityLbl} · {fmt(plan.dailyKcal)} kcal
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Week',    value: `${Math.ceil(weeksSince)}/${plan.weeksTarget}`, color: 'var(--ink-0)' },
                  { label: 'Proj Now', value: `${projNow.toFixed(1)} lb`,                   color: planAccent      },
                  { label: 'Goal',    value: `${plan.goalWeight.toFixed(1)} lb`,             color: planAccent      },
                  { label: 'Left',    value: `${Math.ceil(weeksLeft)} wks`,                  color: 'var(--ink-0)' },
                ].map(s => (
                  <div key={s.label}>
                    <p className="font-mono text-[8px] font-bold tracking-[1px] text-[var(--ink-3)] uppercase mb-1">{s.label}</p>
                    <p className="font-display text-[14px] leading-none" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — DailyLogCard (weight + calories eaten only)
// Cardio is logged in the Calendar / WorkoutLogger section.
// ─────────────────────────────────────────────────────────────────────────────

function DailyLogCard({ todayLabel, todayWeight, todayCals, onWeightChange, onCalsChange, onLogToday }: {
  todayLabel: string; todayWeight: string; todayCals: string;
  onWeightChange: (v: string) => void;
  onCalsChange:   (v: string) => void;
  onLogToday: () => void;
}) {
  const spotlight = useSpotlightBorder({ color: '79,195,247', size: 260, opacity: 0.45 });

  return (
    <div
      ref={spotlight.ref}
      onMouseMove={spotlight.onMouseMove}
      onMouseLeave={spotlight.onMouseLeave}
      onTouchMove={spotlight.onTouchMove}
      onTouchEnd={spotlight.onTouchEnd}
      className="que-card mb-4"
    >
      {spotlight.Overlay}
      <div className="p-5">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="que-section-label"><span className="dot" />TODAY'S LOG</h2>
          <span className="font-mono text-[10px] text-[var(--ink-3)] tracking-[1px]">{todayLabel}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="que-label">Weight / lbs</label>
            <input
              type="number" inputMode="decimal" className="que-input"
              value={todayWeight} onChange={e => onWeightChange(e.target.value)}
              placeholder="e.g. 180"
            />
          </div>
          <div>
            <label className="que-label">Calories Eaten</label>
            <input
              type="number" inputMode="numeric" className="que-input"
              value={todayCals} onChange={e => onCalsChange(e.target.value)}
              placeholder="e.g. 1800"
            />
          </div>
        </div>

        <button onClick={onLogToday} className="que-btn-primary w-full">
          LOG TODAY
        </button>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — ActivityLogCard
// ─────────────────────────────────────────────────────────────────────────────

function ActivityLogCard() {
  const { localDB, today } = useApp();
  const [page, setPage] = useState(30);

  const DOW = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const todayStr = toDateStr(today);

  const allKeys = useMemo(() => Object.keys(localDB).sort((a, b) => b.localeCompare(a)), [localDB]);
  const visible = useMemo(() => {
    const keys = allKeys.includes(todayStr) ? allKeys : [todayStr, ...allKeys];
    return keys.slice(0, page);
  }, [allKeys, todayStr, page]);
  const remaining = allKeys.length - page;

  return (
    <div className="que-card mb-4">
      <div className="p-5">
        <h2 className="que-section-label mb-4"><span className="dot" />ACTIVITY LOG</h2>

        {visible.length === 0 ? (
          <p className="text-center font-mono text-[11px] text-[var(--ink-3)] py-8 border border-dashed border-[var(--line-2)] rounded tracking-[1px] uppercase">
            No logged days yet
          </p>
        ) : (
          <div className="flex flex-col">
            {visible.map(ds => {
              const rec    = localDB[ds] ?? {};
              const d        = new Date(ds + 'T00:00:00');
              const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
              const dayIdx   = Math.round((todayMid.getTime() - d.getTime()) / 86400000);
              const label  = dayIdx === 0 ? 'TODAY'
                : dayIdx === 1 ? 'YESTERDAY'
                : `${DOW[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
              const eaten  = parseNum(rec.calsEaten);
              const budget = parseNum(rec.budget);

              let netEl: React.ReactNode = <span className="font-mono text-[11px] text-[var(--ink-3)] tracking-[1px]">—</span>;
              if (rec.calsEaten && budget) {
                const net = Math.round(eaten - budget);
                const col = net <= 0 ? 'text-[var(--positive)]' : 'text-[var(--danger)]';
                netEl = (
                  <span className={`font-mono font-bold text-[13px] tabular ${col}`}>
                    {net > 0 ? '+' : ''}{net.toLocaleString()} kcal
                  </span>
                );
              }
              return (
                <div
                  key={ds}
                  className="flex justify-between items-center px-1 py-3 border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--bg-2)] transition-colors"
                >
                  <span className="font-mono text-[12px] font-bold tracking-[1.5px] text-[var(--ink-0)]">{label}</span>
                  {netEl}
                </div>
              );
            })}
          </div>
        )}

        {remaining > 0 && (
          <button
            onClick={() => setPage(p => p + 30)}
            className="que-btn-ghost mt-3 w-full"
          >
            LOAD {Math.min(30, remaining)} MORE / {remaining} REMAINING
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — CalorieHistoryCard
// ─────────────────────────────────────────────────────────────────────────────

function CalorieHistoryCard({ streak, avgNet, days }: {
  streak: number; avgNet: number; days: number;
}) {
  const isPositive = avgNet <= 0;
  return (
    <div className="que-card mb-4 cursor-pointer transition-all hover:border-[var(--line-2)]">
      <div className="p-5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="que-section-label mb-2"><span className="dot" />CALORIE HISTORY</h2>
          {days > 0 ? (
            <p className="font-mono text-[11px] text-[var(--ink-1)] tracking-[0.5px]">
              {days} DAYS · AVG{' '}
              <span className={`font-bold tabular ${isPositive ? 'text-[var(--positive)]' : 'text-[var(--danger)]'}`}>
                {avgNet > 0 ? '+' : ''}{fmt(avgNet)} kcal/day
              </span>
            </p>
          ) : (
            <p className="font-mono text-[11px] text-[var(--ink-3)] tracking-[1px] uppercase">Tap to view</p>
          )}
        </div>
        {streak > 0 && (
          <div className="text-center flex-shrink-0">
            <p
              className="font-display tabular text-[var(--accent)] leading-none text-[42px]"
              style={{ textShadow: '0 0 16px var(--accent-40)' }}
            >
              {streak}
            </p>
            <p className="font-mono text-[9px] font-bold uppercase tracking-[2px] text-[var(--ink-2)] mt-1">DAY STREAK</p>
          </div>
        )}
        <ChevronRight size={18} className="text-[var(--ink-3)] flex-shrink-0" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — WeightProjectionCard (canvas)
// ─────────────────────────────────────────────────────────────────────────────

function WeightProjectionCard({ m, weightLbs, hidden }: {
  m: BudgetMetrics; weightLbs: number; hidden: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || hidden || weightLbs <= 0 || m.budget <= 0) return;
    drawProjection(canvas, weightLbs, m);
  }, [m, weightLbs, hidden]);

  if (hidden) return null;
  return (
    <div className="que-card mb-4">
      <div className="p-5">
        <h2 className="que-section-label mb-5"><span className="dot" />WEIGHT PROJECTION <span className="font-normal text-[var(--ink-3)] normal-case tracking-normal ml-1">/ 90-DAY EST.</span></h2>
        <canvas ref={canvasRef} className="block w-full h-[200px]" />
        <p className="mt-3 font-mono text-[10px] text-[var(--ink-3)] text-center tracking-[1px]">
          3,500 KCAL ≈ 1 LB · 60% of cardio is eaten back; 40% counts as deficit
        </p>
      </div>
    </div>
  );
}

function drawProjection(canvas: HTMLCanvasElement, startWt: number, m: BudgetMetrics, highlightDay: number | null = null) {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 300, H = 200;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const dailyNet  = (m.budget - m.bmr * m.multiplier) - m.activityBurn * 0.40;
  const lbsPerDay = dailyNet / 3500;
  const DAYS = 91;
  const pts  = Array.from({ length: DAYS }, (_, i) => startWt + lbsPerDay * i);
  const minW = Math.min(...pts), maxW = Math.max(...pts);
  const span = (maxW - minW) || 1;
  const PAD  = { t: 20, b: 32, l: 52, r: 16 };
  const xOf  = (i: number) => PAD.l + (i / (DAYS - 1)) * (W - PAD.l - PAD.r);
  const yOf  = (v: number) => H - PAD.b - ((v - minW) / span) * (H - PAD.t - PAD.b);
  const lime = '#4FC3F7', rgb = '79,195,247';
  const danger = '#FF4D5E', rgbDanger = '255,77,94';
  const col  = dailyNet <= 0 ? lime : danger;
  const rgbC = dailyNet <= 0 ? rgb  : rgbDanger;

  for (let w = 1; w <= 13; w++) {
    const d = w * 7; if (d >= DAYS) break;
    ctx.strokeStyle = w % 4 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(xOf(d), PAD.t); ctx.lineTo(xOf(d), H - PAD.b); ctx.stroke();
    if (w % 4 === 0 || w === 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'center';
      ctx.fillText(`W${w}`, xOf(d), H - 10);
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(PAD.l, yOf(startWt)); ctx.lineTo(W - PAD.r, yOf(startWt)); ctx.stroke();
  ctx.setLineDash([]);

  [startWt, pts[DAYS - 1]].forEach(v => {
    ctx.fillStyle = 'rgba(255,255,255,0.40)'; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'right';
    ctx.fillText(`${v.toFixed(1)}`, PAD.l - 4, yOf(v) + 3);
  });

  const grad = ctx.createLinearGradient(0, PAD.t, 0, H - PAD.b);
  grad.addColorStop(0, `rgba(${rgbC},0.22)`); grad.addColorStop(1, `rgba(${rgbC},0)`);
  ctx.beginPath(); ctx.moveTo(xOf(0), yOf(pts[0]));
  pts.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)));
  ctx.lineTo(xOf(DAYS - 1), H - PAD.b); ctx.lineTo(xOf(0), H - PAD.b); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath(); ctx.moveTo(xOf(0), yOf(pts[0]));
  pts.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)));
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

  ctx.beginPath(); ctx.arc(xOf(0), yOf(pts[0]), 4, 0, Math.PI * 2);
  ctx.fillStyle = col; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '9px JetBrains Mono, monospace'; ctx.textAlign = 'left';
  ctx.fillText('TODAY', xOf(0) + 7, yOf(pts[0]) - 4);

  // ── Selected-week crosshair ──────────────────────────────────────────────
  if (highlightDay !== null && highlightDay >= 0 && highlightDay < DAYS) {
    const hx = xOf(highlightDay);
    const hy = yOf(pts[Math.min(highlightDay, pts.length - 1)]);

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(79,195,247,0.40)';
    ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.moveTo(hx, PAD.t); ctx.lineTo(hx, H - PAD.b); ctx.stroke();
    ctx.setLineDash([]);

    // Glow halo
    ctx.beginPath(); ctx.arc(hx, hy, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(79,195,247,0.20)'; ctx.fill();

    // Outer dot
    ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fillStyle = lime; ctx.fill();

    // Inner hole
    ctx.beginPath(); ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#07080A'; ctx.fill();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — TrendsCard
// ─────────────────────────────────────────────────────────────────────────────

type TrendKey = 'weight' | 'burn' | 'budget';

function TrendsCard() {
  const { localDB } = useApp();
  const [activeTab, setActiveTab] = useState<TrendKey>('weight');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const chartConfig: Record<TrendKey, { label: string; color: string; unit: string }> = {
    weight: { label: 'WEIGHT', color: '#4FC3F7', unit: ' lbs' },
    burn:   { label: 'BURN',   color: '#FFB547', unit: ' kcal' },
    budget: { label: 'BUDGET', color: '#6DFF99', unit: ' kcal' },
  };

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const keys = Object.keys(localDB).sort().slice(-90);
    if (keys.length < 2) {
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.offsetWidth || 600;
      const H = parseInt(getComputedStyle(canvas).height) || 220;
      canvas.width = W * dpr; canvas.height = H * dpr; ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(107,110,118,0.7)';
      ctx.font = '12px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NOT ENOUGH DATA — KEEP LOGGING', W / 2, H / 2);
      return;
    }
    const labels = keys.map(ds => {
      const d = new Date(ds + 'T00:00:00');
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    const values = keys.map(ds => {
      const rec = localDB[ds];
      if (activeTab === 'weight') return parseFloat(rec?.weight ?? '0') || 0;
      if (activeTab === 'burn')   return Number(rec?.burn)   || 0;
      return Number(rec?.budget) || 0;
    });
    const { color, unit } = chartConfig[activeTab];
    drawLineChart(canvas, labels, values, color, unit);
  }, [localDB, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="que-card mb-4">
      <div className="p-5">
        <h2 className="que-section-label mb-4"><span className="dot" />TRENDS</h2>

        <div className="flex gap-1.5 mb-4">
          {(Object.keys(chartConfig) as TrendKey[]).map(k => (
            <button
              key={k}
              onClick={() => setActiveTab(k)}
              data-active={activeTab === k}
              className="que-pill"
              style={activeTab === k ? { background: chartConfig[k].color, color: 'var(--accent-ink)', borderColor: chartConfig[k].color } : undefined}
            >
              {chartConfig[k].label}
            </button>
          ))}
        </div>

        <canvas ref={canvasRef} className="block w-full h-[220px] lg:h-[260px]" />
      </div>
    </div>
  );
}

function drawLineChart(canvas: HTMLCanvasElement, labels: string[], values: number[], color: string, unit: string) {
  const dpr  = window.devicePixelRatio || 1;
  const cssW = canvas.offsetWidth || 600;
  const cssH = parseInt(getComputedStyle(canvas).height) || 220;
  canvas.width  = cssW * dpr; canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.scale(dpr, dpr);
  const W = cssW, H = cssH;
  const pad = { t: 16, r: 16, b: 36, l: 58 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  ctx.clearRect(0, 0, W, H);

  const valid = values.filter(v => v > 0);
  if (valid.length < 2) {
    ctx.fillStyle = 'rgba(107,110,118,0.7)';
    ctx.font = '12px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('NOT ENOUGH DATA', W / 2, H / 2);
    return;
  }

  const vMin = Math.min(...valid), vMax = Math.max(...valid);
  const pad2 = (vMax - vMin) * 0.12 || vMax * 0.05 || 5;
  const yMin = vMin - pad2, yMax = vMax + pad2, yR = yMax - yMin;
  const xOf = (i: number) => pad.l + (labels.length > 1 ? i / (labels.length - 1) : 0.5) * cW;
  const yOf = (v: number) => pad.t + (1 - (v - yMin) / yR) * cH;

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (i / 4) * cH;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke();
    const val = yMax - (i / 4) * yR;
    ctx.fillStyle = 'rgba(158,161,168,0.7)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(val) + unit, pad.l - 5, y + 3.5);
  }
  ctx.fillStyle = 'rgba(158,161,168,0.7)'; ctx.textAlign = 'center';
  ctx.font = '9px JetBrains Mono, monospace';
  const step = Math.max(1, Math.ceil(labels.length / 8));
  labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) ctx.fillText(l, xOf(i), H - pad.b + 14); });

  const pts = values.map((v, i) => ({ v, i })).filter(p => p.v > 0);
  const rgba = color.startsWith('#')
    ? `rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},`
    : 'rgba(79,195,247,';

  if (pts.length >= 2) {
    ctx.beginPath();
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
    grad.addColorStop(0, rgba + '0.22)');
    grad.addColorStop(1, rgba + '0.0)');
    ctx.fillStyle = grad;
    pts.forEach(({ v, i }, idx) => { idx === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)); });
    ctx.lineTo(xOf(pts[pts.length - 1].i), pad.t + cH);
    ctx.lineTo(xOf(pts[0].i), pad.t + cH);
    ctx.closePath(); ctx.fill();
  }
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  let first = true;
  values.forEach((v, i) => {
    if (v <= 0) { first = true; return; }
    first ? (ctx.moveTo(xOf(i), yOf(v)), first = false) : ctx.lineTo(xOf(i), yOf(v));
  });
  ctx.stroke();
  if (labels.length <= 60) {
    values.forEach((v, i) => {
      if (v <= 0) return;
      ctx.beginPath(); ctx.fillStyle = color; ctx.arc(xOf(i), yOf(v), 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.fillStyle = '#07080A'; ctx.arc(xOf(i), yOf(v), 1.5, 0, Math.PI * 2); ctx.fill();
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN CHART — projected line + actual dots
// ─────────────────────────────────────────────────────────────────────────────

function drawPlanChart(
  canvas: HTMLCanvasElement,
  projPts: number[],
  actualPts: { week: number; weight: number }[],
  planType: 'cut' | 'bulk',
  goalWeight: number
) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth || 600;
  const H = parseInt(getComputedStyle(canvas).height) || 200;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.scale(dpr, dpr);

  const weeks = projPts.length - 1;
  const allW  = [...projPts, ...actualPts.map(p => p.weight), goalWeight].filter(Boolean);
  const raw0  = Math.min(...allW), raw1 = Math.max(...allW);
  const pad2  = (raw1 - raw0) * 0.12 || 5;
  const yMin  = raw0 - pad2, yMax = raw1 + pad2, yR = yMax - yMin;
  const PAD   = { t: 20, r: 16, b: 36, l: 52 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const xOf = (w: number) => PAD.l + (weeks > 0 ? w / weeks : 0) * cW;
  const yOf = (v: number) => PAD.t + (1 - (v - yMin) / yR) * cH;

  ctx.clearRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = PAD.t + (i / 4) * cH;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(PAD.l + cW, y); ctx.stroke();
    const val = yMax - (i / 4) * yR;
    ctx.fillStyle = 'rgba(158,161,168,0.7)'; ctx.font = '10px JetBrains Mono, monospace'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(val) + ' lb', PAD.l - 4, y + 3.5);
  }

  // Week labels
  const stepW = Math.max(1, Math.ceil(weeks / 8));
  ctx.fillStyle = 'rgba(158,161,168,0.7)'; ctx.textAlign = 'center'; ctx.font = '9px JetBrains Mono, monospace';
  for (let w = 0; w <= weeks; w += stepW) ctx.fillText(`W${w}`, xOf(w), H - PAD.b + 14);

  // Goal dashed line
  ctx.strokeStyle = 'rgba(109,255,153,0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(PAD.l, yOf(goalWeight)); ctx.lineTo(PAD.l + cW, yOf(goalWeight)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(109,255,153,0.75)'; ctx.textAlign = 'right'; ctx.font = '9px JetBrains Mono, monospace';
  ctx.fillText('GOAL', PAD.l - 4, yOf(goalWeight) - 3);

  // Projected fill
  const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + cH);
  grad.addColorStop(0, 'rgba(79,195,247,0.18)'); grad.addColorStop(1, 'rgba(79,195,247,0)');
  ctx.beginPath(); ctx.fillStyle = grad;
  projPts.forEach((v, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)));
  ctx.lineTo(xOf(weeks), H - PAD.b); ctx.lineTo(xOf(0), H - PAD.b); ctx.closePath(); ctx.fill();

  // Projected line
  ctx.beginPath(); ctx.strokeStyle = '#4FC3F7'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  projPts.forEach((v, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(v)) : ctx.lineTo(xOf(i), yOf(v)));
  ctx.stroke();

  // Start dot + label
  ctx.beginPath(); ctx.arc(xOf(0), yOf(projPts[0]), 4, 0, Math.PI * 2); ctx.fillStyle = '#4FC3F7'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.textAlign = 'left'; ctx.font = '9px JetBrains Mono, monospace';
  ctx.fillText('NOW', xOf(0) + 6, yOf(projPts[0]) - 4);

  // Actual data points
  actualPts.forEach(({ week, weight }) => {
    if (week < 0 || week > weeks) return;
    const proj    = projPts[Math.min(Math.round(week), projPts.length - 1)];
    const isAhead = planType === 'cut' ? weight <= proj : weight >= proj;
    const col     = isAhead ? '#6DFF99' : '#FF4D5E';
    ctx.beginPath(); ctx.arc(xOf(week), yOf(weight), 5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
    ctx.beginPath(); ctx.arc(xOf(week), yOf(weight), 2.5, 0, Math.PI * 2); ctx.fillStyle = '#07080A'; ctx.fill();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — PlanModal
// ─────────────────────────────────────────────────────────────────────────────

function PlanModal({ open, onClose, profile, m, localDB, todayStr }: {
  open: boolean; onClose: () => void;
  profile: UserProfile; m: BudgetMetrics;
  localDB: import('@/lib/AppContext').LocalDB;
  todayStr: string;
}) {
  const [planType,   setPlanType]   = useState<'cut' | 'bulk' | null>(null);
  const [intensity,  setIntensity]  = useState<PlanIntensity>('moderate');
  const [startWeight, setStartWeight] = useState('');
  const [goalMode,   setGoalMode]   = useState<'weight' | 'weeks'>('weight');
  const [goalWeight, setGoalWeight] = useState('');
  const [goalWeeks,  setGoalWeeks]  = useState('12');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pre-fill on open
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

  // Computed projection
  const projData = useMemo(() => {
    if (!planType || !startWeight) return null;
    const sw       = parseNum(startWeight);
    if (sw <= 0) return null;
    const kcal     = INTENSITY_KCAL[intensity];
    // For cut: base kcal deficit + 40% of today's cardio (the portion not eaten back)
    const effectiveDeficit = planType === 'cut' ? kcal + m.activityBurn * 0.4 : 0;
    const weeklyRate = planType === 'cut'
      ? -(effectiveDeficit * 7 / 3500)
      : kcal * 7 / 3500;
    if (weeklyRate === 0) return null;
    let weeks: number; let gw: number;
    if (goalMode === 'weight') {
      gw = parseNum(goalWeight); if (gw <= 0) return null;
      weeks = Math.max(1, Math.min(52, Math.ceil(Math.abs((gw - sw) / weeklyRate))));
    } else {
      weeks = Math.max(1, parseInt(goalWeeks) || 12);
      gw    = sw + weeklyRate * weeks;
    }
    const pts = Array.from({ length: weeks + 1 }, (_, w) => sw + weeklyRate * w);
    return { pts, weeks, startWeight: sw, goalWeight: gw, weeklyRate, effectiveDeficit, kcal };
  }, [planType, intensity, startWeight, goalMode, goalWeight, goalWeeks, m.activityBurn]);

  // Actual weight data from saved plan's start date
  const actualData = useMemo(() => {
    const saved = loadPlan(); if (!saved) return [];
    return Object.entries(localDB)
      .filter(([ds, rec]) => rec.weight && ds >= saved.startDate)
      .map(([ds, rec]) => {
        const w = (new Date(ds + 'T00:00:00').getTime() - new Date(saved.startDate + 'T00:00:00').getTime()) / (7 * 86400000);
        return { week: w, weight: parseNum(String(rec.weight)) };
      }).filter(d => d.weight > 0 && d.week >= 0);
  }, [localDB]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !projData || !open) return;
    drawPlanChart(canvas, projData.pts, actualData, planType!, projData.goalWeight);
  }, [projData, actualData, open, planType]);

  const handleSave = useCallback(() => {
    if (!projData || !planType) return;
    savePlanToStorage({
      type: planType, intensity, dailyKcal: INTENSITY_KCAL[intensity],
      startDate: todayStr,
      startWeight: projData.startWeight, goalWeight: projData.goalWeight,
      weeksTarget: projData.weeks,
    });
    onClose();
  }, [projData, planType, intensity, todayStr, onClose]);

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
            {/* ── Scrollable content ── */}
            <div className="overflow-y-auto flex-1 p-4 md:p-6 overscroll-contain">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display text-[22px] md:text-[26px] tracking-[2px] uppercase text-[var(--ink-0)]">
                Create Plan
              </h3>
              <button onClick={onClose} className="text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors p-1">
                <X size={20} />
              </button>
            </div>

            {/* Step 1 — Plan Type */}
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

            {/* Step 2 — Intensity (3-col grid, compact) */}
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

            {/* Step 3 — Starting Weight */}
            <div className="mb-3">
              <label className="que-label">Starting Weight / lbs</label>
              <input type="number" inputMode="decimal" className="que-input"
                value={startWeight} onChange={e => setStartWeight(e.target.value)} placeholder="lbs" />
            </div>

            {/* Goal toggle */}
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

            {/* Summary tiles */}
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

                {/* Cardio contribution notice */}
                {planType === 'cut' && m.activityBurn > 0 && projData && (
                  <div className="flex items-center gap-2 rounded border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2">
                    <span className="block w-1.5 h-1.5 rounded-full bg-[var(--positive)] flex-shrink-0" />
                    <p className="font-mono text-[9px] text-[var(--ink-1)] tracking-[0.5px]">
                      <span className="text-[var(--positive)] font-bold">+{fmt(Math.round(m.activityBurn * 0.4))} kcal/day</span>{' '}
                      cardio factored in — {fmt(projData.kcal)} base + 40% of {fmt(Math.round(m.activityBurn))} cardio burn
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Chart */}
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
            ) : planType && (
              <div className="mb-4 rounded border border-dashed border-[var(--line-2)] py-8 text-center">
                <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[1px] uppercase">
                  Fill in your goal to see the projection
                </p>
              </div>
            )}

            {/* Current progress (only if plan was previously saved) */}
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

            </div>{/* end scrollable content */}

            {/* ── Sticky Save button — always visible ── */}
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
// SUB-COMPONENT — ProjectionModal
// ─────────────────────────────────────────────────────────────────────────────

function ProjectionModal({ open, m, weightLbs, onClose }: {
  open: boolean; m: BudgetMetrics; weightLbs: number; onClose: () => void;
}) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const ptsRef       = useRef<number[]>([]);
  const [selDay, setSelDay] = useState<number | null>(null);

  useEffect(() => {
    if (!open || weightLbs <= 0 || m.budget <= 0) return;
    const dailyNet  = (m.budget - m.bmr * m.multiplier) - m.activityBurn * 0.40;
    const lbsPerDay = dailyNet / 3500;
    ptsRef.current  = Array.from({ length: 91 }, (_, i) => weightLbs + lbsPerDay * i);
    setSelDay(null);
  }, [open, m, weightLbs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open || weightLbs <= 0 || m.budget <= 0) return;
    drawProjection(canvas, weightLbs, m, selDay);
  }, [open, m, weightLbs, selDay]);

  const handleInteraction = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !ptsRef.current.length) return;
    const rect   = canvas.getBoundingClientRect();
    const cssX   = clientX - rect.left;
    const W      = canvas.offsetWidth || 300;
    const raw    = Math.round((cssX - 52) / (W - 52 - 16) * 90);
    const day    = Math.max(0, Math.min(90, raw));
    setSelDay(Math.min(Math.round(day / 7) * 7, 90));
  }, []);

  const info = selDay !== null ? (() => {
    const wt    = ptsRef.current[selDay] ?? weightLbs;
    const week  = Math.round(selDay / 7);
    const d     = new Date(); d.setDate(d.getDate() + selDay);
    return { wt, week, date: `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`, delta: wt - weightLbs };
  })() : null;

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
            {/* Header */}
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

            {/* Week info panel */}
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

            {/* Interactive canvas */}
            {weightLbs > 0 && m.budget > 0 ? (
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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function MetricsDashboard() {
  const {
    today, todayStr,
    activeDayFocus,
    profile, setProfile, persistProfile,
    localDB, updateDayRecord, setLastBurn, setLastBudget,
    getLastKnownWeight,
    isLoaded,
  } = useApp();

  const [profileOpen,  setProfileOpen]  = useState(false);
  const [projVisible,  setProjVisible]  = useState(false);
  const [planOpen,     setPlanOpen]     = useState(false);
  const [cardio, setCardio]             = useState<CardioFields>(EMPTY_CARDIO);
  const [todayWeight, setTodayWeightRaw] = useState('');
  const [todayCals,   setTodayCalsRaw]   = useState('');

  useEffect(() => {
    if (!isLoaded) return;
    const rec = localDB[activeDayFocus] ?? {};
    setCardio({
      steps:    String(rec.steps    ?? 0),
      runDist:  String(rec.runDist  ?? 0),
      runTime:  String(rec.runTime  ?? 0),
      bikeDist: String(rec.bikeDist ?? 0),
      bikeTime: String(rec.bikeTime ?? 0),
      swimTime: String(rec.swimTime ?? 0),
    });
    const todayRec = localDB[todayStr] ?? {};
    setTodayWeightRaw(String(todayRec.weight ?? getLastKnownWeight(todayStr) ?? ''));
    setTodayCalsRaw(String(todayRec.calsEaten ?? ''));
  }, [isLoaded, activeDayFocus, todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useBudgetMetrics(profile, cardio);

  useEffect(() => {
    setLastBurn(m.activityBurn);
    setLastBudget(m.budget);
  }, [m.activityBurn, m.budget, setLastBurn, setLastBudget]);

  // Cardio is read-only in Metrics — it is logged via WorkoutLogger in the Calendar tab.

  const handleProfileChange = useCallback((updates: Partial<UserProfile>) => {
    setProfile(updates); persistProfile(updates);
  }, [setProfile, persistProfile]);

  const handleWeightChange = useCallback((val: string) => {
    setTodayWeightRaw(val);
    updateDayRecord(todayStr, { weight: val });
  }, [todayStr, updateDayRecord]);

  const handleCalsChange = useCallback((val: string) => {
    setTodayCalsRaw(val);
    updateDayRecord(todayStr, { calsEaten: val });
  }, [todayStr, updateDayRecord]);

  const handleLogToday = useCallback(() => {
    updateDayRecord(todayStr, {
      burn: m.activityBurn, budget: m.budget,
      weight: todayWeight || undefined,
    });
    setProjVisible(true);
  }, [todayStr, m.activityBurn, m.budget, todayWeight, updateDayRecord]);

  const { calDays, avgNet, streak } = useMemo(() => {
    const days = Object.keys(localDB)
      .map(ds => {
        const rec = localDB[ds];
        if (!rec.calsEaten) return null;
        const eaten = parseNum(rec.calsEaten);
        const budget = parseNum(rec.budget);
        return { ds, net: eaten - budget };
      })
      .filter(Boolean) as { ds: string; net: number }[];
    if (!days.length) return { calDays: 0, avgNet: 0, streak: 0 };
    const avg = days.reduce((s, d) => s + d.net, 0) / days.length;
    const logged = new Set(days.map(d => d.ds));
    const cur = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!logged.has(todayStr)) cur.setDate(cur.getDate() - 1);
    let s = 0;
    while (true) {
      const ds = toDateStr(cur);
      if (!logged.has(ds)) break;
      s++; cur.setDate(cur.getDate() - 1);
    }
    return { calDays: days.length, avgNet: avg, streak: s };
  }, [localDB, today, todayStr]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64 font-mono text-[11px] text-[var(--ink-3)] tracking-[2px] uppercase">
        Loading
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 pb-24 lg:py-8">

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="block w-2 h-2 rounded-full bg-[var(--accent)]" style={{ boxShadow: '0 0 8px var(--accent-40)' }} />
          <span className="font-mono text-[11px] font-bold tabular tracking-[2px] uppercase text-[var(--ink-1)]">
            {fmtDateLong(activeDayFocus)}
          </span>
        </div>
        <button
          onClick={() => setProfileOpen(o => !o)}
          title="Athlete Profile"
          className={[
            'w-10 h-10 rounded flex items-center justify-center border transition-all',
            profileOpen
              ? 'border-[var(--accent)] bg-[var(--accent-12)] text-[var(--accent)]'
              : 'border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-1)] hover:border-[var(--accent)] hover:text-[var(--accent)]',
          ].join(' ')}
        >
          <User size={18} />
        </button>
      </div>

      {profileOpen && <ProfilePanel profile={profile} onChange={handleProfileChange} onOpenPlan={() => setPlanOpen(true)} />}

      <CalorieBudgetCard m={m} />

      <DailyLogCard
        todayLabel={fmtDateLong(todayStr)}
        todayWeight={todayWeight}
        todayCals={todayCals}
        onWeightChange={handleWeightChange}
        onCalsChange={handleCalsChange}
        onLogToday={handleLogToday}
      />

      <ActivityLogCard />
      <CalorieHistoryCard streak={streak} avgNet={avgNet} days={calDays} />
      <TrendsCard />

      <ProjectionModal
        open={projVisible}
        m={m}
        weightLbs={parseNum(todayWeight || profile.weight)}
        onClose={() => setProjVisible(false)}
      />

      <PlanModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        profile={profile}
        m={m}
        localDB={localDB}
        todayStr={todayStr}
      />
    </div>
  );
}
