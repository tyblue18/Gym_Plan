'use client';

/**
 * components/MetricsDashboard.tsx
 *
 * Athletic redesign — all calculation logic (Mifflin-St Jeor, TDEE, MET tables,
 * eat-back math, weight projection, trend lines) preserved exactly.
 * Visual layer rebuilt around the QUE token system.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity, BarChart2, ChevronRight, Clock, Flame, Scale, TrendingUp, User,
} from 'lucide-react';
import {
  useApp, MONTHS,
  type DayRecord, type UserProfile,
} from '@/lib/AppContext';
import { useSpotlightBorder } from '@/hooks/useSpotlightBorder';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES — unchanged
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
// CALCULATION ENGINE — preserved exactly
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
// SUB-COMPONENT — ProfilePanel
// ─────────────────────────────────────────────────────────────────────────────

function ProfilePanel({ profile, onChange }: {
  profile: UserProfile;
  onChange: (updates: Partial<UserProfile>) => void;
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
        <h2 className="que-section-label mb-5"><span className="dot" />ATHLETE PROFILE</h2>

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
          {[
            { label: 'BMR (Mifflin-St Jeor)', value: `${fmt(m.bmr)} kcal`, indent: false, bold: false },
            { label: '× Activity Multiplier',  value: `× ${m.multiplier}`, indent: true,  bold: false },
            { label: '= Maintenance (TDEE)',   value: `${fmt(m.tdee)} kcal`, indent: false, bold: true },
            null,
            { label: '− Deficit Goal',         value: `−${fmt(m.deficit)} kcal`, indent: false, bold: false, red: true },
            { label: 'Tracked cardio burn',    value: m.activityBurn > 0 ? `${fmt(m.activityBurn)} kcal` : '— kcal', indent: true, bold: false, accent: true },
            { label: '+ 60% Eat-Back',         value: m.eatBack > 0 ? `+${fmt(m.eatBack)} kcal` : '+0 kcal', indent: false, bold: false, green: true },
          ].map((row, i) => {
            if (row === null) {
              return <hr key={i} className="my-1 border-0 h-px bg-[var(--line)]" />;
            }
            return (
              <div key={i} className="flex justify-between items-center py-2.5 border-b border-[var(--line)] last:border-b-0">
                <span className={[
                  'font-mono text-[11px] tracking-[0.5px]',
                  row.indent ? 'pl-4 text-[var(--ink-3)]' : 'text-[var(--ink-1)]',
                  row.bold   ? '!text-[12px] !font-bold !text-[var(--ink-0)] uppercase tracking-[1px]' : '',
                ].join(' ')}>
                  {row.label}
                </span>
                <span className={[
                  'font-mono font-bold tabular text-[13px]',
                  row.indent ? 'text-[11px] text-[var(--ink-3)]' : 'text-[var(--ink-0)]',
                  row.bold   ? '!text-[16px] !text-[var(--ink-0)]' : '',
                  row.red    ? '!text-[var(--danger)]' : '',
                  row.accent ? '!text-[var(--accent)]' : '',
                  row.green  ? '!text-[var(--positive)]' : '',
                ].join(' ')}>
                  {row.value}
                </span>
              </div>
            );
          })}
        </div>

        {/* Per-activity burn tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {tiles.map(t => (
            <div
              key={t.key}
              className={[
                'rounded p-3 border transition-all',
                t.dim
                  ? 'border-[var(--line)] bg-[var(--bg-2)] opacity-60'
                  : 'border-[var(--line-2)] bg-[var(--bg-2)] hover:border-[var(--accent)]',
              ].join(' ')}
            >
              <p className="font-mono text-[9px] font-bold tracking-[2px] text-[var(--ink-3)] mb-2">
                {t.label}
              </p>
              <p
                className="font-display tabular leading-none text-[26px]"
                style={{
                  color: t.dim ? 'var(--ink-3)' : 'var(--accent)',
                  textShadow: t.dim ? 'none' : '0 0 16px var(--accent-24)',
                }}
              >
                {t.value > 0 ? fmt(t.value) : '—'}
              </p>
              <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1 tracking-[1px]">
                {t.dim ? 'IN MULTIPLIER' : 'KCAL'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — CardioLogCard
// ─────────────────────────────────────────────────────────────────────────────

function CardioLogCard({
  cardio, m, todayLabel,
  todayWeight, todayCals,
  onChange, onWeightChange, onCalsChange, onLogToday,
}: {
  cardio: CardioFields; m: BudgetMetrics;
  todayLabel: string; todayWeight: string; todayCals: string;
  onChange: (field: keyof CardioFields, val: string) => void;
  onWeightChange: (v: string) => void;
  onCalsChange: (v: string) => void;
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
        <h2 className="que-section-label mb-5"><span className="dot" />DAILY CARDIO LOG</h2>

        {/* Steps */}
        <div className="mb-4">
          <label className="que-label">
            STEPS <span className="text-[var(--ink-3)] normal-case tracking-normal font-normal">— reference only</span>
          </label>
          <input type="number" className="que-input" value={cardio.steps} onChange={e => onChange('steps', e.target.value)} />
          <p className="mt-2 font-mono text-[10px] text-[var(--ink-2)] tracking-[1px] flex items-center gap-2">
            <span className="block w-1 h-1 bg-[var(--accent)]" />
            DISTANCE · {m.stepMiles.toFixed(2)} mi
          </p>
        </div>

        {/* Running */}
        <CardioSection title="RUN">
          <TwoCol>
            <NumberField label="Distance / mi" value={cardio.runDist} step={0.01} onChange={v => onChange('runDist', v)} />
            <NumberField label="Time / min"    value={cardio.runTime} step={1}    onChange={v => onChange('runTime', v)} />
          </TwoCol>
          <ChipLine>
            {m.runPaceStr ? `PACE · ${m.runPaceStr}  ·  ${fmt(m.runBurn)} KCAL` : 'PACE · —'}
          </ChipLine>
        </CardioSection>

        {/* Cycling */}
        <CardioSection title="BIKE">
          <TwoCol>
            <NumberField label="Distance / mi" value={cardio.bikeDist} step={0.01} onChange={v => onChange('bikeDist', v)} />
            <NumberField label="Time / min"    value={cardio.bikeTime} step={1}    onChange={v => onChange('bikeTime', v)} />
          </TwoCol>
          <ChipLine>
            {m.bikeSpeed > 0 ? `SPEED · ${m.bikeSpeed} MPH  ·  ${fmt(m.bikeBurn)} KCAL` : 'SPEED · —'}
          </ChipLine>
        </CardioSection>

        {/* Swimming */}
        <CardioSection title="SWIM">
          <NumberField label="Duration / min" value={cardio.swimTime} step={1} onChange={v => onChange('swimTime', v)} />
          <ChipLine>
            {m.swimBurn > 0 ? `${parseNum(cardio.swimTime)} MIN  ·  ${fmt(m.swimBurn)} KCAL` : 'BURN · —'}
          </ChipLine>
        </CardioSection>

        {/* Auto-save tag */}
        <p className="mt-5 font-mono text-[10px] tracking-[1px] text-[var(--ink-3)] flex items-center gap-2 uppercase">
          <Clock size={12} /> auto-save on
        </p>

        {/* Today's log */}
        <div className="border-t border-[var(--line)] mt-5 pt-5">
          <div className="flex items-baseline justify-between mb-3">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-[var(--ink-1)]">
              TODAY · MANUAL ENTRY
            </span>
            <span className="font-mono text-[10px] text-[var(--ink-3)] tracking-[1px]">{todayLabel}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Weight / lbs"   value={todayWeight} onChange={onWeightChange} />
            <NumberField label="Calories Eaten" value={todayCals}   onChange={onCalsChange} />
          </div>
        </div>

        <button onClick={onLogToday} className="que-btn-primary mt-4 w-full">
          LOG TODAY
        </button>
      </div>
    </div>
  );
}

function CardioSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--line)] pt-4 mt-4">
      <h3 className="font-mono text-[11px] font-bold uppercase tracking-[2px] text-[var(--accent)] mb-3 flex items-center gap-2">
        <span className="block w-1 h-3 bg-[var(--accent)]" />
        {title}
      </h3>
      {children}
    </div>
  );
}
function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
function NumberField({ label, value, step, onChange }: {
  label: string; value: string; step?: number; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="que-label">{label}</label>
      <input
        type="number" step={step} className="que-input"
        value={value} onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}
function ChipLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 font-mono text-[10px] tracking-[1px] text-[var(--ink-1)] flex items-center gap-2">
      <span className="block w-1 h-1 bg-[var(--accent)]" />
      {children}
    </p>
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

function drawProjection(canvas: HTMLCanvasElement, startWt: number, m: BudgetMetrics) {
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

  const handleCardioChange = useCallback((field: keyof CardioFields, val: string) => {
    setCardio(prev => {
      const next = { ...prev, [field]: val };
      updateDayRecord(activeDayFocus, {
        steps:    Number(next.steps)    || 0,
        runDist:  Number(next.runDist)  || 0,
        runTime:  Number(next.runTime)  || 0,
        bikeDist: Number(next.bikeDist) || 0,
        bikeTime: Number(next.bikeTime) || 0,
        swimTime: Number(next.swimTime) || 0,
      });
      return next;
    });
  }, [activeDayFocus, updateDayRecord]);

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

      {profileOpen && <ProfilePanel profile={profile} onChange={handleProfileChange} />}

      <CalorieBudgetCard m={m} />

      <CardioLogCard
        cardio={cardio}
        m={m}
        todayLabel={fmtDateLong(todayStr)}
        todayWeight={todayWeight}
        todayCals={todayCals}
        onChange={handleCardioChange}
        onWeightChange={handleWeightChange}
        onCalsChange={handleCalsChange}
        onLogToday={handleLogToday}
      />

      <ActivityLogCard />
      <CalorieHistoryCard streak={streak} avgNet={avgNet} days={calDays} />
      <WeightProjectionCard m={m} weightLbs={parseNum(profile.weight)} hidden={!projVisible} />
      <TrendsCard />
    </div>
  );
}
