'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronDown, ChevronUp, RotateCcw,
  Zap, Activity,
} from 'lucide-react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip,
} from 'recharts';
import { buildTrainingPlan }                    from '@/lib/running/plan';
import { formatPace, formatTime, RACE_LABELS }  from '@/lib/running/vdot';
import type {
  TrainingInputs, TrainingPlan, TrainingPhase,
  WorkoutType, RaceDistance, DayOfWeek,
} from '@/lib/running/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = 'queRunningPlan';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const RACE_OPTIONS: { value: RaceDistance; label: string }[] = [
  { value: '5k',      label: '5K' },
  { value: '10k',     label: '10K' },
  { value: 'half',    label: 'Half Marathon' },
  { value: 'marathon', label: 'Marathon' },
];

const PHASE_COLORS: Record<TrainingPhase, string> = {
  base:   '#6B7FD7',
  build1: '#34D399',
  build2: '#FBBF24',
  peak:   '#FB923C',
  taper:  '#A78BFA',
};

const PHASE_LABELS: Record<TrainingPhase, string> = {
  base:   'Base',
  build1: 'Build 1',
  build2: 'Build 2',
  peak:   'Peak',
  taper:  'Taper',
};

const WORKOUT_COLORS: Record<WorkoutType, string> = {
  rest:        'transparent',
  easy:        '#34D399',
  strides:     '#22D3EE',
  long:        '#6B7FD7',
  marathon:    '#FBBF24',
  threshold:   '#FB923C',
  interval:    '#F87171',
  repetition:  '#E879F9',
};

const WORKOUT_LABELS: Record<WorkoutType, string> = {
  rest:        'Rest',
  easy:        'Easy',
  strides:     'Easy + Strides',
  long:        'Long',
  marathon:    'M-Pace',
  threshold:   'Threshold',
  interval:    'Interval',
  repetition:  'Reps',
};

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  raceDistance:       RaceDistance | '';
  raceDate:           string;
  fitnessMethod:      'race' | 'pace';
  recentRaceDistance: RaceDistance | '';
  recentRaceH:        string;
  recentRaceM:        string;
  recentRaceS:        string;
  easyPaceM:          string;
  easyPaceS:          string;
  currentMPW:         string;
  daysPerWeek:        number;
  longRunDay:         DayOfWeek;
  units:              'mi' | 'km';
}

const DEFAULTS: FormState = {
  raceDistance: '',
  raceDate: '',
  fitnessMethod: 'race',
  recentRaceDistance: '',
  recentRaceH: '0',
  recentRaceM: '25',
  recentRaceS: '00',
  easyPaceM: '10',
  easyPaceS: '00',
  currentMPW: '20',
  daysPerWeek: 4,
  longRunDay: 6,
  units: 'mi',
};

type Step = 1 | 2 | 3;

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepDots({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {([1, 2, 3] as Step[]).map(s => (
        <div key={s} className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold transition-colors"
            style={{
              background: s <= step ? 'var(--accent)' : 'var(--bg-2)',
              color: s <= step ? 'var(--bg-0)' : 'var(--ink-3)',
            }}
          >
            {s}
          </div>
          {s < 3 && (
            <div
              className="w-8 h-px transition-colors"
              style={{ background: s < step ? 'var(--accent)' : 'var(--ink-3)' }}
            />
          )}
        </div>
      ))}
      <span className="ml-2 text-[10px] font-mono text-[var(--ink-3)] uppercase tracking-widest">
        {step === 1 ? 'Race Goal' : step === 2 ? 'Fitness' : 'Training'}
      </span>
    </div>
  );
}

function OptionButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-lg text-sm font-medium transition-all border"
      style={{
        background: active ? 'var(--accent)' : 'var(--bg-2)',
        color: active ? 'var(--bg-0)' : 'var(--ink-2)',
        borderColor: active ? 'var(--accent)' : 'transparent',
      }}
    >
      {children}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] tracking-[1.5px] uppercase text-[var(--ink-3)] mb-2">
      {children}
    </p>
  );
}

