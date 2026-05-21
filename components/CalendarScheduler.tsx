'use client';

/**
 * components/CalendarScheduler.tsx
 *
 * Native React port of calendar-scheduler.js.
 * Renders the Calendar page: grid navigation, day-cell activity dots,
 * mobile week strip, day selection, and the Today's Workouts summary panel.
 *
 * All navigation state lives in AppContext (useApp).
 * No workout-log form — that's WorkoutLogger.tsx (next step).
 */

import React, {
  useCallback,
  useMemo,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Flame,
  X,
} from 'lucide-react';
import {
  useApp,
  MONTHS,
  type ViewMode,
  type DayRecord,
} from '@/lib/AppContext';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface CellData {
  dateStr:     string;
  dayNum:      number;
  label:       string;       // display label inside the cell
  isToday:     boolean;
  isSelected:  boolean;
  isPadding:   boolean;      // empty cell before month start
  hasLift:     boolean;
  hasCardio:   boolean;
  summary:     string;       // multi-line text summary for desktop cells
}

interface ParsedEntry {
  k: string;
  g?: string;
  n?: string;
  sets?: Array<{ r: string; w: string }>;
  s?: string; r?: string; w?: string;
  v1?: string; v2?: string; note?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPERS  (self-contained — no external lib dependency)
// ─────────────────────────────────────────────────────────────────────────────

const DOW_ABBR  = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const DOW_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseEx(raw: string): ParsedEntry[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return raw.split('\n').filter(l => l.trim()).map(l => ({ k: 'text', n: l }));
  }
}

function normalizeSets(e: ParsedEntry): Array<{ r: string; w: string }> {
  if (e.sets && Array.isArray(e.sets)) return e.sets;
  const count = parseInt(String(e.s ?? '1')) || 1;
  return Array.from({ length: count }, () => ({ r: String(e.r ?? '1'), w: String(e.w ?? '') }));
}

/** Single-line or multi-line text summary for a cell. */
function buildCellSummary(raw: string): string {
  if (!raw) return '';
  const arr = parseEx(raw);
  return arr.map(e => {
    if (e.k === 'lift') {
      const sets = normalizeSets(e);
      const n    = sets.length;
      const r    = sets[0]?.r ?? '';
      return `${e.n ?? ''}${n && r ? ` ${n}×${r}` : ''}`;
    }
    if (e.k === 'swim') return `Swim${e.v1 ? ` ${e.v1}min` : ''}`;
    if (e.k === 'run')  return `Run${e.v1 ? ` ${e.v1}mi` : ''}`;
    if (e.k === 'bike') return `Bike${e.v1 ? ` ${e.v1}mi` : ''}`;
    return e.n ?? '';
  }).filter(Boolean).join('\n');
}

function hasContent(rec: DayRecord): boolean {
  if (!rec.exercises || rec.exercises === '[]' || rec.exercises === '') return false;
  return parseEx(rec.exercises).length > 0;
}

function detectActivity(raw: string): { hasLift: boolean; hasCardio: boolean } {
  const arr = parseEx(raw);
  return {
    hasLift:   arr.some(e => e.k === 'lift' || e.k === 'text'),
    hasCardio: arr.some(e => e.k === 'run' || e.k === 'bike' || e.k === 'swim'),
  };
}

