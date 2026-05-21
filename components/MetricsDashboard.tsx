'use client';

/**
 * components/MetricsDashboard.tsx
 *
 * Native React port of metrics-calculator.js.
 * Replaces the Metrics tab of the vanilla JS app with a fully
 * React-managed component that consumes useApp() for all state.
 *
 * Calculation engine: Mifflin-St Jeor BMR → TDEE → deficit → 60% eat-back
 * Storage: reads/writes localDB via updateDayRecord + persistProfile
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Activity,
  BarChart2,
  ChevronRight,
  Clock,
  Flame,
  Scale,
  TrendingUp,
  User,
} from 'lucide-react';
import {
  useApp,
  MONTHS,
  type DayRecord,
  type UserProfile,
} from '@/lib/AppContext';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface CardioFields {
  steps:    string;
  runDist:  string;
  runTime:  string;
  bikeDist: string;
  bikeTime: string;
  swimTime: string;
}

const EMPTY_CARDIO: CardioFields = {
  steps: '0', runDist: '0', runTime: '0',
  bikeDist: '0', bikeTime: '0', swimTime: '0',
};

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  const v = n % 100;
  const s = ['th', 'st', 'nd', 'rd'];
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
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

// Locale-format with commas, no decimals
function fmt(n: number): string {
  return Math.round(n).toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────────────
// CALCULATION ENGINE — useBudgetMetrics
// All Mifflin-St Jeor + TDEE + cardio eat-back logic lives here.
// ─────────────────────────────────────────────────────────────────────────────

interface BudgetMetrics {
  bmr:         number;
  tdee:        number;
  deficit:     number;
  multiplier:  number;
  // steps
  stepMiles:   number;
  stepBurn:    number;
  // running
  runBurn:     number;
  runPaceStr:  string;   // "8:30 /mi" or ""
  runSpeed:    number;   // mph
  // cycling
  bikeBurn:    number;
  bikeSpeed:   number;   // mph
  // swimming
  swimBurn:    number;
  // totals
  activityBurn: number;
  eatBack:      number;
  budget:       number;
}

function useBudgetMetrics(
  profile: UserProfile,
  cardio: CardioFields,
): BudgetMetrics {
  return useMemo<BudgetMetrics>(() => {
    const wLbs = parseNum(profile.weight) || 180;
    const hIn  = parseNum(profile.height) || 70;
    const age  = parseNum(profile.age)    || 29;
    const sex  = profile.sex;
    const def  = parseNum(profile.deficit)        || 500;
    const mult = parseNum(profile.activityLevel)  || 1.55;
    const kg   = wLbs / 2.20462;
    const cm   = hIn  * 2.54;

    // ── BMR (Mifflin-St Jeor) ─────────────────────────────────────────────
    const bmr = Math.round(
      sex === 'male'
        ? 10 * kg + 6.25 * cm - 5 * age + 5
        : 10 * kg + 6.25 * cm - 5 * age - 161
    );

    // ── TDEE = BMR × activity multiplier ─────────────────────────────────
    const tdee = Math.round(bmr * mult);

    // ── Steps — reference only (baked into multiplier) ───────────────────
    const steps     = parseNum(cardio.steps);
    const stride    = hIn * (sex === 'male' ? 0.418 : 0.415);
    const stepMiles = (steps * stride) / 63360;
    const stepBurn  = Math.round(stepMiles * 0.57 * wLbs);

    // ── Running — MET-based ───────────────────────────────────────────────
    const rMi  = parseNum(cardio.runDist);
    const rMin = parseNum(cardio.runTime);
    let runBurn = 0, runPaceStr = '', runSpeed = 0;
    if (rMi > 0 && rMin > 0) {
      runSpeed         = (rMi / rMin) * 60;
      const pace       = rMin / rMi;
      const pMin       = Math.floor(pace);
      const pSec       = Math.round((pace - pMin) * 60).toString().padStart(2, '0');
      runPaceStr        = `${pMin}:${pSec} /mi`;
      let met           = 6;
      if      (runSpeed >= 9) met = 12.8;
      else if (runSpeed >= 8) met = 11.8;
      else if (runSpeed >= 7) met = 11;
      else if (runSpeed >= 6) met = 9.8;
      else if (runSpeed >= 5) met = 9;
      runBurn = Math.round(met * 3.5 * kg / 200 * rMin);
    }

    // ── Cycling — MET-based ───────────────────────────────────────────────
    const bMi  = parseNum(cardio.bikeDist);
    const bMin = parseNum(cardio.bikeTime);
    let bikeBurn = 0, bikeSpeed = 0;
    if (bMi > 0 && bMin > 0) {
      bikeSpeed = (bMi / bMin) * 60;
      let met   = 4;
      if      (bikeSpeed >= 20) met = 15;
      else if (bikeSpeed >= 16) met = 12;
      else if (bikeSpeed >= 14) met = 10;
      else if (bikeSpeed >= 12) met = 8;
      else if (bikeSpeed >= 10) met = 6;
      bikeBurn = Math.round(met * 3.5 * kg / 200 * bMin);
    }

    // ── Swimming — MET 6.0 (general / drills) ────────────────────────────
    const sMin    = parseNum(cardio.swimTime);
    const swimBurn = sMin > 0 ? Math.round(6.0 * 3.5 * kg / 200 * sMin) : 0;

    // ── Food Budget = TDEE − Deficit + 60% cardio eat-back ───────────────
    const activityBurn = Math.round(runBurn + bikeBurn + swimBurn);
    const eatBack      = Math.round(activityBurn * 0.60);
    const budget       = Math.max(0, (tdee - def) + eatBack);

    return {
      bmr, tdee, deficit: def, multiplier: mult,
      stepMiles, stepBurn,
      runBurn,  runPaceStr, runSpeed:  Math.round(runSpeed  * 10) / 10,
      bikeBurn,             bikeSpeed: Math.round(bikeSpeed * 10) / 10,
      swimBurn,
      activityBurn, eatBack, budget,
    };
  }, [profile, cardio]);
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CLASS FRAGMENTS
// ─────────────────────────────────────────────────────────────────────────────

const CARD_BASE =
  'relative rounded-2xl border border-slate-800/50 backdrop-blur-md overflow-hidden mb-4';

const INPUT_BASE =
  'w-full rounded-lg bg-[#111228] border border-[rgba(140,150,255,0.12)] text-white ' +
  'text-sm px-3 py-2.5 outline-none focus:border-[rgba(200,210,255,0.28)] ' +
  'focus:ring-2 focus:ring-white/7 transition-all appearance-none';

const LABEL_BASE =
  'block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5';

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
    { value: '1.40', label: 'Desk + gym 3×/wk — lifting (×1.40)' },
    { value: '1.45', label: 'Desk + gym 4–5×/wk — lifting (×1.45)' },
    { value: '1.55', label: 'Active job + gym 4–5×/wk (×1.55)' },
    { value: '1.65', label: 'Physical job + heavy daily training (×1.65)' },
  ];

  return (
    <div
      className={`${CARD_BASE} border-t-2 border-indigo-400/45`}
      style={{ background: 'linear-gradient(150deg,#090c1e 0%,#060810 100%)' }}
    >
      <div className="p-5">
        <h2 className="flex items-center gap-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-5">
          <User size={13} className="text-indigo-400/70" />
          Your Profile
          <span className="flex-1 h-px bg-gradient-to-r from-slate-800 to-transparent" />
        </h2>

        <div className="mb-4 text-xs text-slate-400 bg-slate-900/50 border-l-2 border-slate-600 rounded px-3 py-2.5 leading-relaxed">
          Set <strong className="text-white">Activity Level</strong> to match your typical week
          (lifting only — cardio is tracked separately). Budget = Maintenance − Deficit + 60% eat-back.
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Weight (lbs)', field: 'weight' as const, type: 'number' },
            { label: 'Height (in)',  field: 'height' as const, type: 'number' },
            { label: 'Age',          field: 'age'    as const, type: 'number' },
          ].map(({ label, field, type }) => (
            <div key={field}>
              <label className={LABEL_BASE}>{label}</label>
              <input
                type={type}
                className={INPUT_BASE}
                value={profile[field]}
                onChange={e => onChange({ [field]: e.target.value })}
              />
            </div>
          ))}

          <div>
            <label className={LABEL_BASE}>Sex</label>
            <select
              className={INPUT_BASE + ' cursor-pointer'}
              value={profile.sex}
              onChange={e => onChange({ sex: e.target.value as 'male' | 'female' })}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          <div>
            <label className={LABEL_BASE}>Deficit (kcal)</label>
            <input
              type="number"
              className={INPUT_BASE}
              value={profile.deficit}
              onChange={e => onChange({ deficit: e.target.value })}
            />
          </div>

          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <label className={LABEL_BASE}>Lifestyle + Gym</label>
            <select
              className={INPUT_BASE + ' cursor-pointer'}
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
  const tiles = [
    { label: '🏃 Running',  value: m.runBurn,  key: 'run' },
    { label: '🚴 Cycling',  value: m.bikeBurn, key: 'bike' },
    { label: '🏊 Swimming', value: m.swimBurn, key: 'swim' },
    { label: 'Steps (ref)',  value: m.stepBurn, key: 'step', dim: true },
  ];

  return (
    <div
      className={`${CARD_BASE} border-t-2 border-amber-500/55`}
      style={{
        background: 'linear-gradient(150deg,#110e06 0%,#07060f 100%)',
        boxShadow: '0 0 60px -15px rgba(245,158,11,0.13),inset 0 1px 0 rgba(245,158,11,0.06)',
      }}
    >
      <div className="p-5">
        {/* Section title */}
        <h2 className="flex items-center gap-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-5">
          <Flame size={13} className="text-amber-500/70" />
          Calorie Budget
          <span className="flex-1 h-px bg-gradient-to-r from-amber-900/40 to-transparent" />
        </h2>

        {/* ── Hero number ── */}
        <div
          className="relative rounded-xl text-center px-6 py-8 mb-4 overflow-hidden border border-amber-500/14"
          style={{
            background: [
              'radial-gradient(ellipse 70% 55% at 50% 90%,rgba(245,158,11,0.09) 0%,transparent 65%)',
              'linear-gradient(180deg,rgba(245,158,11,0.04) 0%,transparent 50%)',
              '#0d0a06',
            ].join(','),
            // bottom glow line
          }}
        >
          {/* Bottom accent line */}
          <span
            className="absolute bottom-0 left-[20%] right-[20%] h-px"
            style={{ background: 'linear-gradient(90deg,transparent,rgba(245,158,11,0.3),transparent)' }}
          />

          <p className="text-[10px] font-extrabold tracking-[2.5px] uppercase text-amber-500/75 mb-3">
            Daily Food Budget
          </p>

          {/* The main hero number — ambient glow via shadow-[…] */}
          <p
            className="text-[64px] leading-none font-extrabold tracking-[-4px] text-white font-mono"
            style={{ textShadow: '0 0 40px rgba(245,158,11,0.20)' }}
          >
            {fmt(m.budget)}
            <span className="text-3xl tracking-normal font-semibold text-amber-500/50 ml-2">kcal</span>
          </p>

          <p className="mt-3 text-[11px] font-mono text-amber-500/40 tracking-wide">
            {`(${fmt(m.tdee)} − ${fmt(m.deficit)}${m.eatBack > 0 ? ` + ${fmt(m.eatBack)}` : ''} = ${fmt(m.budget)} kcal)`}
          </p>
        </div>

        {/* ── Budget math breakdown ── */}
        <div
          className="rounded-xl border border-amber-500/8 mb-4"
          style={{ background: 'rgba(0,0,0,0.25)', padding: '4px 16px' }}
        >
          {[
            { label: 'BMR (Mifflin-St Jeor)', value: `${fmt(m.bmr)} kcal`, indent: false, bold: false },
            { label: `× Activity Multiplier`, value: `× ${m.multiplier}`, indent: true,  bold: false },
            { label: '= Maintenance (TDEE)',   value: `${fmt(m.tdee)} kcal`, indent: false, bold: true },
            null,
            { label: '− Deficit Goal',         value: `−${fmt(m.deficit)} kcal`, indent: false, bold: false, red: true },
            { label: 'Tracked cardio burn (run + bike + swim)', value: m.activityBurn > 0 ? `${fmt(m.activityBurn)} kcal` : '— kcal', indent: true, bold: false, amber: true },
            { label: '+ 60% Eat-Back (cardio only)', value: m.eatBack > 0 ? `+${fmt(m.eatBack)} kcal` : '+0 kcal', indent: false, bold: false, green: true },
          ].map((row, i) => {
            if (row === null) {
              return (
                <hr key={i} className="my-1 border-0 h-px"
                  style={{ background: 'linear-gradient(90deg,transparent,rgba(245,158,11,0.18),transparent)' }}
                />
              );
            }
            return (
              <div
                key={i}
                className="flex justify-between items-center py-2.5 border-b border-white/4 last:border-b-0"
              >
                <span className={[
                  'text-[12px] font-medium tracking-tight',
                  row.indent ? 'pl-4 text-[11px] text-[#343845]' : 'text-[#4a5060]',
                  row.bold   ? '!text-[13px] font-bold !text-[#9da0b8]' : '',
                ].join(' ')}>
                  {row.label}
                </span>
                <span className={[
                  'font-mono font-bold tabular-nums text-sm tracking-tight',
                  row.indent ? 'text-xs text-[#3e4255]' : 'text-[#c8cad8]',
                  row.bold   ? '!text-[17px] !text-white' : '',
                  row.red    ? '!text-[#d97070]' : '',
                  row.amber  ? '!text-[#c4a06a]' : '',
                  row.green  ? '!text-[#80b99a]' : '',
                ].join(' ')}>
                  {row.value}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Per-activity burn tiles ── */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {tiles.map(t => (
            <div
              key={t.key}
              className={[
                'rounded-lg px-4 py-3 border transition-all',
                t.dim
                  ? 'border-[rgba(140,150,255,0.08)] opacity-50'
                  : 'border-amber-500/16',
              ].join(' ')}
              style={{
                background: t.dim
                  ? 'linear-gradient(145deg,#0d0e20 0%,#06070f 100%)'
                  : 'linear-gradient(145deg,rgba(245,158,11,0.07) 0%,rgba(0,0,0,0.3) 100%)',
              }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#383c50] mb-2">
                {t.label}
              </p>
              <p
                className="text-lg font-extrabold font-mono tabular-nums"
                style={{
                  color: t.dim ? '#3e4255' : '#c4a06a',
                  textShadow: t.dim ? 'none' : '0 0 20px rgba(245,158,11,0.25)',
                }}
              >
                {t.value > 0 ? `${fmt(t.value)} kcal` : '— kcal'}
              </p>
              {t.dim && (
                <p className="text-[9px] text-[#333] mt-1 leading-tight">Covered by ×multiplier</p>
              )}
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
  cardio:          CardioFields;
  m:               BudgetMetrics;
  todayLabel:      string;
  todayWeight:     string;
  todayCals:       string;
  onChange:        (field: keyof CardioFields, val: string) => void;
  onWeightChange:  (v: string) => void;
  onCalsChange:    (v: string) => void;
  onLogToday:      () => void;
}) {
  return (
    <div
      className={CARD_BASE}
      style={{ background: 'linear-gradient(150deg,#0d0e20 0%,#070810 100%)' }}
    >
      <div className="p-5">
        <h2 className="flex items-center gap-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-5">
          <Activity size={13} className="text-cyan-400/70" />
          Daily Cardio Log
          <span className="flex-1 h-px bg-gradient-to-r from-slate-800 to-transparent" />
        </h2>

        {/* Steps */}
        <div className="mb-4">
          <label className={LABEL_BASE}>
            Step Count{' '}
            <span className="normal-case font-normal tracking-normal text-slate-600">
              — reference only, not added to budget
            </span>
          </label>
          <input
            type="number"
            className={INPUT_BASE}
            value={cardio.steps}
            onChange={e => onChange('steps', e.target.value)}
          />
          <p className="mt-1.5 text-xs font-mono text-white/60 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/60" />
            Distance: {m.stepMiles.toFixed(2)} mi
          </p>
        </div>

        {/* Running */}
        <CardioSection title="Running" icon="🏃">
          <TwoCol>
            <NumberField label="Distance (mi)" value={cardio.runDist} step={0.01}
              onChange={v => onChange('runDist', v)} />
            <NumberField label="Time (min)"    value={cardio.runTime} step={1}
              onChange={v => onChange('runTime', v)} />
          </TwoCol>
          {m.runPaceStr ? (
            <ChipLine>{`Pace: ${m.runPaceStr}  ·  ${fmt(m.runBurn)} kcal`}</ChipLine>
          ) : (
            <ChipLine>Pace: — /mi</ChipLine>
          )}
        </CardioSection>

        {/* Cycling */}
        <CardioSection title="Cycling" icon="🚴">
          <TwoCol>
            <NumberField label="Distance (mi)" value={cardio.bikeDist} step={0.01}
              onChange={v => onChange('bikeDist', v)} />
            <NumberField label="Time (min)"    value={cardio.bikeTime} step={1}
              onChange={v => onChange('bikeTime', v)} />
          </TwoCol>
          {m.bikeSpeed > 0 ? (
            <ChipLine>{`Speed: ${m.bikeSpeed} mph  ·  ${fmt(m.bikeBurn)} kcal`}</ChipLine>
          ) : (
            <ChipLine>Speed: — mph</ChipLine>
          )}
        </CardioSection>

        {/* Swimming */}
        <CardioSection title="Swimming" icon="🏊">
          <NumberField label="Duration (min)" value={cardio.swimTime} step={1}
            onChange={v => onChange('swimTime', v)} />
          {m.swimBurn > 0 ? (
            <ChipLine>{`${parseNum(cardio.swimTime)} min  ·  ${fmt(m.swimBurn)} kcal burned`}</ChipLine>
          ) : (
            <ChipLine>Burn: — kcal</ChipLine>
          )}
        </CardioSection>

        {/* Auto-save note */}
        <p className="mt-4 text-[11px] text-slate-600 flex items-center gap-2">
          <Clock size={14} />
          Changes save automatically
        </p>

        {/* ── Today's Log ── */}
        <div className="border-t border-white/5 mt-5 pt-5">
          <div className="flex justify-between items-center mb-3.5">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              Today&apos;s Log
            </span>
            <span className="text-[11px] font-mono text-slate-600">{todayLabel}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Weight (lbs)" value={todayWeight}
              onChange={onWeightChange} />
            <NumberField label="Calories Eaten" value={todayCals}
              onChange={onCalsChange} />
          </div>
        </div>

        {/* Log Today button */}
        <button
          onClick={onLogToday}
          className="mt-4 w-full rounded-lg bg-[#f0f0f0] text-[#0a0a0a] py-3 text-xs font-bold uppercase tracking-widest transition-all hover:bg-white hover:scale-[1.01] active:scale-[0.98]"
        >
          Log Today
        </button>
      </div>
    </div>
  );
}

// ── Tiny layout helpers (local to this file) ──────────────────────────────────

function CardioSection({ title, icon, children }: {
  title: string; icon: string; children: React.ReactNode;
}) {
  return (
    <div className="border-t border-white/5 pt-4 mt-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function NumberField({
  label, value, step, onChange,
}: {
  label: string; value: string; step?: number; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className={LABEL_BASE}>{label}</label>
      <input
        type="number"
        step={step}
        className={INPUT_BASE}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

function ChipLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-xs font-mono font-bold text-white/60 flex items-center gap-1.5">
      <span className="inline-block w-1 h-1 rounded-full bg-white/50" />
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

  const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayStr = toDateStr(today);

  const allKeys = useMemo(
    () => Object.keys(localDB).sort((a, b) => b.localeCompare(a)),
    [localDB]
  );

  const visible = useMemo(() => {
    const keys = allKeys.includes(todayStr)
      ? allKeys
      : [todayStr, ...allKeys];
    return keys.slice(0, page);
  }, [allKeys, todayStr, page]);

  const remaining = allKeys.length - page;

  return (
    <div
      className={CARD_BASE}
      style={{ background: 'linear-gradient(150deg,#0d0e20 0%,#070810 100%)' }}
    >
      <div className="p-5">
        <h2 className="flex items-center gap-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">
          <BarChart2 size={13} className="text-indigo-400/60" />
          Activity Log
          <span className="flex-1 h-px bg-gradient-to-r from-slate-800 to-transparent" />
        </h2>

        {visible.length === 0 ? (
          <p className="text-center text-slate-600 text-sm py-7 border border-dashed border-slate-800 rounded-xl">
            No logged days yet.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {visible.map(ds => {
              const rec    = localDB[ds] ?? {};
              const d      = new Date(ds + 'T00:00:00');
              const dayIdx = Math.round((today.getTime() - d.getTime()) / 86400000);
              const label  = dayIdx === 0 ? 'Today'
                : dayIdx === 1 ? 'Yesterday'
                : `${DOW[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
              const eaten  = parseNum(rec.calsEaten);
              const budget = parseNum(rec.budget);
              let netEl: React.ReactNode = <span className="font-mono font-bold text-sm text-slate-700">—</span>;
              if (rec.calsEaten && budget) {
                const net = Math.round(eaten - budget);
                const col = net <= 0 ? 'text-[#80b99a]' : 'text-[#d97070]';
                netEl = (
                  <span className={`font-mono font-bold text-sm ${col}`}>
                    {net > 0 ? '+' : ''}{net.toLocaleString()} kcal
                  </span>
                );
              }
              return (
                <div
                  key={ds}
                  className="flex justify-between items-center px-4 py-3 rounded-lg bg-[#111228]/60 border border-white/4 hover:bg-[#181a32]/60 transition-colors"
                >
                  <span className="text-sm font-semibold text-white">{label}</span>
                  {netEl}
                </div>
              );
            })}
          </div>
        )}

        {remaining > 0 && (
          <button
            onClick={() => setPage(p => p + 30)}
            className="mt-3 w-full py-3 rounded-lg text-sm font-bold text-slate-400 bg-[#111228] border border-slate-800/60 hover:text-white hover:scale-[1.01] transition-all"
          >
            Load {Math.min(30, remaining)} more ({remaining} remaining)
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — CalorieHistoryCard (trigger)
// ─────────────────────────────────────────────────────────────────────────────

function CalorieHistoryCard({ streak, avgNet, days }: {
  streak: number; avgNet: number; days: number;
}) {
  const col = avgNet <= 0 ? '#80b99a' : '#d97070';
  return (
    <div
      className={`${CARD_BASE} cursor-pointer transition-all hover:border-slate-600/60`}
      style={{ background: 'linear-gradient(150deg,#0d0e20 0%,#070810 100%)' }}
    >
      <div className="p-5 flex justify-between items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="flex items-center gap-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
            <Clock size={13} className="text-emerald-400/70" />
            Calorie History
            <span className="flex-1 h-px bg-gradient-to-r from-slate-800 to-transparent" />
          </h2>
          {days > 0 ? (
            <p className="text-xs text-slate-400">
              {days} days logged · avg{' '}
              <span className="font-semibold font-mono" style={{ color: col }}>
                {avgNet > 0 ? '+' : ''}{fmt(avgNet)} kcal/day
              </span>
            </p>
          ) : (
            <p className="text-xs text-slate-600">Tap to view</p>
          )}
        </div>
        {streak > 0 && (
          <div className="text-center flex-shrink-0 min-w-[48px]">
            <p className="text-3xl font-extrabold font-mono text-white leading-none">{streak}</p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 mt-1">day streak</p>
          </div>
        )}
        <ChevronRight size={18} className="text-slate-600 flex-shrink-0" />
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
    <div
      className={CARD_BASE}
      style={{ background: 'linear-gradient(150deg,#0d0e20 0%,#070810 100%)' }}
    >
      <div className="p-5">
        <h2 className="flex items-center gap-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-5">
          <TrendingUp size={13} className="text-cyan-400/60" />
          Weight Projection
          <span className="text-[10px] normal-case tracking-normal text-slate-700 font-normal">estimate</span>
          <span className="flex-1 h-px bg-gradient-to-r from-slate-800 to-transparent" />
        </h2>
        <canvas ref={canvasRef} className="block w-full h-[200px]" />
        <p className="mt-3 text-[11px] text-slate-700 text-center leading-relaxed">
          3,500 kcal ≈ 1 lb. Budget eats back 60% of cardio; the remaining 40% counts as deficit.
        </p>
      </div>
    </div>
  );
}

function drawProjection(canvas: HTMLCanvasElement, startWt: number, m: BudgetMetrics) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.offsetWidth || 300;
  const H   = 200;
  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // daily net: all cardio — 40% of cardio burn is deficit (60% eaten back via budget)
  const dailyNet  = (m.budget - m.bmr * m.multiplier) - m.activityBurn * 0.40;
  const lbsPerDay = dailyNet / 3500;
  const DAYS = 91;
  const pts  = Array.from({ length: DAYS }, (_, i) => startWt + lbsPerDay * i);
  const minW = Math.min(...pts), maxW = Math.max(...pts);
  const span = (maxW - minW) || 1;
  const PAD  = { t: 20, b: 32, l: 52, r: 16 };
  const xOf  = (i: number) => PAD.l + (i / (DAYS - 1)) * (W - PAD.l - PAD.r);
  const yOf  = (v: number) => H - PAD.b - ((v - minW) / span) * (H - PAD.t - PAD.b);
  const col  = dailyNet <= 0 ? '#80b99a' : '#d97070';
  const rgb  = dailyNet <= 0 ? '128,185,154' : '217,112,112';

  // Week grid lines
  for (let w = 1; w <= 13; w++) {
    const d = w * 7; if (d >= DAYS) break;
    ctx.strokeStyle = w % 4 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(xOf(d), PAD.t); ctx.lineTo(xOf(d), H - PAD.b); ctx.stroke();
    if (w % 4 === 0 || w === 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.font = '9px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(`W${w}`, xOf(d), H - 10);
    }
  }

  // Baseline
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(PAD.l, yOf(startWt)); ctx.lineTo(W - PAD.r, yOf(startWt)); ctx.stroke();
  ctx.setLineDash([]);

  // Y labels
  [startWt, pts[DAYS - 1]].forEach(v => {
    ctx.fillStyle = 'rgba(255,255,255,0.30)'; ctx.font = '9px system-ui'; ctx.textAlign = 'right';
    ctx.fillText(`${v.toFixed(1)}`, PAD.l - 4, yOf(v) + 3);
  });

  // Gradient fill
  const grad = ctx.createLinearGradient(0, PAD.t, 0, H - PAD.b);
  grad.addColorStop(0, `rgba(${rgb},0.18)`); grad.addColorStop(1, `rgba(${rgb},0)`);
  ctx.beginPath(); ctx.moveTo(xOf(0), yOf(pts[0]));
  pts.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)));
  ctx.lineTo(xOf(DAYS - 1), H - PAD.b); ctx.lineTo(xOf(0), H - PAD.b); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath(); ctx.moveTo(xOf(0), yOf(pts[0]));
  pts.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)));
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

  // Today dot
  ctx.beginPath(); ctx.arc(xOf(0), yOf(pts[0]), 4, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '9px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('Today', xOf(0) + 7, yOf(pts[0]) - 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — TrendsCard (canvas)
// ─────────────────────────────────────────────────────────────────────────────

type TrendKey = 'weight' | 'burn' | 'budget';

function TrendsCard() {
  const { localDB } = useApp();
  const [activeTab, setActiveTab] = useState<TrendKey>('weight');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const chartConfig: Record<TrendKey, { label: string; color: string; unit: string }> = {
    weight: { label: '⚖ Weight',       color: 'rgb(139,108,247)', unit: ' lbs' },
    burn:   { label: '🔥 Activity Burn', color: 'rgb(245,166,35)',  unit: ' kcal' },
    budget: { label: '🍽 Food Budget',   color: 'rgb(79,142,247)',  unit: ' kcal' },
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const keys = Object.keys(localDB).sort().slice(-90);
    if (keys.length < 2) return;
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
    <div
      className={CARD_BASE}
      style={{ background: 'linear-gradient(150deg,#0d0e20 0%,#070810 100%)' }}
    >
      <div className="p-5">
        <h2 className="flex items-center gap-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">
          <BarChart2 size={13} className="text-indigo-400/60" />
          Trends
          <span className="flex-1 h-px bg-gradient-to-r from-slate-800 to-transparent" />
        </h2>

        {/* Tab row */}
        <div className="flex gap-2 flex-wrap mb-4">
          {(Object.keys(chartConfig) as TrendKey[]).map(k => (
            <button
              key={k}
              onClick={() => setActiveTab(k)}
              className={[
                'px-4 py-1.5 rounded-full text-xs font-bold border transition-all',
                activeTab === k
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'bg-transparent border-slate-800 text-slate-500 hover:text-white hover:border-slate-600',
              ].join(' ')}
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

function drawLineChart(
  canvas: HTMLCanvasElement,
  labels: string[],
  values: number[],
  color: string,
  unit: string,
) {
  const dpr  = window.devicePixelRatio || 1;
  const cssW = canvas.offsetWidth || 600;
  const cssH = parseInt(getComputedStyle(canvas).height) || 220;
  canvas.width  = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  const W = cssW, H = cssH;
  const pad = { t: 16, r: 16, b: 36, l: 58 };
  const cW  = W - pad.l - pad.r;
  const cH  = H - pad.t - pad.b;
  ctx.clearRect(0, 0, W, H);

  const valid = values.filter(v => v > 0);
  if (valid.length < 2) {
    ctx.fillStyle = 'rgba(71,85,105,0.7)';
    ctx.font = '13px Plus Jakarta Sans,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Not enough data — keep logging!', W / 2, H / 2);
    return;
  }

  const vMin = Math.min(...valid), vMax = Math.max(...valid);
  const pad2 = (vMax - vMin) * 0.12 || vMax * 0.05 || 5;
  const yMin = vMin - pad2, yMax = vMax + pad2, yR = yMax - yMin;
  const xOf  = (i: number) => pad.l + (labels.length > 1 ? i / (labels.length - 1) : 0.5) * cW;
  const yOf  = (v: number) => pad.t + (1 - (v - yMin) / yR) * cH;

  ctx.strokeStyle = 'rgba(71,85,105,0.2)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (i / 4) * cH;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke();
    const val = yMax - (i / 4) * yR;
    ctx.fillStyle = 'rgba(71,85,105,0.8)'; ctx.font = '10px JetBrains Mono,monospace'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(val) + unit, pad.l - 5, y + 3.5);
  }
  ctx.fillStyle = 'rgba(71,85,105,0.8)'; ctx.textAlign = 'center'; ctx.font = '9px JetBrains Mono,monospace';
  const step = Math.max(1, Math.ceil(labels.length / 8));
  labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) ctx.fillText(l, xOf(i), H - pad.b + 14); });

  const pts = values.map((v, i) => ({ v, i })).filter(p => p.v > 0);
  if (pts.length >= 2) {
    ctx.beginPath();
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
    const rgba  = color.replace('rgb(', 'rgba(').replace(')', ',');
    grad.addColorStop(0, rgba + '0.2)'); grad.addColorStop(1, rgba + '0.0)');
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
      ctx.beginPath(); ctx.fillStyle = '#070910'; ctx.arc(xOf(i), yOf(v), 1.5, 0, Math.PI * 2); ctx.fill();
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT — MetricsDashboard
// ─────────────────────────────────────────────────────────────────────────────

export default function MetricsDashboard() {
  const {
    today, todayStr,
    activeDayFocus,
    profile, setProfile,
    persistProfile,
    localDB, updateDayRecord, setLastBurn, setLastBudget,
    getLastKnownWeight,
    isLoaded,
  } = useApp();

  // ── Local UI state ────────────────────────────────────────────────────────
  const [profileOpen,  setProfileOpen]  = useState(false);
  const [projVisible,  setProjVisible]  = useState(false);
  const [cardio, setCardio]             = useState<CardioFields>(EMPTY_CARDIO);
  const [todayWeight, setTodayWeightRaw] = useState('');
  const [todayCals,   setTodayCalsRaw]   = useState('');

  // ── Hydrate cardio + today fields from localDB on day change ─────────────
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
    // Today-only fields
    const todayRec = localDB[todayStr] ?? {};
    setTodayWeightRaw(String(todayRec.weight ?? getLastKnownWeight(todayStr) ?? ''));
    setTodayCalsRaw(String(todayRec.calsEaten ?? ''));
  }, [isLoaded, activeDayFocus, todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived budget calculations ────────────────────────────────────────────
  const m = useBudgetMetrics(profile, cardio);

  // ── Push burn/budget back into context whenever they change ───────────────
  useEffect(() => {
    setLastBurn(m.activityBurn);
    setLastBudget(m.budget);
  }, [m.activityBurn, m.budget, setLastBurn, setLastBudget]);

  // ── Persist cardio on change ───────────────────────────────────────────────
  const handleCardioChange = useCallback(
    (field: keyof CardioFields, val: string) => {
      setCardio(prev => {
        const next = { ...prev, [field]: val };
        // Persist to the active day record
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
    },
    [activeDayFocus, updateDayRecord]
  );

  // ── Profile change ─────────────────────────────────────────────────────────
  const handleProfileChange = useCallback(
    (updates: Partial<UserProfile>) => {
      setProfile(updates);
      persistProfile(updates);
    },
    [setProfile, persistProfile]
  );

  // ── Today-only fields ──────────────────────────────────────────────────────
  const handleWeightChange = useCallback(
    (val: string) => {
      setTodayWeightRaw(val);
      updateDayRecord(todayStr, { weight: val });
    },
    [todayStr, updateDayRecord]
  );

  const handleCalsChange = useCallback(
    (val: string) => {
      setTodayCalsRaw(val);
      updateDayRecord(todayStr, { calsEaten: val });
    },
    [todayStr, updateDayRecord]
  );

  // ── "Log Today" ────────────────────────────────────────────────────────────
  const handleLogToday = useCallback(() => {
    updateDayRecord(todayStr, {
      burn:   m.activityBurn,
      budget: m.budget,
      weight: todayWeight || undefined,
    });
    setProjVisible(true);
  }, [todayStr, m.activityBurn, m.budget, todayWeight, updateDayRecord]);

  // ── Calorie history summary ────────────────────────────────────────────────
  const { calDays, avgNet, streak } = useMemo(() => {
    const days = Object.keys(localDB)
      .map(ds => {
        const rec  = localDB[ds];
        if (!rec.calsEaten) return null;
        const eaten  = parseNum(rec.calsEaten);
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
      s++;
      cur.setDate(cur.getDate() - 1);
    }
    return { calDays: days.length, avgNet: avg, streak: s };
  }, [localDB, today, todayStr]);

  // ─────────────────────────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-600 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 pb-24 lg:py-8">

      {/* ── Metrics header ── */}
      <div className="flex justify-between items-center mb-5">
        <div className="flex items-center gap-2.5 font-mono text-sm font-bold text-slate-400 tracking-wide">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: '#80b99a' }}
          />
          {fmtDateLong(activeDayFocus)}
        </div>
        <button
          onClick={() => setProfileOpen(o => !o)}
          title="Your Profile"
          className={[
            'w-10 h-10 rounded-full flex items-center justify-center border transition-all',
            profileOpen
              ? 'border-white/22 bg-white/7 text-white'
              : 'border-slate-800 bg-[#111228] text-slate-400 hover:border-slate-600 hover:text-white',
          ].join(' ')}
        >
          <User size={18} />
        </button>
      </div>

      {/* ── Profile panel ── */}
      {profileOpen && (
        <ProfilePanel profile={profile} onChange={handleProfileChange} />
      )}

      {/* ── 1. Calorie Budget ── */}
      <CalorieBudgetCard m={m} />

      {/* ── 2. Daily Cardio Log ── */}
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

      {/* ── 3. Activity Log ── */}
      <ActivityLogCard />

      {/* ── 4. Calorie History ── */}
      <CalorieHistoryCard streak={streak} avgNet={avgNet} days={calDays} />

      {/* ── 5. Weight Projection (revealed after Log Today) ── */}
      <WeightProjectionCard
        m={m}
        weightLbs={parseNum(profile.weight)}
        hidden={!projVisible}
      />

      {/* ── 6. Trends ── */}
      <TrendsCard />
    </div>
  );
}