function TimeInput({
  label, h, m, s, showH = false,
  onH, onM, onS,
}: {
  label: string;
  h: string; m: string; s: string;
  showH?: boolean;
  onH: (v: string) => void;
  onM: (v: string) => void;
  onS: (v: string) => void;
}) {
  const cls = 'w-14 text-center bg-[var(--bg-2)] text-[var(--ink-1)] rounded-lg px-2 py-2 text-sm font-mono border border-[var(--ink-3)]/20 focus:outline-none focus:border-[var(--accent)]';
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-1">
        {showH && (
          <>
            <input className={cls} value={h} onChange={e => onH(e.target.value)} maxLength={2} placeholder="0" />
            <span className="text-[var(--ink-3)] font-mono">:</span>
          </>
        )}
        <input className={cls} value={m} onChange={e => onM(e.target.value)} maxLength={2} placeholder="00" />
        <span className="text-[var(--ink-3)] font-mono">:</span>
        <input className={cls} value={s} onChange={e => onS(e.target.value)} maxLength={2} placeholder="00" />
      </div>
    </div>
  );
}

// ─── Custom chart tooltip ─────────────────────────────────────────────────────

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { weekNumber: number; phase: TrainingPhase; totalMiles: number; isRecovery: boolean }; value: number }> }) {
  if (!active || !payload?.length) return null;
  const w = payload[0].payload;
  return (
    <div className="bg-[var(--bg-1)] border border-[var(--ink-3)]/30 rounded-lg px-3 py-2 text-xs">
      <p className="text-[var(--ink-1)] font-semibold">Week {w.weekNumber}</p>
      <p style={{ color: PHASE_COLORS[w.phase] }}>{PHASE_LABELS[w.phase]}{w.isRecovery ? ' (Recovery)' : ''}</p>
      <p className="text-[var(--ink-2)]">{payload[0].value} mi</p>
    </div>
  );
}

// ─── Results view ─────────────────────────────────────────────────────────────