/** Navigation title for each view mode. */
function navTitle(mode: ViewMode, d: Date): string {
  if (mode === 'month') {
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  if (mode === 'week') {
    const sow = new Date(d);
    sow.setDate(d.getDate() - d.getDay());
    const eow = new Date(sow);
    eow.setDate(sow.getDate() + 6);
    const startLbl = `${MONTHS[sow.getMonth()].slice(0,3)} ${sow.getDate()}`;
    const endLbl   = sow.getMonth() !== eow.getMonth()
      ? `${MONTHS[eow.getMonth()].slice(0,3)} ${eow.getDate()}`
      : String(eow.getDate());
    return `${startLbl} – ${endLbl}`;
  }
  // day
  const ordSuffix = (n: number) => {
    const v = n % 100;
    const s = ['th','st','nd','rd'];
    return s[(v-20)%10] ?? s[v] ?? s[0];
  };
  const n = d.getDate();
  return `${MONTHS[d.getMonth()]} ${n}${ordSuffix(n)}, ${d.getFullYear()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CSS FRAGMENTS
// ─────────────────────────────────────────────────────────────────────────────

const CARD =
  'rounded-2xl border border-slate-800/50 backdrop-blur-md overflow-hidden';

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — DayCell (month view)
// ─────────────────────────────────────────────────────────────────────────────

function DayCell({
  cell, onClick, onClear,
}: {
  cell:    CellData;
  onClick: (dateStr: string) => void;
  onClear: (dateStr: string) => void;
}) {
  if (cell.isPadding) {
    return (
      <div className="min-h-[56px] lg:min-h-[90px] rounded-xl border border-dashed border-slate-800/40 bg-transparent" />
    );
  }

  const hasAny = cell.hasLift || cell.hasCardio;

  return (
    <div
      onClick={() => onClick(cell.dateStr)}
      className={[
        'group relative min-h-[56px] lg:min-h-[90px] rounded-xl p-2 lg:p-3 cursor-pointer',
        'border transition-all duration-200 flex flex-col gap-1 overflow-hidden',
        cell.isSelected
          ? 'border-white/20 bg-white/5'
          : 'border-slate-800/50 bg-[#111228]/60 hover:border-slate-600/60 hover:bg-[#181a32]/60 hover:scale-[1.015]',
      ].join(' ')}
    >
      {/* Day number */}
      {cell.isToday ? (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white text-[#0a0a0a] text-xs font-bold leading-none self-start">
          {cell.dayNum}
        </span>
      ) : (
        <span className={[
          'text-xs font-bold font-mono self-start leading-none mt-0.5',
          cell.isSelected ? 'text-white' : 'text-slate-500',
        ].join(' ')}>
          {cell.dayNum}
        </span>
      )}

      {/* Summary text (desktop only) */}
      {cell.summary && (
        <p className="hidden lg:block text-[10px] text-slate-400 leading-snug line-clamp-3 pl-1.5 border-l border-white/10">
          {cell.summary}
        </p>
      )}

      {/* Activity dot (mobile / when no summary shown) */}
      {hasAny && !cell.summary && (
        <span className="mt-auto mx-auto w-1 h-1 rounded-full bg-indigo-400/60" />
      )}
      {hasAny && cell.summary && (
        <span className="lg:hidden mt-auto mx-auto w-1 h-1 rounded-full bg-indigo-400/60" />
      )}

      {/* Clear button — appears on hover when there's content */}
      {hasAny && (
        <button
          onClick={e => { e.stopPropagation(); onClear(cell.dateStr); }}
          className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center
                     bg-red-500/12 border border-red-500/35 text-red-400
                     opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/25"
          title="Remove workout"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — WeekCell (week & day views)
// ─────────────────────────────────────────────────────────────────────────────

function WeekCell({
  cell, compact, onClick, onClear,
}: {
  cell:    CellData;
  compact: boolean;  // true on mobile → stripped-down strip
  onClick: (dateStr: string) => void;
  onClear: (dateStr: string) => void;
}) {
  const hasAny = cell.hasLift || cell.hasCardio;

  if (compact) {
    return (
      <div
        onClick={() => onClick(cell.dateStr)}
        className={[
          'group relative flex flex-col items-center justify-center gap-1 rounded-lg cursor-pointer',
          'min-h-[80px] py-2 border transition-all duration-200',
          cell.isSelected
            ? 'border-white/18 bg-white/8'
            : 'border-transparent bg-[#07081a] hover:bg-white/5',
        ].join(' ')}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.5px] text-slate-500">
          {DOW_ABBR[new Date(cell.dateStr + 'T00:00:00').getDay()]}
        </span>

        {cell.isToday ? (
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white text-[#0a0a0a] text-base font-bold leading-none">
            {cell.dayNum}
          </span>
        ) : (
          <span className={[
            'text-[19px] font-bold font-mono leading-none',
            cell.isSelected ? 'text-white' : 'text-slate-500',
          ].join(' ')}>
            {cell.dayNum}
          </span>
        )}

        {hasAny && (
          <span className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'rgba(200,210,255,0.55)' }} />
        )}
      </div>
    );
  }

  // Desktop week cell — taller, shows summary
  return (
    <div
      onClick={() => onClick(cell.dateStr)}
      className={[
        'group relative flex flex-col gap-2 rounded-xl p-3 cursor-pointer',
        'min-h-[200px] border transition-all duration-200 overflow-hidden',
        cell.isSelected
          ? 'border-white/20 bg-white/5'
          : 'border-slate-800/50 bg-[#111228]/60 hover:border-slate-600/60 hover:bg-[#181a32]/60',
      ].join(' ')}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
          {DOW_SHORT[new Date(cell.dateStr + 'T00:00:00').getDay()]}
        </span>
        {cell.isToday ? (
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white text-[#0a0a0a] text-xs font-bold">
            {cell.dayNum}
          </span>
        ) : (
          <span className={`text-sm font-bold font-mono ${cell.isSelected ? 'text-white' : 'text-slate-500'}`}>
            {cell.dayNum}
          </span>
        )}
      </div>

      {/* Summary */}
      {cell.summary && (
        <p className="text-[10px] text-slate-400 leading-relaxed pl-1.5 border-l border-white/10 flex-1 overflow-hidden">
          {cell.summary}
        </p>
      )}

      {/* Activity indicators */}
      {hasAny && (
        <div className="flex gap-1 mt-auto">
          {cell.hasLift   && <span className="text-[9px] font-bold text-indigo-400/70 bg-indigo-400/10 px-1.5 py-0.5 rounded">lift</span>}
          {cell.hasCardio && <span className="text-[9px] font-bold text-amber-400/70 bg-amber-400/10 px-1.5 py-0.5 rounded">cardio</span>}
        </div>
      )}

      {hasAny && (
        <button
          onClick={e => { e.stopPropagation(); onClear(cell.dateStr); }}
          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center
                     bg-red-500/12 border border-red-500/35 text-red-400
                     opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/25"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — TodaysWorkoutSummary
// ─────────────────────────────────────────────────────────────────────────────

function TodaysWorkoutSummary({ dateStr, rec }: { dateStr: string; rec: DayRecord }) {
  const arr = parseEx(rec.exercises ?? '');
  const lifts  = arr.filter(e => e.k === 'lift' || e.k === 'text');
  const cardio = arr.filter(e => ['swim','run','bike'].includes(e.k));

  const today = new Date();
  const todayStr = toDateStr(today);
  const isToday  = dateStr === todayStr;
  const d        = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
  const label    = diffDays === 0 ? "Today's Workouts"
    : diffDays === 1 ? "Yesterday's Workouts"
    : `${DOW_SHORT[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()} Workouts`;

  const isEmpty = lifts.length === 0 && cardio.length === 0;

  return (
    <div
      className={`${CARD} mt-4`}
      style={{ background: 'linear-gradient(150deg,#0d0e20 0%,#070810 100%)' }}
    >
      <div className="p-5">
        <h2 className="flex items-center gap-2.5 text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">
          <Dumbbell size={13} className="text-indigo-400/70" />
          {label}
          <span className="flex-1 h-px bg-gradient-to-r from-slate-800 to-transparent" />
        </h2>

        {isEmpty ? (
          <p className="text-center text-slate-600 text-sm py-6 border border-dashed border-slate-800 rounded-xl">
            {isToday ? 'No workouts logged yet — add exercises in the Workout Log.' : 'No workouts logged for this day.'}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Lifting — grouped by muscle group */}
            {lifts.length > 0 && (() => {
              const groups: Record<string, ParsedEntry[]> = {};
              lifts.forEach(e => {
                const g = e.g ?? 'other';
                if (!groups[g]) groups[g] = [];
                groups[g].push(e);
              });
              return (
                <div className="flex flex-col gap-4">
                  {Object.entries(groups).map(([g, entries]) => (
                    <div key={g}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 pb-2 mb-2 border-b border-slate-800">
                        {g.charAt(0).toUpperCase() + g.slice(1)}
                      </p>
                      <div className="flex flex-col gap-2">
                        {entries.map((e, i) => {
                          const sets = normalizeSets(e);
                          const chips = sets.map((s, si) => (
                            <span
                              key={si}
                              className="inline-flex items-center gap-1 text-[11px] font-mono bg-indigo-500/8 border border-indigo-500/14 rounded px-2 py-0.5 whitespace-nowrap"
                            >
                              <span className="text-[9px] text-slate-600">S{si+1}</span>
                              <span className="text-white font-bold">{s.r || '—'}</span>
                              {s.w && <span className="text-slate-500">@ {s.w}</span>}
                            </span>
                          ));
                          return (
                            <div key={i} className="flex flex-col gap-1.5">
                              <span className="text-sm font-semibold text-white">{e.n ?? e.k}</span>
                              {chips.length > 0 && (
                                <div className="flex flex-wrap gap-1">{chips}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Cardio */}
            {cardio.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 pb-2 mb-2 border-b border-slate-800">
                  Cardio
                </p>
                <div className="flex flex-col gap-2">
                  {cardio.map((e, i) => {
                    const icons: Record<string, string> = { swim: '🏊', run: '🏃', bike: '🚴' };
                    const labels: Record<string, string> = { swim: 'Swimming', run: 'Running', bike: 'Cycling' };
                    const dist = e.v1 ? `${e.v1}${e.k === 'swim' ? ' min' : ' mi'}` : '';
                    const time = e.v2 && e.k !== 'swim' ? ` · ${e.v2} min` : '';
                    const note = e.note ? ` — ${e.note}` : '';
                    return (
                      <p key={i} className="text-sm text-white">
                        {icons[e.k]} {labels[e.k] ?? e.k}{dist ? ` — ${dist}` : ''}{time}{note}
                      </p>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT — CalendarScheduler
// ─────────────────────────────────────────────────────────────────────────────

export default function CalendarScheduler() {
  const {
    today, todayStr,
    activeDayFocus,   setActiveDayFocus,
    currentDisplayDate, setCurrentDisplayDate,
    viewMode,         setViewMode,
    localDB,          updateDayRecord,
  } = useApp();

  // ── Detect mobile for compact week strip ──────────────────────────────────
  // We use a simple CSS class toggle rather than a JS hook to avoid SSR mismatch.
  // The compact prop is driven by the CSS md: breakpoint via conditional rendering.
  const [isMobilePreview] = useState(false); // placeholder; real detection via CSS

  // ── Navigate forward / backward ───────────────────────────────────────────
  const navigate = useCallback((dir: 1 | -1) => {
    setCurrentDisplayDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'month')     d.setMonth(d.getMonth() + dir);
      else if (viewMode === 'week') d.setDate(d.getDate() + dir * 7);
      else                          d.setDate(d.getDate() + dir);
      return d;
    });
  }, [viewMode, setCurrentDisplayDate]);

  // ── Jump to today ─────────────────────────────────────────────────────────
  const goToday = useCallback(() => {
    setActiveDayFocus(todayStr);
  }, [todayStr, setActiveDayFocus]);

  // ── Select a day ──────────────────────────────────────────────────────────
  const selectDay = useCallback((dateStr: string) => {
    setActiveDayFocus(dateStr); // also syncs currentDisplayDate
  }, [setActiveDayFocus]);

  // ── Clear a day's workout ─────────────────────────────────────────────────
  const clearDay = useCallback((dateStr: string) => {
    if (!window.confirm(`Remove all workouts for ${dateStr}?`)) return;
    updateDayRecord(dateStr, {
      exercises: '', notes: '', steps: 0,
      runDist: 0, runTime: 0, bikeDist: 0, bikeTime: 0, swimTime: 0, burn: 0,
    });
  }, [updateDayRecord]);

  // ── Derive calendar cells ─────────────────────────────────────────────────
  const cells = useMemo<CellData[]>(() => {
    const year  = currentDisplayDate.getFullYear();
    const month = currentDisplayDate.getMonth();

    const makeCell = (dateStr: string, dayNum: number, label: string): CellData => {
      const rec = localDB[dateStr] ?? {};
      const raw = rec.exercises ?? '';
      const { hasLift, hasCardio } = detectActivity(raw);
      return {
        dateStr,
        dayNum,
        label,
        isToday:    dateStr === todayStr,
        isSelected: dateStr === activeDayFocus,
        isPadding:  false,
        hasLift,
        hasCardio,
        summary:    buildCellSummary(raw),
      };
    };

    const PADDING: CellData = {
      dateStr:'', dayNum:0, label:'', isToday:false,
      isSelected:false, isPadding:true, hasLift:false,
      hasCardio:false, summary:'',
    };

    if (viewMode === 'month') {
      const firstDow  = new Date(year, month, 1).getDay();
      const totalDays = new Date(year, month + 1, 0).getDate();
      const result: CellData[] = Array.from({ length: firstDow }, () => ({ ...PADDING }));
      for (let d = 1; d <= totalDays; d++) {
        const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        result.push(makeCell(ds, d, String(d)));
      }
      return result;
    }

    if (viewMode === 'week') {
      const sow = new Date(currentDisplayDate);
      sow.setDate(currentDisplayDate.getDate() - currentDisplayDate.getDay());
      return Array.from({ length: 7 }, (_, i) => {
        const ld = new Date(sow); ld.setDate(sow.getDate() + i);
        const ds = toDateStr(ld);
        return makeCell(ds, ld.getDate(), `${MONTHS[ld.getMonth()]} ${ld.getDate()}`);
      });
    }

    // Day view
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(currentDisplayDate.getDate()).padStart(2,'0')}`;
    return [makeCell(ds, currentDisplayDate.getDate(), `${MONTHS[month]} ${currentDisplayDate.getDate()}, ${year}`)];
  }, [currentDisplayDate, viewMode, localDB, activeDayFocus, todayStr]);

  // ── Active day record for the summary panel ───────────────────────────────
  const activeDayRec = localDB[activeDayFocus] ?? {};

  // ── Weekday header labels ─────────────────────────────────────────────────
  const weekLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* ╔══════════════════════════════════════════════════════════╗
          ║  CALENDAR CARD                                           ║
          ╚══════════════════════════════════════════════════════════╝ */}
      <div
        className={CARD}
        style={{ background: 'linear-gradient(150deg,#0d0e20 0%,#070810 100%)' }}
      >
        <div className="p-5">

          {/* ── Navigation header ── */}
          <div className="flex items-center gap-3 mb-5">

            {/* Prev */}
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-800 bg-[#111228] text-slate-400 hover:text-white hover:border-slate-600 transition-all hover:scale-[1.04]"
            >
              <ChevronLeft size={18} />
            </button>

            {/* Title + today jump */}
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span className="font-bold text-white text-base tracking-tight truncate">
                {navTitle(viewMode, currentDisplayDate)}
              </span>
              {activeDayFocus !== todayStr && (
                <button
                  onClick={goToday}
                  className="text-[10px] font-bold text-slate-500 border border-slate-700 rounded px-2 py-0.5 hover:text-white hover:border-slate-500 transition-all uppercase tracking-widest whitespace-nowrap"
                >
                  Today
                </button>
              )}
            </div>

            {/* Next */}
            <button
              onClick={() => navigate(1)}
              className="w-10 h-10 flex items-center justify-center rounded-lg border border-slate-800 bg-[#111228] text-slate-400 hover:text-white hover:border-slate-600 transition-all hover:scale-[1.04]"
            >
              <ChevronRight size={18} />
            </button>

            {/* View toggle — hidden on mobile (week is always right) */}
            <div className="hidden md:flex bg-[#111228] border border-slate-800 rounded-lg p-1 gap-0.5 flex-shrink-0">
              {(['day','week','month'] as ViewMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={[
                    'px-3 py-1.5 rounded text-xs font-bold capitalize transition-all',
                    viewMode === m
                      ? 'bg-white/10 text-white'
                      : 'text-slate-500 hover:text-white',
                  ].join(' ')}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* ── Animated calendar grid — shared variants ── */}
          <AnimatePresence mode="sync" initial={false}>

            {/* ── Month view ── */}
            {viewMode === 'month' && (
              <motion.div
                key={`month-${currentDisplayDate.getFullYear()}-${currentDisplayDate.getMonth()}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                {/* Weekday header row */}
                <div className="grid grid-cols-7 gap-1.5 mb-2">
                  {weekLabels.map(l => (
                    <div
                      key={l}
                      className="text-center text-[10px] font-bold text-slate-700 uppercase tracking-widest py-1.5"
                    >
                      <span className="md:hidden">{l[0]}</span>
                      <span className="hidden md:inline">{l}</span>
                    </div>
                  ))}
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 gap-1.5">
                  {cells.map((cell, i) =>
                    cell.isPadding ? (
                      <div
                        key={`pad-${i}`}
                        className="min-h-[48px] lg:min-h-[90px] rounded-xl border border-dashed border-slate-800/30 bg-transparent"
                      />
                    ) : (
                      <DayCell
                        key={cell.dateStr}
                        cell={cell}
                        onClick={selectDay}
                        onClear={clearDay}
                      />
                    )
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Week view — compact strip on mobile, full cells on desktop ── */}
            {viewMode === 'week' && (
              <motion.div
                key={`week-${toDateStr(currentDisplayDate)}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="grid grid-cols-7 gap-1 md:gap-2"
              >
                {cells.map(cell => (
                  <React.Fragment key={cell.dateStr}>
                    <div className="md:hidden">
                      <WeekCell cell={cell} compact={true}  onClick={selectDay} onClear={clearDay} />
                    </div>
                    <div className="hidden md:block">
                      <WeekCell cell={cell} compact={false} onClick={selectDay} onClear={clearDay} />
                    </div>
                  </React.Fragment>
                ))}
              </motion.div>
            )}

            {/* ── Day view — single expanded cell ── */}
            {viewMode === 'day' && cells[0] && (
              <motion.div
                key={`day-${cells[0].dateStr}`}
                initial={{ opacity: 0, scale: 0.97, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -6 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div className="rounded-xl border border-white/10 bg-white/3 p-5 min-h-[160px]">
                  <div className="flex items-center gap-3 mb-4">
                    {cells[0].isToday ? (
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white text-[#0a0a0a] text-base font-bold">
                        {cells[0].dayNum}
                      </span>
                    ) : (
                      <span className="text-2xl font-bold font-mono text-white">
                        {cells[0].dayNum}
                      </span>
                    )}
                    <span className="text-slate-400 text-sm font-medium">
                      {weekLabels[new Date(cells[0].dateStr + 'T00:00:00').getDay()]}
                    </span>
                    <div className="flex gap-1.5 ml-auto">
                      {cells[0].hasLift   && <span className="text-[10px] font-bold text-indigo-400/70 bg-indigo-400/10 px-2 py-0.5 rounded">lift</span>}
                      {cells[0].hasCardio && <span className="text-[10px] font-bold text-amber-400/70 bg-amber-400/10 px-2 py-0.5 rounded">cardio</span>}
                    </div>
                  </div>

                  {cells[0].summary ? (
                    <p className="text-sm text-slate-400 leading-relaxed pl-3 border-l-2 border-white/10 whitespace-pre-line">
                      {cells[0].summary}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-700 italic">No workouts logged.</p>
                  )}
                </div>
              </motion.div>
            )}

          </AnimatePresence>

        </div>{/* /card padding */}
      </div>{/* /calendar card */}

      {/* ╔══════════════════════════════════════════════════════════╗
          ║  TODAY'S WORKOUTS SUMMARY                               ║
          ╚══════════════════════════════════════════════════════════╝ */}
      <motion.div
        key={activeDayFocus}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.06 }}
      >
        <TodaysWorkoutSummary
          dateStr={activeDayFocus}
          rec={activeDayRec}
        />
      </motion.div>

    </div>
  );
}
