'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ChevronRight, Plus, User, X } from 'lucide-react';
import {
  useApp,
  type DayRecord, type UserProfile,
} from '@/lib/AppContext';
import { ActivityIcon } from '@/components/ActivityIcon';
import { useSpotlightBorder } from '@/hooks/useSpotlightBorder';
import Lottie from 'lottie-react';
import prData from '@/public/PR_animation.json';
import {
  type CardioFields, type BudgetMetrics, type PRFlags,
  EMPTY_CARDIO, INTENSITY_LABELS,
  useBudgetMetrics, loadPlan,
  parseNum, fmt, fmtDateLong, toDateStr,
} from '@/lib/metricsTypes';
import { drawProjection, drawLineChart } from '@/lib/metricsCharts';
import {
  MilestoneModal, CelebrationModal, PlanProgressModal, PlanModal, ProjectionModal,
} from '@/components/metrics/MetricsModals';
import RunningPlanBuilder from '@/components/running/RunningPlanBuilder';

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — StepSyncPanel
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

function ProfilePanel({ profile, onChange, onOpenPlan, onOpenRunPlan }: {
  profile: UserProfile;
  onChange: (updates: Partial<UserProfile>) => void;
  onOpenPlan: () => void;
  onOpenRunPlan: () => void;
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

        <div className="flex items-center justify-end gap-3 mt-4 pt-4 border-t border-[var(--line)]">
          <button onClick={onOpenRunPlan} className="que-btn-ghost flex items-center gap-2">
            <Activity size={13} /> Running Plan
          </button>
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
// PRBadge — plays the trophy animation once when a personal record is set
// ─────────────────────────────────────────────────────────────────────────────

function PRBadge({ size = 44 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size, flexShrink: 0, pointerEvents: 'none' }}
      title="Personal Record!"
    >
      <Lottie
        animationData={prData}
        loop={false}
        autoplay={true}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — CalorieBudgetCard
// ─────────────────────────────────────────────────────────────────────────────

const CARDIO_QUICK_CFG = {
  run:  { f1label: 'Distance / mi', f1mode: 'decimal',  f1key: 'runDist',  f2label: 'Duration / min', f2key: 'runTime'  },
  bike: { f1label: 'Distance / mi', f1mode: 'decimal',  f1key: 'bikeDist', f2label: 'Duration / min', f2key: 'bikeTime' },
  swim: { f1label: 'Duration / min', f1mode: 'numeric', f1key: 'swimTime', f2label: null,              f2key: null       },
} as const;

function CalorieBudgetCard({ m, onOpenProgress, prFlags }: {
  m: BudgetMetrics;
  onOpenProgress?: () => void;
  prFlags?: PRFlags;
}) {
  const spotlight = useSpotlightBorder({ color: '79,195,247', size: 280, opacity: 0.55 });
  const { updateDayRecord, getDayRecord, localDB, todayStr } = useApp();

  const calsEaten  = parseNum(String(localDB[todayStr]?.calsEaten ?? 0));
  const remaining  = m.budget - calsEaten;
  const eatPct     = m.budget > 0 ? Math.min(1, calsEaten / m.budget) : 0;
  const isOver     = remaining < 0;

  const [cardioModal, setCardioModal] = useState<'run' | 'bike' | 'swim' | null>(null);
  const [f1, setF1] = useState('');
  const [f2, setF2] = useState('');

  const openCardioModal = useCallback((kind: 'run' | 'bike' | 'swim') => {
    const rec = getDayRecord(todayStr);
    const cfg = CARDIO_QUICK_CFG[kind];
    setF1(String((rec as Record<string, unknown>)[cfg.f1key] || ''));
    setF2(cfg.f2key ? String((rec as Record<string, unknown>)[cfg.f2key] || '') : '');
    setCardioModal(kind);
  }, [getDayRecord, todayStr]);

  const submitCardio = useCallback(() => {
    if (!cardioModal) return;
    const cfg = CARDIO_QUICK_CFG[cardioModal];
    const updates: Partial<Record<string, number>> = { [cfg.f1key]: parseFloat(f1) || 0 };
    if (cfg.f2key) updates[cfg.f2key] = parseFloat(f2) || 0;
    updateDayRecord(todayStr, updates as Parameters<typeof updateDayRecord>[1]);
    setCardioModal(null);
  }, [cardioModal, f1, f2, todayStr, updateDayRecord]);

  const clearCardio = useCallback((kind: 'run' | 'bike' | 'swim') => {
    const clears: Partial<Record<string, number>> = kind === 'run'
      ? { runDist: 0, runTime: 0 }
      : kind === 'bike'
      ? { bikeDist: 0, bikeTime: 0 }
      : { swimTime: 0 };
    updateDayRecord(todayStr, clears as Parameters<typeof updateDayRecord>[1]);
  }, [todayStr, updateDayRecord]);

  const todayRec = localDB[todayStr] ?? {};
  const runDist  = parseNum(String(todayRec.runDist  ?? 0));
  const bikeDist = parseNum(String(todayRec.bikeDist ?? 0));
  const swimMin  = parseNum(String(todayRec.swimTime ?? 0));

  const tiles = [
    {
      label: 'RUN',  value: m.runBurn,  key: 'run',
      dist: runDist  > 0 ? `${runDist} mi`        : undefined,
      pace: m.runPaceStr                           || undefined,
    },
    {
      label: 'BIKE', value: m.bikeBurn, key: 'bike',
      dist: bikeDist > 0 ? `${bikeDist} mi`        : undefined,
      pace: m.bikeSpeed > 0 ? `${m.bikeSpeed} mph` : undefined,
    },
    {
      label: 'SWIM', value: m.swimBurn, key: 'swim',
      dist: undefined,
      pace: swimMin  > 0 ? `${swimMin} min`        : undefined,
    },
    { label: 'STEPS', value: m.stepBurn, key: 'step', dim: true, dist: undefined, pace: undefined },
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
            ◐ {calsEaten > 0 ? 'REMAINING' : 'DAILY TARGET'}
          </span>
          <span className="absolute top-3 right-5 font-mono text-[9px] tracking-[3px] text-[var(--accent)] uppercase">
            LIVE
          </span>

          <div className="mt-6 flex items-end gap-3">
            <span
              className="font-display tabular leading-none text-[96px] sm:text-[120px] lg:text-[140px]"
              style={{
                color: isOver ? 'var(--danger)' : 'var(--accent)',
                textShadow: isOver ? '0 0 40px rgba(255,80,80,0.4)' : '0 0 40px var(--accent-40)',
                letterSpacing: '-0.04em',
              }}
            >
              {isOver ? fmt(-remaining) : fmt(calsEaten > 0 ? remaining : m.budget)}
            </span>
            <div className="pb-3 flex flex-col gap-0.5">
              <span className="font-display text-[24px] tracking-[3px] uppercase text-[var(--ink-2)]">
                kcal
              </span>
              {isOver && (
                <span className="font-mono text-[9px] tracking-[1.5px] uppercase" style={{ color: 'var(--danger)' }}>
                  over
                </span>
              )}
            </div>
          </div>

          {calsEaten > 0 && (
            <div className="mt-4 mb-1">
              <div className="h-1.5 rounded-full bg-[var(--bg-3)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, eatPct * 100)}%`,
                    background: isOver ? 'var(--danger)' : 'var(--accent)',
                    boxShadow: isOver ? '0 0 8px rgba(255,80,80,0.5)' : '0 0 8px var(--accent-40)',
                  }}
                />
              </div>
              <p className="mt-2 font-mono text-[10px] text-[var(--ink-3)] tracking-[0.5px]">
                {fmt(calsEaten)} eaten · {fmt(m.budget)} target
              </p>
            </div>
          )}

          {calsEaten === 0 && (
            <p className="mt-3 font-mono text-[11px] text-[var(--ink-3)] tracking-[1px]">
              {`${fmt(m.tdee)} − ${fmt(m.deficit)}${m.eatBack > 0 ? ` + ${fmt(m.eatBack)}` : ''} = ${fmt(m.budget)} kcal`}
            </p>
          )}
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
                onClick={() => !t.dim && openCardioModal(t.key as 'run' | 'bike' | 'swim')}
                className={[
                  'relative rounded p-3 border overflow-hidden',
                  t.dim ? 'border-[var(--line)] bg-[var(--bg-2)] opacity-60'
                    : lit ? 'border-[var(--positive)]/40 cursor-pointer'
                    : 'border-[var(--line-2)] bg-[var(--bg-2)] hover:border-[var(--accent)] transition-all cursor-pointer',
                ].join(' ')}
                style={lit ? {
                  background: 'var(--tile-bg-lit)',
                  animation:  'tile-glow-pulse 2.8s ease-in-out infinite',
                } : undefined}
                title={t.dim ? undefined : 'Tap to log'}
              >
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
                    <div className="flex items-center gap-1">
                      {prFlags?.[`pr${t.key.charAt(0).toUpperCase()}${t.key.slice(1)}` as keyof PRFlags] && (
                        <PRBadge size={36} />
                      )}
                      {lit && (
                        <button
                          onClick={e => { e.stopPropagation(); clearCardio(t.key as 'run' | 'bike' | 'swim'); }}
                          className="w-5 h-5 flex items-center justify-center rounded text-[var(--ink-3)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors"
                          title="Clear"
                        >
                          <X size={12} />
                        </button>
                      )}
                      <ActivityIcon kind={t.key as 'run' | 'bike' | 'swim'} active={lit} size={28} />
                    </div>
                  )}
                </div>
                <div className="flex items-end justify-between gap-1">
                  <div>
                    <p
                      className="font-display tabular leading-none text-[26px]"
                      style={{
                        color:      t.dim ? 'var(--ink-3)' : lit ? 'var(--positive)' : 'var(--accent)',
                        textShadow: t.dim || !lit ? 'none' : '0 0 16px var(--tile-text-glow)',
                      }}
                    >
                      {t.value > 0 ? fmt(t.value) : '—'}
                    </p>
                    <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1 tracking-[1px]">
                      {t.dim ? 'IN MULTIPLIER' : 'KCAL'}
                    </p>
                  </div>
                  {lit && (t.dist || t.pace) && (
                    <div className="flex flex-col items-end gap-0.5 pb-0.5">
                      {t.dist && (
                        <p className="font-mono text-[11px] font-semibold text-[var(--positive)] tracking-[0.5px]">
                          {t.dist}
                        </p>
                      )}
                      {t.pace && (
                        <p className="font-mono text-[11px] text-[var(--ink-2)] tracking-[0.5px]">
                          {t.pace}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick-log cardio modal */}
        <AnimatePresence>
          {cardioModal && (() => {
            const cfg = CARDIO_QUICK_CFG[cardioModal];
            const name = cardioModal.toUpperCase();
            return (
              <motion.div
                key="cardio-quick"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.18 }}
                className="mt-3 rounded border border-[var(--accent)]/40 bg-[var(--bg-2)] p-3"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <p className="font-mono text-[9px] font-bold tracking-[2px] text-[var(--accent)] uppercase">
                    Log {name}
                  </p>
                  <button onClick={() => setCardioModal(null)} className="text-[var(--ink-3)] hover:text-[var(--ink-0)] transition-colors">
                    <X size={14} />
                  </button>
                </div>
                <div className={`grid gap-2 mb-2.5 ${cfg.f2key ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div>
                    <label className="que-label">{cfg.f1label}</label>
                    <input
                      autoFocus type="text" inputMode={cfg.f1mode}
                      className="que-input" value={f1} onChange={e => setF1(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && submitCardio()}
                    />
                  </div>
                  {cfg.f2key && (
                    <div>
                      <label className="que-label">{cfg.f2label}</label>
                      <input
                        type="text" inputMode="numeric"
                        className="que-input" value={f2} onChange={e => setF2(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submitCardio()}
                      />
                    </div>
                  )}
                </div>
                <button onClick={submitCardio} className="que-btn-primary w-full py-2.5 text-[11px]">
                  Save {name}
                </button>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Active Plan Progress */}
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
            <button
              type="button"
              onClick={onOpenProgress}
              className="mt-4 w-full rounded border p-4 text-left transition-all hover:brightness-110 active:scale-[0.99]"
              style={{ borderColor: planBorder, background: planBg }}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="font-mono text-[9px] font-bold tracking-[2px] text-[var(--ink-3)] uppercase">Active Plan</p>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase px-2 py-0.5 rounded-sm"
                    style={{ color: planAccent, border: `1px solid ${planAccent}` }}>
                    {intensityLbl} · {fmt(plan.dailyKcal)} kcal
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: planAccent, opacity: 0.7 }} aria-hidden>
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Week',     value: `${Math.ceil(weeksSince)}/${plan.weeksTarget}`, color: 'var(--ink-0)' },
                  { label: 'Proj Now', value: `${projNow.toFixed(1)} lb`,                    color: planAccent      },
                  { label: 'Goal',     value: `${plan.goalWeight.toFixed(1)} lb`,             color: planAccent      },
                  { label: 'Left',     value: `${Math.ceil(weeksLeft)} wks`,                  color: 'var(--ink-0)' },
                ].map(s => (
                  <div key={s.label}>
                    <p className="font-mono text-[8px] font-bold tracking-[1px] text-[var(--ink-3)] uppercase mb-1">{s.label}</p>
                    <p className="font-display text-[14px] leading-none" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>
            </button>
          );
        })()}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — TrophyCaseCard
// ─────────────────────────────────────────────────────────────────────────────

function TrophyCaseCard() {
  const { localDB } = useApp();

  const records = useMemo(() => {
    let prs: Record<string, number> = {};
    try { prs = JSON.parse(localStorage.getItem('queLiftPRs') ?? '{}'); } catch { /* noop */ }

    const prDates: Record<string, string> = {};
    Object.entries(localDB).sort(([a], [b]) => a.localeCompare(b)).forEach(([ds, rec]) => {
      if (!rec.exercises) return;
      try {
        (JSON.parse(String(rec.exercises)) as Array<{ k?: string; n?: string; sets?: Array<{ w?: string }> }>)
          .forEach(ex => {
            if (ex.k !== 'lift' || !ex.n || !ex.sets) return;
            const w = Math.max(0, ...ex.sets.map(s => parseFloat(s.w ?? '0') || 0));
            if (w > 0 && w >= (prs[ex.n] ?? 0) && !prDates[ex.n]) prDates[ex.n] = ds;
          });
      } catch { /* skip */ }
    });

    return Object.entries(prs)
      .sort((a, b) => b[1] - a[1])
      .map(([name, weight]) => ({ name, weight, date: prDates[name] ?? null }));
  }, [localDB]);

  if (records.length === 0) return null;

  return (
    <div className="que-card mb-4">
      <div className="p-5">
        <h2 className="que-section-label mb-4"><span className="dot" />TROPHY CASE</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {records.slice(0, 12).map(({ name, weight, date }) => (
            <div key={name} className="flex items-center justify-between gap-3 rounded border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2.5">
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-semibold text-[var(--ink-0)] truncate">{name}</p>
                {date && (
                  <p className="font-mono text-[8px] text-[var(--ink-3)] tracking-[0.5px] mt-0.5">
                    {fmtDateLong(date)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="#FFB547" aria-hidden>
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                <span className="font-display text-[16px] leading-none" style={{ color: '#FFB547' }}>{weight}</span>
                <span className="font-mono text-[9px] text-[var(--ink-3)]">lb</span>
              </div>
            </div>
          ))}
        </div>
        {records.length > 12 && (
          <p className="font-mono text-[8px] text-[var(--ink-3)] mt-2 text-center tracking-[0.5px]">
            +{records.length - 12} more records
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — WeeklyRecapCard
// ─────────────────────────────────────────────────────────────────────────────

function WeeklyRecapCard() {
  const { localDB, today, todayStr } = useApp();
  const [dismissed, setDismissed] = useState(false);

  const weekKey = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return `${d.getFullYear()}-W${String(Math.ceil((d.getDate() + new Date(d.getFullYear(), 0, 1).getDay()) / 7)).padStart(2, '0')}`;
  }, [today]);

  const shouldShow = useMemo(() => {
    if (dismissed) return false;
    const seen = localStorage.getItem('queWeeklyRecapSeen');
    if (seen === weekKey) return false;
    return today.getDay() === 0;
  }, [today, weekKey, dismissed]);

  const stats = useMemo(() => {
    if (!shouldShow) return null;
    const mon = new Date(today); mon.setDate(today.getDate() - 6);
    const weekStart = toDateStr(mon);

    let sessions = 0, calBudgetDays = 0, liftPRsThisWeek = 0;
    let prRecs: Record<string, number> = {};
    try { prRecs = JSON.parse(localStorage.getItem('queLiftPRs') ?? '{}'); } catch { /* noop */ }
    const prBeforeWeek: Record<string, number> = {};

    Object.entries(localDB).forEach(([ds, rec]) => {
      if (ds >= weekStart) return;
      if (!rec.exercises) return;
      try {
        (JSON.parse(String(rec.exercises)) as Array<{ k?: string; n?: string; sets?: Array<{ w?: string }> }>)
          .forEach(ex => {
            if (ex.k !== 'lift' || !ex.n || !ex.sets) return;
            const w = Math.max(0, ...ex.sets.map(s => parseFloat(s.w ?? '0') || 0));
            if (w > 0) prBeforeWeek[ex.n] = Math.max(prBeforeWeek[ex.n] ?? 0, w);
          });
      } catch { /* skip */ }
    });

    Object.entries(localDB).forEach(([ds, rec]) => {
      if (ds < weekStart || ds > todayStr) return;
      if (rec.exercises) {
        try {
          const exs = JSON.parse(String(rec.exercises)) as Array<{ k?: string; n?: string; sets?: Array<{ w?: string }> }>;
          if (exs.some(e => e.k === 'lift')) sessions++;
          exs.forEach(ex => {
            if (ex.k !== 'lift' || !ex.n || !ex.sets) return;
            const w = Math.max(0, ...ex.sets.map(s => parseFloat(s.w ?? '0') || 0));
            if (w > 0 && w > (prBeforeWeek[ex.n] ?? 0)) liftPRsThisWeek++;
          });
        } catch { /* skip */ }
      }
      const eaten = parseNum(String(rec.calsEaten ?? 0));
      const budget = parseNum(String(rec.budget ?? 0));
      if (budget > 0 && eaten > 0 && eaten <= budget) calBudgetDays++;
    });

    void prRecs; // used for baseline above
    return { sessions, liftPRsThisWeek, calBudgetDays };
  }, [localDB, today, todayStr, shouldShow]);

  if (!shouldShow || !stats) return null;

  const dismiss = () => {
    localStorage.setItem('queWeeklyRecapSeen', weekKey);
    setDismissed(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded border border-[var(--positive)]/30 bg-[var(--positive)]/5 p-4 mb-4"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-mono text-[9px] font-bold tracking-[2px] text-[var(--positive)] uppercase mb-0.5">Weekly Recap</p>
          <p className="font-mono text-[10px] text-[var(--ink-1)] leading-relaxed">
            This week: <strong>{stats.sessions} session{stats.sessions !== 1 ? 's' : ''}</strong>
            {stats.liftPRsThisWeek > 0 && <> · <strong className="text-[#FFB547]">+{stats.liftPRsThisWeek} PR{stats.liftPRsThisWeek !== 1 ? 's' : ''}</strong></>}
            {' '}· <strong>{stats.calBudgetDays} of 7 days</strong> on budget
          </p>
        </div>
        <button onClick={dismiss} className="text-[var(--ink-3)] hover:text-[var(--ink-0)] transition-colors flex-shrink-0">
          <X size={14} />
        </button>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — WeeklyVolumeCard
// ─────────────────────────────────────────────────────────────────────────────

function WeeklyVolumeCard() {
  const { localDB, today, todayStr } = useApp();

  const volumeByGroup = useMemo(() => {
    const mon = new Date(today);
    mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const weekStart = toDateStr(mon);

    const groups: Record<string, number> = {};
    Object.entries(localDB).forEach(([ds, rec]) => {
      if (ds < weekStart || ds > todayStr || !rec.exercises) return;
      try {
        (JSON.parse(String(rec.exercises)) as Array<{ k?: string; g?: string; g2?: string; g3?: string; sets?: Array<{ r: string; w: string }> }>)
          .forEach(ex => {
            if (ex.k !== 'lift' || !ex.g || !ex.sets) return;
            const vol = ex.sets.reduce((s, set) => {
              const r = parseInt(String(set.r)) || 0;
              const w = parseFloat(String(set.w)) || 0;
              return s + r * w;
            }, 0);
            if (vol > 0) {
              groups[ex.g]                 = (groups[ex.g]  ?? 0) + vol;
              if (ex.g2) groups[ex.g2]     = (groups[ex.g2] ?? 0) + vol * 0.5;
              if (ex.g3) groups[ex.g3]     = (groups[ex.g3] ?? 0) + vol * 0.25;
            }
          });
      } catch { /* skip */ }
    });
    return Object.entries(groups).sort((a, b) => b[1] - a[1]);
  }, [localDB, today, todayStr]);

  if (volumeByGroup.length === 0) return null;

  const maxVol = Math.max(...volumeByGroup.map(([, v]) => v), 1);

  return (
    <div className="que-card mb-4">
      <div className="p-5">
        <h2 className="que-section-label mb-4"><span className="dot" />WEEKLY VOLUME</h2>
        <div className="space-y-2.5">
          {volumeByGroup.map(([group, vol]) => (
            <div key={group}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="font-mono text-[9px] font-bold uppercase tracking-[1.5px] text-[var(--ink-2)]">{group}</span>
                <span className="font-mono text-[9px] text-[var(--ink-3)] tracking-[0.5px]">
                  {vol >= 1000 ? `${(vol / 1000).toFixed(1)}k` : Math.round(vol)} lbs
                </span>
              </div>
              <div className="h-1.5 bg-[var(--bg-3)] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[var(--accent)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${(vol / maxVol) * 100}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{ opacity: 0.7 + (vol / maxVol) * 0.3 }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="font-mono text-[8px] text-[var(--ink-3)] mt-3 tracking-[0.5px]">
          Sets × reps × weight · current week (Mon–{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][today.getDay()]})
        </p>
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
// SUB-COMPONENT — WeightProjectionCard
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

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — TrendsCard
// ─────────────────────────────────────────────────────────────────────────────

type TrendKey = 'weight' | 'burn' | 'budget' | 'runDist' | 'bikeDist' | 'swimTime';

function TrendsCard() {
  const { localDB } = useApp();
  const [activeTab, setActiveTab] = useState<TrendKey>('weight');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const chartConfig: Record<TrendKey, { label: string; color: string; unit: string }> = {
    weight:   { label: 'WEIGHT', color: '#4FC3F7', unit: ' lbs'  },
    burn:     { label: 'BURN',   color: '#FFB547', unit: ' kcal' },
    budget:   { label: 'BUDGET', color: '#6DFF99', unit: ' kcal' },
    runDist:  { label: 'RUN',    color: '#F87171', unit: ' mi'   },
    bikeDist: { label: 'BIKE',   color: '#A78BFA', unit: ' mi'   },
    swimTime: { label: 'SWIM',   color: '#34D399', unit: ' min'  },
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
      if (activeTab === 'weight')   return parseFloat(String(rec?.weight   ?? '0')) || 0;
      if (activeTab === 'burn')     return Number(rec?.burn)                        || 0;
      if (activeTab === 'runDist')  return parseFloat(String(rec?.runDist  ?? '0')) || 0;
      if (activeTab === 'bikeDist') return parseFloat(String(rec?.bikeDist ?? '0')) || 0;
      if (activeTab === 'swimTime') return parseFloat(String(rec?.swimTime ?? '0')) || 0;
      return Number(rec?.budget) || 0;
    });
    const { color, unit } = chartConfig[activeTab];

    const rollingAvg = activeTab === 'weight' ? values.map((_, i) => {
      const win = values.slice(Math.max(0, i - 6), i + 1).filter(v => v > 0);
      return win.length > 0 ? win.reduce((s, v) => s + v, 0) / win.length : 0;
    }) : undefined;

    drawLineChart(canvas, labels, values, color, unit, rollingAvg);
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
        {activeTab === 'weight' && (
          <div className="flex items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-px bg-[#4FC3F7] opacity-70" />
              <span className="font-mono text-[8px] text-[var(--ink-3)] tracking-[0.5px]">Daily</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-5 h-[2px] bg-white opacity-50" />
              <span className="font-mono text-[8px] text-[var(--ink-3)] tracking-[0.5px]">7-day avg</span>
            </div>
          </div>
        )}
      </div>
    </div>
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

  const [profileOpen,      setProfileOpen]      = useState(false);
  const [projVisible,      setProjVisible]      = useState(false);
  const [planOpen,         setPlanOpen]         = useState(false);
  const [progressOpen,     setProgressOpen]     = useState(false);
  const [celebrateVisible, setCelebrateVisible] = useState(false);
  const [milestone,        setMilestone]        = useState<{ pct: number; weightChange: number } | null>(null);
  const [runPlanOpen,      setRunPlanOpen]      = useState(false);

  const milestoneCheckedRef = useRef(false);
  useEffect(() => {
    if (milestoneCheckedRef.current || !isLoaded) return;
    milestoneCheckedRef.current = true;

    const plan = loadPlan(); if (!plan) return;
    const msElapsed  = Date.now() - new Date(plan.startDate + 'T00:00:00').getTime();
    const weeksSince = Math.max(0, msElapsed / (7 * 86400000));
    const ratio      = weeksSince / plan.weeksTarget;
    const THRESHOLDS = [0.25, 0.5, 0.75];

    let seen: number[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem('quePlanMilestones') ?? '{}');
      if (raw.planStartDate === plan.startDate) seen = raw.seen ?? [];
    } catch { /* noop */ }

    for (const t of THRESHOLDS) {
      if (ratio >= t && !seen.includes(Math.round(t * 100))) {
        const pct = Math.round(t * 100);
        seen.push(pct);
        localStorage.setItem('quePlanMilestones', JSON.stringify({ planStartDate: plan.startDate, seen }));
        const entries = (Object.entries(localDB) as [string, DayRecord][])
          .filter(([, r]) => parseNum(String(r.weight ?? '0')) > 0)
          .sort(([a], [b]) => a.localeCompare(b));
        const latestW = entries.length > 0 ? parseNum(String(entries[entries.length - 1][1].weight)) : 0;
        setMilestone({ pct, weightChange: latestW > 0 ? latestW - plan.startWeight : 0 });
        break;
      }
    }
  }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const [cardio, setCardio]             = useState<CardioFields>(EMPTY_CARDIO);
  const [todayWeight,  setTodayWeightRaw]  = useState('');
  const [todayCals,    setTodayCalsRaw]    = useState('');
  const [todayProtein, setTodayProteinRaw] = useState('');

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
    setTodayProteinRaw(todayRec.protein ? String(todayRec.protein) : '');
  }, [isLoaded, activeDayFocus, todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLoaded) return;
    const fromDB = localDB[todayStr]?.calsEaten;
    if (fromDB !== undefined) setTodayCalsRaw(String(fromDB));
  }, [isLoaded, localDB, todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = useBudgetMetrics(profile, cardio);

  useEffect(() => {
    setLastBurn(m.activityBurn);
    setLastBudget(m.budget);
  }, [m.activityBurn, m.budget, setLastBurn, setLastBudget]);

  const handleProfileChange = useCallback((updates: Partial<UserProfile>) => {
    setProfile(updates); persistProfile(updates);
  }, [setProfile, persistProfile]);

  const handleWeightChange = useCallback((val: string) => {
    setTodayWeightRaw(val);
    updateDayRecord(todayStr, { weight: val });
  }, [todayStr, updateDayRecord]);

  const handleCalsChange = useCallback((val: string) => {
    setTodayCalsRaw(val);
    updateDayRecord(todayStr, { calsEaten: val, budget: m.budget });
  }, [todayStr, m.budget, updateDayRecord]);

  const handleProteinChange = useCallback((val: string) => {
    setTodayProteinRaw(val);
    const n = parseNum(val);
    if (n > 0) updateDayRecord(todayStr, { protein: n });
  }, [todayStr, updateDayRecord]);

  const undereatingWarning = useMemo(() => {
    const days = Object.keys(localDB).sort().reverse();
    let streak = 0;
    for (const ds of days) {
      const r = localDB[ds];
      const eaten  = parseNum(String(r.calsEaten ?? 0));
      const budget = parseNum(String(r.budget ?? 0));
      if (budget > 0 && eaten > 0 && eaten < budget * 0.60) streak++;
      else break;
      if (streak >= 3) return true;
    }
    return false;
  }, [localDB]);

  const handleLogToday = useCallback(() => {
    const cals = parseNum(todayCals);
    updateDayRecord(todayStr, {
      burn:   m.activityBurn,
      budget: m.budget,
      weight: todayWeight || undefined,
      ...(cals > 0 && { calsEaten: todayCals }),
    });

    const hasCals = cals > 0;
    const plan    = typeof window !== 'undefined' ? loadPlan() : null;

    let hitGoal = false;
    if (hasCals && m.budget > 0) {
      const minReasonable = m.budget * 0.40;
      hitGoal = plan?.type === 'bulk'
        ? cals >= m.budget * 0.9 && cals <= m.budget * 1.15
        : cals <= m.budget && cals >= minReasonable;
    }

    if (hitGoal) {
      navigator.vibrate?.([50, 30, 80]);
      setCelebrateVisible(true);
    } else {
      setProjVisible(true);
    }
  }, [todayStr, m.activityBurn, m.budget, todayWeight, todayCals, updateDayRecord]);

  const prFlags = useMemo((): PRFlags => {
    const today = (localDB[todayStr] ?? {}) as DayRecord;
    const others = Object.entries(localDB)
      .filter(([ds]) => ds !== todayStr)
      .map(([, r]) => r as DayRecord);

    const n = (v: string | number | undefined) => parseNum(String(v ?? 0));

    const todayRunDist  = n(today.runDist);
    const todayRunTime  = n(today.runTime);
    const todayRunPace  = todayRunDist > 0 && todayRunTime > 0 ? todayRunDist / todayRunTime : 0;
    const prevRunDist   = Math.max(0, ...others.map(r => n(r.runDist)));
    const prevRunPace   = Math.max(0, ...others
      .filter(r => n(r.runDist) > 0 && n(r.runTime) > 0)
      .map(r => n(r.runDist) / n(r.runTime)));
    const prRun = todayRunDist > 0 && (todayRunDist > prevRunDist || todayRunPace > prevRunPace);

    const todayBikeDist = n(today.bikeDist);
    const todayBikeTime = n(today.bikeTime);
    const todayBikePace = todayBikeDist > 0 && todayBikeTime > 0 ? todayBikeDist / todayBikeTime : 0;
    const prevBikeDist  = Math.max(0, ...others.map(r => n(r.bikeDist)));
    const prevBikePace  = Math.max(0, ...others
      .filter(r => n(r.bikeDist) > 0 && n(r.bikeTime) > 0)
      .map(r => n(r.bikeDist) / n(r.bikeTime)));
    const prBike = todayBikeDist > 0 && (todayBikeDist > prevBikeDist || todayBikePace > prevBikePace);

    const todaySwimTime = n(today.swimTime);
    const prevSwimTime  = Math.max(0, ...others.map(r => n(r.swimTime)));
    const prSwim = todaySwimTime > 0 && todaySwimTime > prevSwimTime;

    let prLift = false;
    try {
      type SetRow = { w?: string };
      type ExRow  = { k?: string; n?: string; sets?: SetRow[] };
      const todayExs: ExRow[] = today.exercises ? JSON.parse(String(today.exercises)) : [];

      const allTimeMax: Record<string, number> = {};
      others.forEach(r => {
        if (!r.exercises) return;
        try {
          (JSON.parse(String(r.exercises)) as ExRow[]).forEach(ex => {
            if (ex.k !== 'lift' || !ex.n || !ex.sets) return;
            ex.sets.forEach(s => {
              const w = parseNum(s.w ?? '0');
              if (w > 0) allTimeMax[ex.n!] = Math.max(allTimeMax[ex.n!] ?? 0, w);
            });
          });
        } catch { /* skip corrupt records */ }
      });

      todayExs.forEach(ex => {
        if (ex.k !== 'lift' || !ex.n || !ex.sets) return;
        ex.sets.forEach(s => {
          const w = parseNum(s.w ?? '0');
          if (w > 0 && w > (allTimeMax[ex.n!] ?? 0)) prLift = true;
        });
      });
    } catch { /* skip */ }

    return { prRun, prBike, prSwim, prLift };
  }, [localDB, todayStr]);

  const { calDays, avgNet, streak, workoutStreak, weighStreak } = useMemo(() => {
    const days = Object.keys(localDB)
      .map(ds => {
        const rec = localDB[ds];
        if (!rec.calsEaten) return null;
        const eaten = parseNum(rec.calsEaten);
        const budget = parseNum(rec.budget);
        return { ds, net: eaten - budget };
      })
      .filter(Boolean) as { ds: string; net: number }[];
    const avg    = days.length ? days.reduce((s, d) => s + d.net, 0) / days.length : 0;
    const logged = new Set(days.map(d => d.ds));

    const countStreak = (hasDay: (ds: string) => boolean) => {
      const c = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (!hasDay(todayStr)) c.setDate(c.getDate() - 1);
      let n = 0;
      while (hasDay(toDateStr(c))) { n++; c.setDate(c.getDate() - 1); }
      return n;
    };

    const s = countStreak(ds => logged.has(ds));

    const liftDays = new Set(
      Object.keys(localDB).filter(ds => {
        const r = localDB[ds];
        if (!r.exercises) return false;
        try { return (JSON.parse(String(r.exercises)) as Array<{ k?: string }>).some(e => e.k === 'lift'); }
        catch { return false; }
      })
    );
    const ws = countStreak(ds => liftDays.has(ds));

    const weighDays = new Set(Object.keys(localDB).filter(ds => parseFloat(String(localDB[ds]?.weight ?? '0')) > 0));
    const wis = countStreak(ds => weighDays.has(ds));

    return { calDays: days.length, avgNet: avg, streak: s, workoutStreak: ws, weighStreak: wis };
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

      <div className="flex items-center justify-between mb-3">
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

      {(streak > 0 || workoutStreak > 0 || weighStreak > 0) && (
        <div className="flex gap-1.5 mb-5 flex-wrap">
          {[
            { n: streak,        label: 'cal',    icon: '🔥' },
            { n: workoutStreak, label: 'lifts',  icon: '💪' },
            { n: weighStreak,   label: 'weigh',  icon: '⚖️' },
          ].filter(x => x.n > 0).map(x => (
            <span
              key={x.label}
              className="inline-flex items-center gap-1 font-mono text-[9px] font-bold tracking-[1px] text-[var(--ink-2)] border border-[var(--line-2)] bg-[var(--bg-2)] rounded-sm px-2 py-1"
            >
              {x.icon}
              <span className="text-[var(--accent)]">{x.n}</span>d {x.label}
            </span>
          ))}
        </div>
      )}

      <WeeklyRecapCard />

      {profileOpen && <ProfilePanel profile={profile} onChange={handleProfileChange} onOpenPlan={() => setPlanOpen(true)} onOpenRunPlan={() => setRunPlanOpen(true)} />}

      <CalorieBudgetCard m={m} onOpenProgress={() => setProgressOpen(true)} prFlags={prFlags} />

      <WeeklyVolumeCard />
      <TrophyCaseCard />
      <ActivityLogCard />
      <CalorieHistoryCard streak={streak} avgNet={avgNet} days={calDays} />
      <TrendsCard />

      <ProjectionModal
        open={projVisible}
        m={m}
        weightLbs={parseNum(todayWeight || profile.weight)}
        calsEaten={parseNum(todayCals)}
        localDB={localDB}
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

      <PlanProgressModal
        open={progressOpen}
        onClose={() => setProgressOpen(false)}
        localDB={localDB}
      />

      <CelebrationModal
        open={celebrateVisible}
        onClose={() => setCelebrateVisible(false)}
        localDB={localDB}
        calsEaten={parseNum(todayCals)}
        budget={m.budget}
      />

      <MilestoneModal
        open={milestone !== null}
        onClose={() => setMilestone(null)}
        pct={milestone?.pct ?? 0}
        weightChange={milestone?.weightChange ?? 0}
      />

      <AnimatePresence>
        {runPlanOpen && (
          <motion.div
            className="fixed inset-0 z-[400] flex flex-col bg-[var(--bg-0)]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line)]">
              <button
                onClick={() => setRunPlanOpen(false)}
                className="w-8 h-8 rounded flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--ink-1)] transition-colors"
              >
                <X size={18} />
              </button>
              <span className="font-mono text-[11px] font-bold tracking-[2px] uppercase text-[var(--ink-1)]">Running Plan</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <RunningPlanBuilder />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
