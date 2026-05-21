'use client';

/**
 * components/CalendarScheduler.tsx
 *
 * Athletic redesign — all logic, hooks, props, and data bindings preserved.
 * Visual rewrite uses the QUE token system: deep ink, single ice-blue accent,
 * Anton condensed numerals for the day cells, JetBrains Mono for telemetry.
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
import { useSpotlightBorder } from '@/hooks/useSpotlightBorder';
import {
  useApp,
  MONTHS,
  type ViewMode,
  type DayRecord,
} from '@/lib/AppContext';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES — unchanged
// ─────────────────────────────────────────────────────────────────────────────
interface CellData {
  dateStr: string; dayNum: number; label: string;
  isToday: boolean; isSelected: boolean; isPadding: boolean;
  hasLift: boolean; hasCardio: boolean;
  summary: string;
}
interface ParsedEntry {
  k: string; g?: string; n?: string;
  sets?: Array<{ r: string; w: string }>;
  s?: string; r?: string; w?: string;
  v1?: string; v2?: string; note?: string;
}

const DOW_ABBR  = ['SU','MO','TU','WE','TH','FR','SA'];
const DOW_SHORT = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseEx(raw: string): ParsedEntry[] {
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
  catch { return raw.split('\n').filter(l => l.trim()).map(l => ({ k: 'text', n: l })); }
}
function normalizeSets(e: ParsedEntry): Array<{ r: string; w: string }> {
  if (e.sets && Array.isArray(e.sets)) return e.sets;
  const count = parseInt(String(e.s ?? '1')) || 1;
  return Array.from({ length: count }, () => ({ r: String(e.r ?? '1'), w: String(e.w ?? '') }));
}
function buildCellSummary(raw: string): string {
  if (!raw) return '';
  const arr = parseEx(raw);
  return arr.map(e => {
    if (e.k === 'lift') {
      const sets = normalizeSets(e);
      const n = sets.length;
      const r = sets[0]?.r ?? '';
      return `${e.n ?? ''}${n && r ? ` ${n}×${r}` : ''}`;
    }
    if (e.k === 'swim') return `Swim${e.v1 ? ` ${e.v1}min` : ''}`;
    if (e.k === 'run')  return `Run${e.v1 ? ` ${e.v1}mi` : ''}`;
    if (e.k === 'bike') return `Bike${e.v1 ? ` ${e.v1}mi` : ''}`;
    return e.n ?? '';
  }).filter(Boolean).join('\n');
}
function detectActivity(raw: string): { hasLift: boolean; hasCardio: boolean } {
  const arr = parseEx(raw);
  return {
    hasLift:   arr.some(e => e.k === 'lift' || e.k === 'text'),
    hasCardio: arr.some(e => e.k === 'run' || e.k === 'bike' || e.k === 'swim'),
  };
}
function navTitle(mode: ViewMode, d: Date): string {
  if (mode === 'month') return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (mode === 'week') {
    const sow = new Date(d); sow.setDate(d.getDate() - d.getDay());
    const eow = new Date(sow); eow.setDate(sow.getDate() + 6);
    const startLbl = `${MONTHS[sow.getMonth()].slice(0,3)} ${sow.getDate()}`;
    const endLbl = sow.getMonth() !== eow.getMonth()
      ? `${MONTHS[eow.getMonth()].slice(0,3)} ${eow.getDate()}` : String(eow.getDate());
    return `${startLbl} – ${endLbl}`;
  }
  const ord = (n: number) => {
    const v = n % 100; const s = ['th','st','nd','rd'];
    return s[(v-20)%10] ?? s[v] ?? s[0];
  };
  const n = d.getDate();
  return `${MONTHS[d.getMonth()]} ${n}${ord(n)}, ${d.getFullYear()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — DayCell (month grid)
// ─────────────────────────────────────────────────────────────────────────────

function DayCell({
  cell, onClick, onClear,
}: {
  cell: CellData;
  onClick: (dateStr: string) => void;
  onClear: (dateStr: string) => void;
}) {
  if (cell.isPadding) {
    return <div className="min-h-[56px] lg:min-h-[96px] rounded bg-transparent" />;
  }
  const hasAny = cell.hasLift || cell.hasCardio;

  return (
    <div
      onClick={() => onClick(cell.dateStr)}
      className={[
        'group relative min-h-[56px] lg:min-h-[96px] rounded cursor-pointer p-2 lg:p-3',
        'border transition-all duration-200 flex flex-col gap-1 overflow-hidden',
        cell.isSelected
          ? 'border-[var(--accent)] bg-[var(--accent-12)]'
          : 'border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--line-2)] hover:bg-[var(--bg-3)]',
      ].join(' ')}
      style={cell.isSelected ? { boxShadow: '0 0 0 1px var(--accent), 0 0 18px var(--accent-12)' } : undefined}
    >
      {/* Day number — Anton condensed */}
      <span
        className={[
          'font-display leading-none tabular self-start',
          'text-[20px] lg:text-[26px]',
          cell.isToday ? 'text-[var(--accent)]' : cell.isSelected ? 'text-[var(--ink-0)]' : 'text-[var(--ink-2)]',
        ].join(' ')}
        style={cell.isToday ? { textShadow: '0 0 12px var(--accent-40)' } : undefined}
      >
        {String(cell.dayNum).padStart(2, '0')}
      </span>

      {/* Summary (desktop only) */}
      {cell.summary && (
        <p className="hidden lg:block text-[10px] text-[var(--ink-1)] leading-snug line-clamp-3 pl-2 border-l border-[var(--accent-24)]">
          {cell.summary}
        </p>
      )}

      {/* Activity ticks */}
      {hasAny && (
        <div className="flex items-center gap-1 mt-auto">
          {cell.hasLift && <span className="block w-2 h-[2px] bg-[var(--accent)]" />}
          {cell.hasCardio && <span className="block w-2 h-[2px] bg-[var(--ink-1)]" />}
        </div>
      )}

      {/* TODAY marker */}
      {cell.isToday && (
        <span className="absolute top-2 right-2 font-mono text-[8px] tracking-[2px] text-[var(--accent)]">
          ●
        </span>
      )}

      {/* Clear */}
      {hasAny && (
        <button
          onClick={e => { e.stopPropagation(); onClear(cell.dateStr); }}
          className="absolute top-1 right-1 w-5 h-5 rounded flex items-center justify-center
                     bg-[var(--danger-12)] border border-[var(--danger)]/30 text-[var(--danger)]
                     opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove workout"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — WeekCell
// ─────────────────────────────────────────────────────────────────────────────

function WeekCell({
  cell, compact, onClick, onClear,
}: {
  cell: CellData; compact: boolean;
  onClick: (dateStr: string) => void;
  onClear: (dateStr: string) => void;
}) {
  const hasAny = cell.hasLift || cell.hasCardio;

  if (compact) {
    return (
      <div
        onClick={() => onClick(cell.dateStr)}
        className={[
          'group relative flex flex-col items-center justify-center gap-1.5 rounded cursor-pointer',
          'min-h-[88px] py-2 border transition-all duration-200',
          cell.isSelected
            ? 'border-[var(--accent)] bg-[var(--accent-12)]'
            : 'border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--line-2)]',
        ].join(' ')}
      >
        <span className="font-mono text-[9px] font-bold tracking-[1.5px] text-[var(--ink-3)]">
          {DOW_ABBR[new Date(cell.dateStr + 'T00:00:00').getDay()]}
        </span>

        <span
          className={[
            'font-display tabular leading-none text-[28px]',
            cell.isToday ? 'text-[var(--accent)]' : cell.isSelected ? 'text-[var(--ink-0)]' : 'text-[var(--ink-1)]',
          ].join(' ')}
          style={cell.isToday ? { textShadow: '0 0 12px var(--accent-40)' } : undefined}
        >
          {String(cell.dayNum).padStart(2, '0')}
        </span>

        {hasAny && (
          <div className="flex gap-1">
            {cell.hasLift && <span className="block w-2 h-[2px] bg-[var(--accent)]" />}
            {cell.hasCardio && <span className="block w-2 h-[2px] bg-[var(--ink-1)]" />}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => onClick(cell.dateStr)}
      className={[
        'group relative flex flex-col gap-2 rounded cursor-pointer p-3',
        'min-h-[210px] border transition-all duration-200 overflow-hidden',
        cell.isSelected
          ? 'border-[var(--accent)] bg-[var(--accent-12)]'
          : 'border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--line-2)] hover:bg-[var(--bg-3)]',
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--ink-3)]">
          {DOW_SHORT[new Date(cell.dateStr + 'T00:00:00').getDay()]}
        </span>
        <span
          className={[
            'font-display tabular leading-none text-[34px]',
            cell.isToday ? 'text-[var(--accent)]' : cell.isSelected ? 'text-[var(--ink-0)]' : 'text-[var(--ink-1)]',
          ].join(' ')}
          style={cell.isToday ? { textShadow: '0 0 12px var(--accent-40)' } : undefined}
        >
          {String(cell.dayNum).padStart(2, '0')}
        </span>
      </div>

      {cell.summary && (
        <p className="text-[10px] text-[var(--ink-1)] leading-relaxed pl-2 border-l border-[var(--accent-24)] flex-1 overflow-hidden whitespace-pre-line">
          {cell.summary}
        </p>
      )}

      {hasAny && (
        <div className="flex gap-1.5 mt-auto">
          {cell.hasLift   && <span className="font-mono text-[9px] font-bold tracking-[1px] text-[var(--accent-ink)] bg-[var(--accent)] px-1.5 py-0.5 rounded-sm uppercase">Lift</span>}
          {cell.hasCardio && <span className="font-mono text-[9px] font-bold tracking-[1px] text-[var(--ink-0)] bg-[var(--bg-3)] border border-[var(--line-2)] px-1.5 py-0.5 rounded-sm uppercase">Cardio</span>}
        </div>
      )}

      {hasAny && (
        <button
          onClick={e => { e.stopPropagation(); onClear(cell.dateStr); }}
          className="absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center
                     bg-[var(--danger-12)] border border-[var(--danger)]/30 text-[var(--danger)]
                     opacity-0 group-hover:opacity-100 transition-opacity"
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
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((todayMid.getTime() - d.getTime()) / 86400000);
  const label    = diffDays === 0 ? "TODAY'S SESSION"
    : diffDays === 1 ? "YESTERDAY'S SESSION"
    : `${DOW_SHORT[d.getDay()]} ${MONTHS[d.getMonth()].slice(0,3).toUpperCase()} ${d.getDate()}`;

  const isEmpty = lifts.length === 0 && cardio.length === 0;

  return (
    <div className="que-card mt-4">
      <div className="p-5">
        <h2 className="que-section-label mb-5">
          <span className="dot" />
          {label}
        </h2>

        {isEmpty ? (
          <div className="text-center py-10 border border-dashed border-[var(--line-2)] rounded">
            <p className="font-mono text-[11px] tracking-[1px] text-[var(--ink-3)] uppercase">
              {isToday ? 'No session logged · Add lifts to begin' : 'No session logged'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {lifts.length > 0 && (() => {
              const groups: Record<string, ParsedEntry[]> = {};
              lifts.forEach(e => {
                const g = e.g ?? 'other';
                (groups[g] ||= []).push(e);
              });
              return (
                <div className="flex flex-col gap-5">
                  {Object.entries(groups).map(([g, entries]) => (
                    <div key={g}>
                      <div className="flex items-center justify-between pb-2 mb-3 border-b border-[var(--line)]">
                        <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-[var(--ink-1)]">
                          {g}
                        </p>
                        <p className="font-mono text-[10px] text-[var(--ink-3)]">
                          {entries.length} EX · {entries.reduce((s, e) => s + normalizeSets(e).length, 0)} SETS
                        </p>
                      </div>
                      <div className="flex flex-col gap-2.5">
                        {entries.map((e, i) => {
                          const sets = normalizeSets(e);
                          return (
                            <div key={i} className="flex items-baseline justify-between gap-3">
                              <span className="text-[14px] font-semibold text-[var(--ink-0)] truncate">{e.n ?? e.k}</span>
                              <div className="flex flex-wrap gap-1 justify-end">
                                {sets.map((s, si) => (
                                  <span
                                    key={si}
                                    className="inline-flex items-center gap-1 font-mono text-[11px] bg-[var(--bg-2)] border border-[var(--line)] rounded-sm px-2 py-0.5 whitespace-nowrap"
                                  >
                                    <span className="text-[9px] text-[var(--ink-3)]">{si+1}</span>
                                    <span className="text-[var(--ink-0)] font-bold">{s.r || '—'}</span>
                                    {s.w && <span className="text-[var(--ink-2)]">@{s.w}</span>}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {cardio.length > 0 && (
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-[var(--ink-1)] pb-2 mb-3 border-b border-[var(--line)]">
                  Cardio
                </p>
                <div className="flex flex-col gap-2">
                  {cardio.map((e, i) => {
                    const labels: Record<string, string> = { swim: 'SWIM', run: 'RUN', bike: 'BIKE' };
                    const unit:   Record<string, string> = { swim: 'min', run: 'mi', bike: 'mi' };
                    return (
                      <div key={i} className="flex items-center justify-between gap-3 py-1">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[10px] font-bold tracking-[1.5px] text-[var(--accent)] w-12">{labels[e.k]}</span>
                          <span className="text-[14px] text-[var(--ink-0)]">
                            {e.v1 && <span className="font-mono">{e.v1} {unit[e.k]}</span>}
                            {e.v2 && <span className="font-mono text-[var(--ink-2)]"> · {e.v2}min</span>}
                          </span>
                        </div>
                        {e.note && <span className="text-[12px] text-[var(--ink-2)] truncate">{e.note}</span>}
                      </div>
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
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function CalendarScheduler() {
  const {
    today, todayStr,
    activeDayFocus, setActiveDayFocus,
    currentDisplayDate, setCurrentDisplayDate,
    viewMode, setViewMode,
    localDB, updateDayRecord,
  } = useApp();

  const navigate = useCallback((dir: 1 | -1) => {
    setCurrentDisplayDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'month')     d.setMonth(d.getMonth() + dir);
      else if (viewMode === 'week') d.setDate(d.getDate() + dir * 7);
      else                          d.setDate(d.getDate() + dir);
      return d;
    });
  }, [viewMode, setCurrentDisplayDate]);

  const goToday   = useCallback(() => setActiveDayFocus(todayStr), [todayStr, setActiveDayFocus]);
  const selectDay = useCallback((d: string) => setActiveDayFocus(d), [setActiveDayFocus]);
  const clearDay  = useCallback((dateStr: string) => {
    if (!window.confirm(`Remove all workouts for ${dateStr}?`)) return;
    updateDayRecord(dateStr, {
      exercises: '', notes: '', steps: 0,
      runDist: 0, runTime: 0, bikeDist: 0, bikeTime: 0, swimTime: 0, burn: 0,
    });
  }, [updateDayRecord]);

  const cells = useMemo<CellData[]>(() => {
    const year  = currentDisplayDate.getFullYear();
    const month = currentDisplayDate.getMonth();

    const makeCell = (dateStr: string, dayNum: number, label: string): CellData => {
      const rec = localDB[dateStr] ?? {};
      const raw = rec.exercises ?? '';
      const { hasLift, hasCardio } = detectActivity(raw);
      return {
        dateStr, dayNum, label,
        isToday:    dateStr === todayStr,
        isSelected: dateStr === activeDayFocus,
        isPadding:  false,
        hasLift, hasCardio,
        summary:    buildCellSummary(raw),
      };
    };
    const PAD: CellData = { dateStr:'', dayNum:0, label:'', isToday:false, isSelected:false, isPadding:true, hasLift:false, hasCardio:false, summary:'' };

    if (viewMode === 'month') {
      const firstDow = new Date(year, month, 1).getDay();
      const totalDays = new Date(year, month + 1, 0).getDate();
      const result: CellData[] = Array.from({ length: firstDow }, () => ({ ...PAD }));
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
        return makeCell(toDateStr(ld), ld.getDate(), `${MONTHS[ld.getMonth()]} ${ld.getDate()}`);
      });
    }
    const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(currentDisplayDate.getDate()).padStart(2,'0')}`;
    return [makeCell(ds, currentDisplayDate.getDate(), `${MONTHS[month]} ${currentDisplayDate.getDate()}, ${year}`)];
  }, [currentDisplayDate, viewMode, localDB, activeDayFocus, todayStr]);

  const activeDayRec = localDB[activeDayFocus] ?? {};
  const weekLabels = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const spotlight = useSpotlightBorder({ color: '79,195,247', size: 280, opacity: 0.45 });

  return (
    <div className="flex flex-col gap-4">

      {/* ╔══════════════════════════════════════════════════════════╗
          ║ CALENDAR CARD                                            ║
          ╚══════════════════════════════════════════════════════════╝ */}
      <div
        ref={spotlight.ref}
        onMouseMove={spotlight.onMouseMove}
        onMouseLeave={spotlight.onMouseLeave}
        onTouchMove={spotlight.onTouchMove}
        onTouchEnd={spotlight.onTouchEnd}
        className="que-card que-card-accent"
      >
        {spotlight.Overlay}
        <div className="p-5">

          {/* Navigation header */}
          <div className="flex items-center gap-3 mb-5">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 flex items-center justify-center rounded border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-1)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all"
              aria-label="Previous"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="flex-1 flex items-baseline gap-3 min-w-0">
              <span className="font-display text-[22px] lg:text-[26px] tracking-[2px] uppercase text-[var(--ink-0)] truncate">
                {navTitle(viewMode, currentDisplayDate)}
              </span>
              {activeDayFocus !== todayStr && (
                <button
                  onClick={goToday}
                  className="font-mono text-[10px] font-bold text-[var(--accent)] border border-[var(--accent)] rounded-sm px-2 py-0.5 hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] transition-all uppercase tracking-[2px]"
                >
                  TODAY
                </button>
              )}
            </div>

            <button
              onClick={() => navigate(1)}
              className="w-10 h-10 flex items-center justify-center rounded border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-1)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all"
              aria-label="Next"
            >
              <ChevronRight size={18} />
            </button>

            <div className="hidden md:flex bg-[var(--bg-2)] border border-[var(--line)] rounded-sm p-1 gap-0.5">
              {(['day','week','month'] as ViewMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={[
                    'px-3 py-1.5 rounded-sm font-mono text-[10px] font-bold tracking-[1.5px] uppercase transition-all',
                    viewMode === m
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                      : 'text-[var(--ink-2)] hover:text-[var(--ink-0)]',
                  ].join(' ')}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <AnimatePresence mode="sync" initial={false}>

            {viewMode === 'month' && (
              <motion.div
                key={`month-${currentDisplayDate.getFullYear()}-${currentDisplayDate.getMonth()}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div className="grid grid-cols-7 gap-1.5 mb-2">
                  {weekLabels.map(l => (
                    <div key={l} className="text-center font-mono text-[10px] font-bold text-[var(--ink-3)] tracking-[2px] py-2">
                      <span className="md:hidden">{l[0]}</span>
                      <span className="hidden md:inline">{l}</span>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {cells.map((cell, i) =>
                    cell.isPadding ? (
                      <div key={`pad-${i}`} className="min-h-[48px] lg:min-h-[96px]" />
                    ) : (
                      <DayCell key={cell.dateStr} cell={cell} onClick={selectDay} onClear={clearDay} />
                    )
                  )}
                </div>
              </motion.div>
            )}

            {viewMode === 'week' && (
              <motion.div
                key={`week-${toDateStr(currentDisplayDate)}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
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

            {viewMode === 'day' && cells[0] && (
              <motion.div
                key={`day-${cells[0].dateStr}`}
                initial={{ opacity: 0, scale: 0.97, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -6 }}
                transition={{ duration: 0.22 }}
              >
                <div className="rounded border border-[var(--accent)] bg-[var(--accent-12)] p-6 min-h-[180px]">
                  <div className="flex items-baseline gap-4 mb-4">
                    <span
                      className="font-display text-[72px] leading-none tabular text-[var(--accent)]"
                      style={{ textShadow: '0 0 24px var(--accent-40)' }}
                    >
                      {String(cells[0].dayNum).padStart(2, '0')}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--ink-1)] tracking-[2px] uppercase">
                      {weekLabels[new Date(cells[0].dateStr + 'T00:00:00').getDay()]}
                    </span>
                    <div className="flex gap-1.5 ml-auto">
                      {cells[0].hasLift   && <span className="font-mono text-[10px] font-bold tracking-[1.5px] text-[var(--accent-ink)] bg-[var(--accent)] px-2 py-1 rounded-sm uppercase">Lift</span>}
                      {cells[0].hasCardio && <span className="font-mono text-[10px] font-bold tracking-[1.5px] text-[var(--ink-0)] bg-[var(--bg-2)] border border-[var(--line-2)] px-2 py-1 rounded-sm uppercase">Cardio</span>}
                    </div>
                  </div>
                  {cells[0].summary ? (
                    <p className="text-[13px] text-[var(--ink-1)] leading-relaxed pl-3 border-l-2 border-[var(--accent)] whitespace-pre-line">
                      {cells[0].summary}
                    </p>
                  ) : (
                    <p className="font-mono text-[11px] tracking-[1px] text-[var(--ink-3)] uppercase">No session logged.</p>
                  )}
                </div>
              </motion.div>
            )}

          </AnimatePresence>

        </div>
      </div>

      <motion.div
        key={activeDayFocus}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.06 }}
      >
        <TodaysWorkoutSummary dateStr={activeDayFocus} rec={activeDayRec} />
      </motion.div>

    </div>
  );
}