function ResultsView({
  plan, onReset,
}: { plan: TrainingPlan; onReset: () => void }) {
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const { vdot, weeks, inputs } = plan;
  const { paces, predictedGoalTime } = vdot;
  const units = inputs.units;
  const pu = units;

  const paceRows = [
    { label: 'Easy',       color: WORKOUT_COLORS.easy,       range: `${formatPace(paces.easyHigh, units)} – ${formatPace(paces.easyLow, units)}` },
    { label: 'Marathon',   color: WORKOUT_COLORS.marathon,   range: formatPace(paces.marathon, units) },
    { label: 'Threshold',  color: WORKOUT_COLORS.threshold,  range: formatPace(paces.threshold, units) },
    { label: 'Interval',   color: WORKOUT_COLORS.interval,   range: formatPace(paces.interval, units) },
    { label: 'Repetition', color: WORKOUT_COLORS.repetition, range: formatPace(paces.repetition, units) },
  ];

  const chartData = weeks.map(w => ({
    weekNumber: w.weekNumber,
    phase:      w.phase,
    totalMiles: units === 'km'
      ? Math.round(w.totalMiles * 1.609344 * 10) / 10
      : w.totalMiles,
    isRecovery: w.isRecovery,
  }));

  const chartWidth = Math.max(320, weeks.length * 26);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[2px] uppercase text-[var(--ink-3)]">
            {RACE_LABELS[inputs.raceDistance]} Plan · {weeks.length} weeks
          </p>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-1 text-[10px] font-mono text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
        >
          <RotateCcw size={11} />
          Rebuild
        </button>
      </div>

      {/* VDOT + predicted time */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[var(--bg-1)] rounded-xl p-4 flex flex-col gap-1">
          <p className="font-mono text-[10px] tracking-[1.5px] uppercase text-[var(--ink-3)]">VDOT</p>
          <p className="text-4xl font-bold" style={{ color: 'var(--accent)' }}>
            {vdot.vdot.toFixed(1)}
          </p>
          <p className="text-[10px] text-[var(--ink-3)]">aerobic capacity index</p>
        </div>
        <div className="bg-[var(--bg-1)] rounded-xl p-4 flex flex-col gap-1">
          <p className="font-mono text-[10px] tracking-[1.5px] uppercase text-[var(--ink-3)]">Goal Finish</p>
          <p className="text-3xl font-bold text-[var(--ink-1)]">
            {formatTime(predictedGoalTime)}
          </p>
          <p className="text-[10px] text-[var(--ink-3)]">{RACE_LABELS[inputs.raceDistance]}</p>
        </div>
      </div>

      {/* Training paces */}
      <div className="bg-[var(--bg-1)] rounded-xl p-4">
        <p className="font-mono text-[10px] tracking-[1.5px] uppercase text-[var(--ink-3)] mb-3">
          Training Paces (/{pu})
        </p>
        <div className="flex flex-col gap-2">
          {paceRows.map(row => (
            <div key={row.label} className="flex items-center gap-3">
              <div className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: row.color }} />
              <span className="text-[var(--ink-2)] text-xs w-20">{row.label}</span>
              <span className="font-mono text-sm text-[var(--ink-1)] ml-auto">{row.range}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Phase legend */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(PHASE_COLORS) as [TrainingPhase, string][]).map(([phase, color]) => (
          <div key={phase} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
            <span className="text-[10px] text-[var(--ink-3)]">{PHASE_LABELS[phase]}</span>
          </div>
        ))}
      </div>

      {/* Volume chart */}
      <div className="bg-[var(--bg-1)] rounded-xl p-4">
        <p className="font-mono text-[10px] tracking-[1.5px] uppercase text-[var(--ink-3)] mb-3">
          Weekly Volume ({pu}/wk)
        </p>
        <div className="overflow-x-auto">
          <div style={{ width: chartWidth }}>
            <BarChart
              data={chartData}
              width={chartWidth}
              height={140}
              margin={{ top: 4, right: 4, left: -28, bottom: 0 }}
            >
              <XAxis
                dataKey="weekNumber"
                tick={{ fontSize: 9, fill: 'var(--ink-3)', fontFamily: 'monospace' }}
                tickFormatter={v => `W${v}`}
                interval={weeks.length > 16 ? 3 : weeks.length > 8 ? 1 : 0}
              />
              <YAxis tick={{ fontSize: 9, fill: 'var(--ink-3)', fontFamily: 'monospace' }} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="totalMiles" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={PHASE_COLORS[entry.phase]}
                    opacity={entry.isRecovery ? 0.5 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </div>
        </div>
      </div>

      {/* Week breakdown */}
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] tracking-[1.5px] uppercase text-[var(--ink-3)]">Week Detail</p>
        {weeks.map(week => {
          const isExpanded = expandedWeek === week.weekNumber;
          const displayMiles = units === 'km'
            ? `${Math.round(week.totalMiles * 1.609344 * 10) / 10} km`
            : `${week.totalMiles} mi`;
          const activeDays = week.days.filter(d => d.type !== 'rest');

          return (
            <div key={week.weekNumber} className="bg-[var(--bg-1)] rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                onClick={() => setExpandedWeek(isExpanded ? null : week.weekNumber)}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: PHASE_COLORS[week.phase] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--ink-1)] text-sm font-medium">Week {week.weekNumber}</span>
                    <span
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: PHASE_COLORS[week.phase] + '22',
                        color: PHASE_COLORS[week.phase],
                      }}
                    >
                      {PHASE_LABELS[week.phase]}{week.isRecovery ? ' · Recovery' : ''}
                    </span>
                  </div>
                  <p className="text-[var(--ink-3)] text-xs">{displayMiles} · {activeDays.length} runs</p>
                </div>
                {isExpanded ? <ChevronUp size={14} className="text-[var(--ink-3)]" /> : <ChevronDown size={14} className="text-[var(--ink-3)]" />}
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-[var(--ink-3)]/10 px-4 py-3 flex flex-col gap-2">
                      {week.days.map(day => (
                        <div key={day.dayOfWeek} className="flex items-start gap-3">
                          <span className="text-[10px] font-mono text-[var(--ink-3)] w-8 flex-shrink-0 pt-0.5">
                            {DAY_LABELS[day.dayOfWeek]}
                          </span>
                          {day.type === 'rest' ? (
                            <span className="text-[11px] text-[var(--ink-3)] italic">—</span>
                          ) : (
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <div
                                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                  style={{ background: WORKOUT_COLORS[day.type] }}
                                />
                                <span
                                  className="text-[10px] font-mono"
                                  style={{ color: WORKOUT_COLORS[day.type] }}
                                >
                                  {WORKOUT_LABELS[day.type]}
                                </span>
                              </div>
                              <p className="text-[11px] text-[var(--ink-2)] leading-snug pl-3.5">
                                {day.description}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RunningPlanBuilder() {
  const [step, setStep]           = useState<Step>(1);
  const [form, setForm]           = useState<FormState>(DEFAULTS);
  const [plan, setPlan]           = useState<TrainingPlan | null>(null);
  const [error, setError]         = useState('');
  const [showResults, setShowResults] = useState(false);

  // Load persisted plan on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { plan: TrainingPlan };
        setPlan(saved.plan);
        setShowResults(true);
      }
    } catch { /* ignore corrupt storage */ }
  }, []);

  const set = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    setError('');
  }, []);

  function validateStep1(): string {
    if (!form.raceDistance)    return 'Select a race distance.';
    if (!form.raceDate)        return 'Enter a race date.';
    const race = new Date(form.raceDate);
    const now  = new Date();
    const weeks = Math.floor((race.getTime() - now.getTime()) / (7 * 24 * 3600 * 1000));
    if (weeks < 2) return 'Race date must be at least 2 weeks away.';
    return '';
  }

  function validateStep2(): string {
    if (form.fitnessMethod === 'race') {
      if (!form.recentRaceDistance) return 'Select your recent race distance.';
      const h = parseInt(form.recentRaceH) || 0;
      const m = parseInt(form.recentRaceM) || 0;
      const s = parseInt(form.recentRaceS) || 0;
      const total = h * 3600 + m * 60 + s;
      if (total < 60) return 'Enter a valid race time.';
    } else {
      const m = parseInt(form.easyPaceM) || 0;
      const s = parseInt(form.easyPaceS) || 0;
      if (m < 3 || m > 20) return 'Enter a valid easy pace (3:00 – 20:00).';
      if (s < 0 || s >= 60) return 'Seconds must be 0–59.';
    }
    return '';
  }

  function validateStep3(): string {
    const mpw = parseFloat(form.currentMPW);
    if (isNaN(mpw) || mpw < 1) return 'Enter a current weekly mileage ≥ 1.';
    return '';
  }

  function next() {
    const err = step === 1 ? validateStep1() : step === 2 ? validateStep2() : '';
    if (err) { setError(err); return; }
    setError('');
    setStep(prev => (prev < 3 ? (prev + 1) as Step : prev));
  }

  function generate() {
    const err = validateStep3();
    if (err) { setError(err); return; }

    const h = parseInt(form.recentRaceH) || 0;
    const m = parseInt(form.recentRaceM) || 0;
    const s = parseInt(form.recentRaceS) || 0;
    const epM = parseInt(form.easyPaceM) || 10;
    const epS = parseInt(form.easyPaceS) || 0;

    const inputs: TrainingInputs = {
      raceDistance:       form.raceDistance as RaceDistance,
      raceDate:           form.raceDate,
      fitnessMethod:      form.fitnessMethod,
      recentRaceDistance: form.recentRaceDistance as RaceDistance | undefined,
      recentRaceSeconds:  form.fitnessMethod === 'race' ? h * 3600 + m * 60 + s : undefined,
      easyPaceSeconds:    form.fitnessMethod === 'pace' ? epM * 60 + epS : undefined,
      currentMPW:         parseFloat(form.currentMPW),
      daysPerWeek:        form.daysPerWeek,
      longRunDay:         form.longRunDay,
      units:              form.units,
    };

    const result = buildTrainingPlan(inputs);
    if (!result) {
      setError('Could not generate a plan. Check your inputs and try again.');
      return;
    }

    setPlan(result);
    setShowResults(true);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ plan: result }));
    } catch { /* quota exceeded — ignore */ }
  }

  function reset() {
    setShowResults(false);
    setPlan(null);
    setStep(1);
    setForm(DEFAULTS);
    setError('');
    try { localStorage.removeItem(LS_KEY); } catch { }
  }

  // ── Results page ───────────────────────────────────────────────────────────
  if (showResults && plan) {
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto">
        <ResultsView plan={plan} onReset={reset} />
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Activity size={16} className="text-[var(--accent)]" />
          <h2 className="text-[var(--ink-1)] font-semibold text-base">Run Plan Builder</h2>
        </div>
        <p className="text-[var(--ink-3)] text-xs">Jack Daniels VDOT-based training plan generator</p>
      </div>

      <StepDots step={step} />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* ── Step 1: Race Goal ── */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <Label>Goal race distance</Label>
                <div className="flex flex-wrap gap-2">
                  {RACE_OPTIONS.map(opt => (
                    <OptionButton
                      key={opt.value}
                      active={form.raceDistance === opt.value}
                      onClick={() => set('raceDistance', opt.value)}
                    >
                      {opt.label}
                    </OptionButton>
                  ))}
                </div>
              </div>

              <div>
                <Label>Race date</Label>
                <input
                  type="date"
                  value={form.raceDate}
                  onChange={e => set('raceDate', e.target.value)}
                  className="bg-[var(--bg-2)] text-[var(--ink-1)] rounded-lg px-3 py-2 text-sm border border-[var(--ink-3)]/20 focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <Label>Units</Label>
                <div className="flex gap-2">
                  <OptionButton active={form.units === 'mi'} onClick={() => set('units', 'mi')}>Miles</OptionButton>
                  <OptionButton active={form.units === 'km'}  onClick={() => set('units', 'km')}>Kilometers</OptionButton>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Fitness ── */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div>
                <Label>How should we measure your fitness?</Label>
                <div className="flex gap-2">
                  <OptionButton active={form.fitnessMethod === 'race'} onClick={() => set('fitnessMethod', 'race')}>
                    Recent race result
                  </OptionButton>
                  <OptionButton active={form.fitnessMethod === 'pace'} onClick={() => set('fitnessMethod', 'pace')}>
                    Easy pace estimate
                  </OptionButton>
                </div>
              </div>

              {form.fitnessMethod === 'race' && (
                <>
                  <div>
                    <Label>Recent race distance</Label>
                    <div className="flex flex-wrap gap-2">
                      {RACE_OPTIONS.map(opt => (
                        <OptionButton
                          key={opt.value}
                          active={form.recentRaceDistance === opt.value}
                          onClick={() => set('recentRaceDistance', opt.value)}
                        >
                          {opt.label}
                        </OptionButton>
                      ))}
                    </div>
                  </div>
                  <TimeInput
                    label="Finish time"
                    showH={form.recentRaceDistance === 'marathon' || form.recentRaceDistance === 'half'}
                    h={form.recentRaceH} m={form.recentRaceM} s={form.recentRaceS}
                    onH={v => set('recentRaceH', v)}
                    onM={v => set('recentRaceM', v)}
                    onS={v => set('recentRaceS', v)}
                  />
                </>
              )}

              {form.fitnessMethod === 'pace' && (
                <div>
                  <Label>Current easy pace (per {form.units})</Label>
                  <div className="flex items-center gap-1">
                    <input
                      className="w-14 text-center bg-[var(--bg-2)] text-[var(--ink-1)] rounded-lg px-2 py-2 text-sm font-mono border border-[var(--ink-3)]/20 focus:outline-none focus:border-[var(--accent)]"
                      value={form.easyPaceM}
                      onChange={e => set('easyPaceM', e.target.value)}
                      maxLength={2}
                      placeholder="10"
                    />
                    <span className="text-[var(--ink-3)] font-mono">:</span>
                    <input
                      className="w-14 text-center bg-[var(--bg-2)] text-[var(--ink-1)] rounded-lg px-2 py-2 text-sm font-mono border border-[var(--ink-3)]/20 focus:outline-none focus:border-[var(--accent)]"
                      value={form.easyPaceS}
                      onChange={e => set('easyPaceS', e.target.value)}
                      maxLength={2}
                      placeholder="00"
                    />
                    <span className="text-[var(--ink-3)] text-xs ml-2">/ {form.units}</span>
                  </div>
                  <p className="text-[10px] text-[var(--ink-3)] mt-2">
                    Comfortable conversational running pace — you should be able to hold a full sentence.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Training prefs ── */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <Label>Current weekly {form.units === 'km' ? 'km' : 'miles'}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={150}
                    value={form.currentMPW}
                    onChange={e => set('currentMPW', e.target.value)}
                    className="w-24 bg-[var(--bg-2)] text-[var(--ink-1)] rounded-lg px-3 py-2 text-sm font-mono border border-[var(--ink-3)]/20 focus:outline-none focus:border-[var(--accent)]"
                  />
                  <span className="text-[var(--ink-3)] text-xs">{form.units}/week</span>
                </div>
              </div>

              <div>
                <Label>Days per week</Label>
                <div className="flex gap-2">
                  {[3, 4, 5, 6].map(d => (
                    <OptionButton key={d} active={form.daysPerWeek === d} onClick={() => set('daysPerWeek', d)}>
                      {d}
                    </OptionButton>
                  ))}
                </div>
              </div>

              <div>
                <Label>Preferred long-run day</Label>
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS.map((label, i) => (
                    <OptionButton
                      key={i}
                      active={form.longRunDay === i}
                      onClick={() => set('longRunDay', i as DayOfWeek)}
                    >
                      {label}
                    </OptionButton>
                  ))}
                </div>
              </div>

              <div className="bg-[var(--bg-1)] rounded-xl px-4 py-3 flex items-start gap-3">
                <Zap size={14} className="text-[var(--accent)] flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-[var(--ink-3)] leading-relaxed">
                  Paces are calculated using the Jack Daniels VDOT formula. Hard sessions automatically avoid back-to-back placement. Recovery weeks occur every 4th week at 78 % volume.
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Error */}
      {error && (
        <p className="mt-4 text-xs font-mono text-[var(--warn)] border border-[var(--warn)]/30 rounded-lg px-3 py-2 bg-[var(--warn)]/10">
          {error}
        </p>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-3 mt-8">
        {step > 1 && (
          <button
            onClick={() => { setStep(prev => (prev - 1) as Step); setError(''); }}
            className="flex items-center gap-1 text-sm text-[var(--ink-2)] hover:text-[var(--ink-1)] transition-colors"
          >
            <ChevronLeft size={16} />
            Back
          </button>
        )}
        <button
          onClick={step < 3 ? next : generate}
          className="ml-auto px-6 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'var(--accent)', color: 'var(--bg-0)' }}
        >
          {step < 3 ? 'Next' : 'Build My Plan'}
        </button>
      </div>
    </div>
  );
}
