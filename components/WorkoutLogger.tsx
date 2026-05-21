'use client';

/**
 * components/WorkoutLogger.tsx
 *
 * Native React port of workout-logger.js.
 * Full interactive workout logging: muscle-group pills, per-set form with
 * Enter-key auto-advance, inline name / set editing, cardio entries,
 * template pool, Save Workout modal with recurring schedule, and Log Workout.
 *
 * Depends on AppContext for: activeDayFocus, localDB, updateDayRecord,
 * currentGroup/setCurrentGroup, pendingSetsCount/Count, getUsage/bumpUsage,
 * getTemplatePool/saveTemplatePool, getWorkoutPresets/saveWorkoutPresets.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  Dumbbell,
  Edit3,
  Flame,
  Layers,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  useApp,
  PRESETS,
  DEFAULT_TEMPLATES,
  type ExerciseEntry,
  type SetData,
  type WorkoutTemplate,
  type WorkoutPreset,
} from '@/lib/AppContext';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type CardioKind = 'run' | 'bike' | 'swim';

interface NormalizedLift extends ExerciseEntry {
  sets: Array<{ r: string; w: string }>;
  _idx: number; // index in the full exercises array
}

interface CardioItem extends ExerciseEntry {
  k: CardioKind;
  _idx: number;
}

interface SwmState {
  name:        string;
  isPreset:    boolean;
  isRecurring: boolean;
  days:        number[];
  freq:        1 | 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS = Object.keys(PRESETS) as Array<keyof typeof PRESETS>;

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const CARDIO_CFG: Record<CardioKind, {
  icon: string; label: string;
  f1: string; f1ph: string;
  f2: string; f2ph: string;
  notePh: string;
  accentClass: string;
  borderStyle: string;
}> = {
  swim: {
    icon: '🏊', label: 'Swimming',
    f1: 'Duration (min)', f1ph: '45',
    f2: 'Distance',       f2ph: '1500 yds',
    notePh: 'Drills, laps, style…',
    accentClass: 'border-l-[#6aaec4]',
    borderStyle: 'linear-gradient(135deg,rgba(6,203,232,0.04),transparent)',
  },
  run: {
    icon: '🏃', label: 'Running',
    f1: 'Distance (mi)', f1ph: '5.2',
    f2: 'Time (min)',    f2ph: '45',
    notePh: 'Pace, route, effort…',
    accentClass: 'border-l-[#80b99a]',
    borderStyle: 'linear-gradient(135deg,rgba(15,217,160,0.04),transparent)',
  },
  bike: {
    icon: '🚴', label: 'Cycling',
    f1: 'Distance (mi)', f1ph: '20',
    f2: 'Time (min)',    f2ph: '60',
    notePh: 'Route, watts, HR zone…',
    accentClass: 'border-l-[#c4a06a]',
    borderStyle: 'linear-gradient(135deg,rgba(245,166,35,0.04),transparent)',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CLASS FRAGMENTS
// ─────────────────────────────────────────────────────────────────────────────

const INPUT =
  'w-full rounded-lg bg-[#111228] border border-[rgba(140,150,255,0.12)] text-white ' +
  'text-sm px-3 py-2.5 outline-none transition-all duration-200 ' +
  'focus:border-[rgba(200,210,255,0.28)] focus:ring-2 focus:ring-white/7 appearance-none';

const LABEL = 'block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5';

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function parseEx(raw: string): ExerciseEntry[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return raw.split('\n').filter(l => l.trim()).map(l => ({ k: 'text' as const, n: l }));
  }
}

function serializeEx(arr: ExerciseEntry[]): string {
  return arr.length ? JSON.stringify(arr) : '';
}

function normalizeSets(e: ExerciseEntry): Array<{ r: string; w: string }> {
  if (e.sets && Array.isArray(e.sets)) return e.sets;
  const count = parseInt(String(e.s ?? '1')) || 1;
  return Array.from({ length: count }, () => ({
    r: String(e.r ?? '1'),
    w: String(e.w ?? ''),
  }));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — FormatSets (renders set data as styled JSX)
// ─────────────────────────────────────────────────────────────────────────────

function FormatSets({ sets }: { sets: Array<{ r: string; w: string }> }) {
  if (!sets.length) return <span className="text-slate-600">—</span>;
  const n = sets.length;
  const allSameReps   = sets.every(s => s.r === sets[0].r);
  const allSameWeight = sets.every(s => s.w === sets[0].w);

  if (allSameReps && allSameWeight) {
    return (
      <span className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-[15px] font-extrabold text-white leading-none">
          {n}×{sets[0].r || '—'}
        </span>
        {sets[0].w && (
          <span className="text-[11px] font-medium text-indigo-300/45">
            @ {sets[0].w}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="text-[10px] font-bold text-slate-600">{n} sets</span>
      {sets.map((s, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 font-mono bg-indigo-500/7 border border-indigo-500/14 rounded px-2 py-0.5 whitespace-nowrap"
        >
          <span className="text-[9px] text-slate-600 font-bold">S{i + 1}</span>
          <span className="text-[15px] font-extrabold text-[#f0f0f0]">{s.r || '—'}</span>
          {s.w && <span className="text-[11px] text-indigo-300/45">@ {s.w}</span>}
        </span>
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — SetBadge (inline set editing, self-contained)
// ─────────────────────────────────────────────────────────────────────────────

function SetBadge({ sets, onSave }: {
  sets:   Array<{ r: string; w: string }>;
  onSave: (updated: Array<{ r: string; w: string }>) => void;
}) {
  const [editing,  setEditing]  = useState(false);
  const [editSets, setEditSets] = useState<Array<{ r: string; w: string }>>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const startEdit = () => {
    setEditSets(sets.map(s => ({ ...s })));
    setEditing(true);
  };

  const commit = useCallback(() => {
    onSave(editSets);
    setEditing(false);
  }, [editSets, onSave]);

  const updateSet = (i: number, field: 'r' | 'w', val: string) => {
    setEditSets(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: val };
      return next;
    });
  };

  if (editing) {
    return (
      <div
        ref={wrapRef}
        className="flex flex-col gap-1.5 p-2 bg-[#07081a] border border-[rgba(180,190,255,0.18)] rounded-lg"
        onBlur={e => {
          if (!wrapRef.current?.contains(e.relatedTarget as Node)) commit();
        }}
      >
        {editSets.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-600 min-w-[14px] text-right">{i + 1}</span>
            <input
              autoFocus={i === 0}
              type="text"
              value={s.r}
              placeholder="reps"
              className="w-10 rounded px-1.5 py-1 text-xs font-mono bg-[#0b0c1c] border border-[rgba(140,150,255,0.18)] text-white outline-none focus:border-[rgba(200,210,255,0.28)]"
              onChange={e => updateSet(i, 'r', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(); }}
            />
            <span className="text-slate-600 text-xs">@</span>
            <input
              type="text"
              value={s.w}
              placeholder="wt"
              className="w-16 rounded px-1.5 py-1 text-xs font-mono bg-[#0b0c1c] border border-[rgba(140,150,255,0.18)] text-white outline-none focus:border-[rgba(200,210,255,0.28)]"
              onChange={e => updateSet(i, 'w', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(); }}
            />
          </div>
        ))}
        <button
          onMouseDown={e => { e.preventDefault(); commit(); }}
          className="flex items-center justify-center gap-1 text-[10px] font-bold text-emerald-400 mt-0.5 hover:text-white transition-colors"
        >
          <Check size={10} /> Save
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="inline-flex flex-wrap items-center gap-1 text-left cursor-pointer
                 font-mono rounded-lg px-2.5 py-2 border border-[rgba(140,150,255,0.13)]
                 bg-[rgba(140,150,255,0.07)] hover:border-[rgba(180,190,255,0.28)]
                 transition-all duration-200 hover:scale-[1.03] group"
      title="Click to edit sets"
    >
      <FormatSets sets={sets} />
      <Edit3 size={9} className="text-slate-600 group-hover:text-slate-400 ml-1 flex-shrink-0" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — ExerciseItem (with inline name editing)
// ─────────────────────────────────────────────────────────────────────────────

function ExerciseItem({
  entry, numIdx, onDelete, onUpdateName, onUpdateSets,
}: {
  entry:        NormalizedLift;
  numIdx:       number;
  onDelete:     (idx: number) => void;
  onUpdateName: (idx: number, name: string) => void;
  onUpdateSets: (idx: number, sets: Array<{ r: string; w: string }>) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal,     setNameVal]     = useState(entry.n ?? '');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const startNameEdit = () => {
    setNameVal(entry.n ?? '');
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 10);
  };

  const commitName = () => {
    const v = nameVal.trim();
    if (v && v !== entry.n) onUpdateName(entry._idx, v);
    setEditingName(false);
  };

  const grpColor: Record<string, string> = {
    chest: 'text-indigo-400/70', back: 'text-cyan-400/70', shoulders: 'text-violet-400/70',
    tricep: 'text-purple-400/70', bicep: 'text-pink-400/70', forearms: 'text-rose-400/70',
    abs: 'text-orange-400/70', quads: 'text-amber-400/70', hamstring: 'text-yellow-400/70',
    glutes: 'text-lime-400/70', calfs: 'text-green-400/70', adductors: 'text-teal-400/70',
  };

  return (
    <div className="group flex items-center gap-3 bg-[#111228]/70 border border-[rgba(140,150,255,0.08)] rounded-xl px-4 py-3 transition-all duration-200 hover:border-[rgba(140,150,255,0.16)] hover:bg-[#181a32]/70 hover:scale-[1.008] relative overflow-hidden">
      {/* Left accent bar */}
      <span className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl bg-white/20 opacity-60 group-hover:opacity-100 transition-opacity" />

      {/* Index number */}
      <span className="text-[10px] font-bold font-mono text-slate-700 min-w-[18px] text-right flex-shrink-0">
        {numIdx + 1}
      </span>

      {/* Group badge */}
      {entry.k === 'lift' && entry.g && (
        <span className={`text-[9px] font-extrabold uppercase tracking-widest flex-shrink-0 ${grpColor[entry.g] ?? 'text-slate-500'}`}>
          {entry.g}
        </span>
      )}

      {/* Name + Sets (stacked column) */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {/* Exercise name */}
        {editingName ? (
          <input
            ref={nameInputRef}
            autoFocus
            type="text"
            value={nameVal}
            className="text-sm text-white font-medium bg-transparent border-b border-white/30 outline-none pb-0.5 w-full"
            onChange={e => setNameVal(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); nameInputRef.current?.blur(); }
              if (e.key === 'Escape') { setEditingName(false); }
            }}
          />
        ) : (
          <span
            onClick={startNameEdit}
            className="text-sm text-white font-medium cursor-text hover:text-white/80 word-break-break-word"
          >
            {entry.n ?? entry.k}
          </span>
        )}

        {/* Sets badge */}
        {entry.k === 'lift' && entry.sets && (
          <SetBadge
            sets={entry.sets}
            onSave={updated => onUpdateSets(entry._idx, updated)}
          />
        )}
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(entry._idx)}
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-transparent group-hover:text-slate-600 hover:!text-red-400 hover:bg-red-500/10 transition-all duration-200"
        title="Remove"
      >
        <X size={16} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — CardioEntryCard
// ─────────────────────────────────────────────────────────────────────────────

function CardioEntryCard({
  entry, onDelete, onUpdateField,
}: {
  entry:         CardioItem;
  onDelete:      (idx: number) => void;
  onUpdateField: (idx: number, field: 'v1' | 'v2' | 'note', val: string) => void;
}) {
  const cfg = CARDIO_CFG[entry.k];

  return (
    <div
      className={`rounded-xl border border-[rgba(140,150,255,0.1)] border-l-4 ${cfg.accentClass} px-5 py-4 transition-all duration-200`}
      style={{ background: cfg.borderStyle }}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-xl">{cfg.icon}</span>
        <span className="text-sm font-bold text-white flex-1">{cfg.label}</span>
        <button
          onClick={() => onDelete(entry._idx)}
          className="w-7 h-7 flex items-center justify-center rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <X size={15} />
        </button>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className={LABEL}>{cfg.f1}</label>
          <input
            type="text"
            className={INPUT}
            value={entry.v1 ?? ''}
            placeholder={cfg.f1ph}
            onChange={e => onUpdateField(entry._idx, 'v1', e.target.value)}
          />
        </div>
        <div>
          <label className={LABEL}>{cfg.f2}</label>
          <input
            type="text"
            className={INPUT}
            value={entry.v2 ?? ''}
            placeholder={cfg.f2ph}
            onChange={e => onUpdateField(entry._idx, 'v2', e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className={LABEL}>Notes</label>
        <input
          type="text"
          className={INPUT}
          value={entry.note ?? ''}
          placeholder={cfg.notePh}
          onChange={e => onUpdateField(entry._idx, 'note', e.target.value)}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — TemplateModal
// ─────────────────────────────────────────────────────────────────────────────

function TemplateModal({
  open, templates, onLoad, onClose,
}: {
  open:      boolean;
  templates: WorkoutTemplate[];
  onLoad:    (text: string) => void;
  onClose:   () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
    <motion.div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center backdrop-blur-sm"
      style={{ background: 'rgba(4,5,18,0.82)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="w-full md:max-w-[580px] max-h-[88vh] overflow-y-auto rounded-t-2xl md:rounded-2xl border border-[rgba(140,150,255,0.12)] bg-[#0b0c1c] p-5 shadow-2xl"
        initial={{ opacity: 0, y: 64, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 48, scale: 0.97 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="w-10 h-1 bg-[rgba(180,190,255,0.18)] rounded-full mx-auto mb-6 md:hidden" />
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-xl font-extrabold text-white tracking-tight">Load Template</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
            <X size={22} />
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          {templates.map(tmpl => (
            <button
              key={tmpl.id}
              onClick={() => { onLoad(tmpl.text); onClose(); }}
              className="text-left rounded-xl bg-[#111228]/80 border border-[rgba(140,150,255,0.1)] px-4 py-3.5 hover:border-[rgba(180,190,255,0.22)] hover:bg-[#181a32]/80 hover:translate-x-[3px] transition-all duration-200"
            >
              <p className="text-sm font-bold text-white mb-1">{tmpl.title}</p>
              <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 whitespace-pre-line">{tmpl.text}</p>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-3 rounded-xl bg-[#111228] border border-[rgba(140,150,255,0.1)] text-sm font-bold text-slate-400 hover:text-white hover:border-slate-600 transition-all"
        >
          Cancel
        </button>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — SaveWorkoutModal
// ─────────────────────────────────────────────────────────────────────────────

function SaveWorkoutModal({
  open, swm, lifts, onClose, onSave,
  onChangeName, onTogglePreset, onToggleRecurring,
  onToggleDay, onSetFreq,
}: {
  open:             boolean;
  swm:              SwmState;
  lifts:            NormalizedLift[];
  onClose:          () => void;
  onSave:           () => void;
  onChangeName:     (v: string) => void;
  onTogglePreset:   () => void;
  onToggleRecurring:() => void;
  onToggleDay:      (d: number) => void;
  onSetFreq:        (n: 1 | 2) => void;
}) {
  const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`relative w-[38px] h-[22px] rounded-full border flex-shrink-0 transition-all duration-200 ${
        on
          ? 'bg-[#f0f0f0] border-[#f0f0f0]'
          : 'bg-[#181a32] border-[rgba(140,150,255,0.12)]'
      }`}
    >
      <span className={`absolute top-[3px] w-4 h-4 rounded-full transition-all duration-200 ${
        on ? 'left-[18px] bg-[#0a0a0a]' : 'left-[2px] bg-slate-600'
      }`} />
    </button>
  );

  return (
    <AnimatePresence>
      {open && (
    <motion.div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center backdrop-blur-sm"
      style={{ background: 'rgba(4,5,18,0.82)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="w-full md:max-w-[580px] max-h-[88vh] overflow-y-auto rounded-t-2xl md:rounded-2xl border border-[rgba(140,150,255,0.12)] bg-[#0b0c1c] p-5 shadow-2xl"
        initial={{ opacity: 0, y: 64, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 48, scale: 0.97 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="w-10 h-1 bg-[rgba(180,190,255,0.18)] rounded-full mx-auto mb-6 md:hidden" />
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-xl font-extrabold text-white tracking-tight">Save Workout</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
            <X size={22} />
          </button>
        </div>

        {/* Workout name */}
        <div className="mb-5">
          <label className={LABEL}>Workout Name</label>
          <input
            autoFocus
            type="text"
            className={INPUT}
            value={swm.name}
            placeholder="e.g. Chest Day"
            onChange={e => onChangeName(e.target.value)}
          />
        </div>

        {/* Toggles */}
        <div className="flex flex-col divide-y divide-white/5">
          {/* Save to Presets */}
          <button
            onClick={onTogglePreset}
            className="flex items-center gap-3.5 py-4 hover:opacity-80 transition-opacity text-left w-full"
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Save to Presets</p>
              <p className="text-xs text-slate-500 mt-0.5">Load this workout anytime from the template picker</p>
            </div>
            <Toggle on={swm.isPreset} onClick={() => {}} />
          </button>

          {/* Recurring */}
          <button
            onClick={onToggleRecurring}
            className="flex items-center gap-3.5 py-4 hover:opacity-80 transition-opacity text-left w-full"
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Recurring Schedule</p>
              <p className="text-xs text-slate-500 mt-0.5">Automatically suggest this workout on selected days</p>
            </div>
            <Toggle on={swm.isRecurring} onClick={() => {}} />
          </button>
        </div>

        {/* Recurring options */}
        {swm.isRecurring && (
          <div className="mt-4 p-4 bg-[#111228]/60 rounded-xl border border-[rgba(140,150,255,0.08)]">
            {/* Day picker */}
            <p className={LABEL + ' mb-2.5'}>Days of Week</p>
            <div className="flex gap-1.5 flex-wrap mb-4">
              {DAY_LABELS.map((d, i) => (
                <button
                  key={d}
                  onClick={() => onToggleDay(i)}
                  className={[
                    'flex-1 min-w-[36px] py-2 rounded-lg text-[11px] font-bold border transition-all text-center',
                    swm.days.includes(i)
                      ? 'bg-white/10 border-white/28 text-white'
                      : 'bg-[#111228] border-[rgba(140,150,255,0.12)] text-slate-500 hover:text-white',
                  ].join(' ')}
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Frequency */}
            <p className={LABEL + ' mb-2.5'}>Frequency</p>
            <div className="flex gap-2">
              {([1, 2] as const).map(n => (
                <button
                  key={n}
                  onClick={() => onSetFreq(n)}
                  className={[
                    'flex-1 py-2 rounded-lg text-xs font-bold border transition-all',
                    swm.freq === n
                      ? 'bg-white/10 border-white/28 text-white'
                      : 'bg-[#111228] border-[rgba(140,150,255,0.12)] text-slate-500 hover:text-white',
                  ].join(' ')}
                >
                  {n === 1 ? 'Weekly' : 'Bi-weekly'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Save button */}
        <button
          onClick={onSave}
          disabled={!swm.name.trim() || lifts.length === 0}
          className="mt-5 w-full py-3.5 rounded-xl bg-[#f0f0f0] text-[#0a0a0a] text-sm font-bold uppercase tracking-widest transition-all hover:bg-white hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save Workout
        </button>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT — WorkoutLogger
// ─────────────────────────────────────────────────────────────────────────────

export default function WorkoutLogger() {
  const {
    today, todayStr,
    activeDayFocus,
    localDB, updateDayRecord,
    currentGroup, setCurrentGroup,
    pendingSetsCount, setPendingSetsCount,
    pendingSetData, setPendingSetData,
    getUsage, bumpUsage,
    getTemplatePool, saveTemplatePool,
    getWorkoutPresets, saveWorkoutPresets,
  } = useApp();

  // ── Exercises + notes (local mirror of localDB[activeDayFocus]) ───────────
  const [exercises, setExercisesRaw] = useState<ExerciseEntry[]>([]);
  const [notes,     setNotesRaw]     = useState('');

  // ── Form state ────────────────────────────────────────────────────────────
  const [selectedEx,  setSelectedEx]  = useState('');
  const [isCustomEx,  setIsCustomEx]  = useState(false);
  const [customName,  setCustomName]  = useState('');

  // ── UI state ──────────────────────────────────────────────────────────────
  const [saveFlash,      setSaveFlash]      = useState(false);
  const [loggedFlash,    setLoggedFlash]    = useState(false);
  const [templateModal,  setTemplateModal]  = useState(false);
  const [saveModal,      setSaveModal]      = useState(false);
  const [recurringPreset, setRecurringPreset] = useState<WorkoutPreset | null>(null);

  // ── Save Workout modal state ───────────────────────────────────────────────
  const [swm, setSwm] = useState<SwmState>({
    name: '', isPreset: true, isRecurring: false, days: [], freq: 1,
  });

  // ── Refs ──────────────────────────────────────────────────────────────────
  const pillsRowRef    = useRef<HTMLDivElement>(null);
  const dragState      = useRef({ dragging: false, startX: 0, scrollLeft: 0, moved: false });
  const repsRefs       = useRef<Array<HTMLInputElement | null>>([]);
  const weightRefs     = useRef<Array<HTMLInputElement | null>>([]);
  const notesFlashRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS — persist & derive
  // ─────────────────────────────────────────────────────────────────────────

  /** Persist exercises (and derived cardio totals) to localDB. */
  const persistExercises = useCallback(
    (arr: ExerciseEntry[], notesTxt = notes) => {
      const raw   = serializeEx(arr);
      const runs  = arr.filter(e => e.k === 'run');
      const bikes = arr.filter(e => e.k === 'bike');
      const swims = arr.filter(e => e.k === 'swim');

      updateDayRecord(activeDayFocus, {
        exercises: raw,
        notes:     notesTxt,
        runDist:   runs.reduce((s, e)  => s + (parseFloat(e.v1 ?? '0') || 0), 0),
        runTime:   runs.reduce((s, e)  => s + (parseFloat(e.v2 ?? '0') || 0), 0),
        bikeDist:  bikes.reduce((s, e) => s + (parseFloat(e.v1 ?? '0') || 0), 0),
        bikeTime:  bikes.reduce((s, e) => s + (parseFloat(e.v2 ?? '0') || 0), 0),
        swimTime:  swims.reduce((s, e) => s + (parseFloat(e.v1 ?? '0') || 0), 0),
      });

      // Flash save indicator
      setSaveFlash(true);
      if (notesFlashRef.current) clearTimeout(notesFlashRef.current);
      notesFlashRef.current = setTimeout(() => setSaveFlash(false), 2000);
    },
    [activeDayFocus, notes, updateDayRecord]
  );

  const setExercises = useCallback(
    (arr: ExerciseEntry[]) => {
      setExercisesRaw(arr);
      persistExercises(arr);
    },
    [persistExercises]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // INIT — reload when day changes
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const rec = localDB[activeDayFocus] ?? {};
    setExercisesRaw(parseEx(rec.exercises ?? ''));
    setNotesRaw(rec.notes ?? '');

    // Check for recurring workout on this day of week
    const dow     = new Date(activeDayFocus + 'T00:00:00').getDay();
    const all     = getWorkoutPresets();
    const match   = all.find(p => p.isRecurring && p.daysOfWeek.includes(dow));
    const hasLifts = parseEx(rec.exercises ?? '').some(e => e.k === 'lift');
    setRecurringPreset(match && !hasLifts ? match : null);
  }, [activeDayFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────
  // DERIVED LISTS
  // ─────────────────────────────────────────────────────────────────────────

  const lifts = useMemo<NormalizedLift[]>(() =>
    exercises
      .map((e, i) => ({ ...e, sets: normalizeSets(e), _idx: i }))
      .filter(e => e.k === 'lift' || e.k === 'text') as NormalizedLift[],
    [exercises]
  );

  const cardios = useMemo<CardioItem[]>(() =>
    exercises
      .map((e, i) => ({ ...e, _idx: i }))
      .filter(e => ['run','bike','swim'].includes(e.k)) as CardioItem[],
    [exercises]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // EXERCISE SELECT — sorted by usage, presets below
  // ─────────────────────────────────────────────────────────────────────────

  const exerciseOptions = useMemo(() => {
    const usage       = getUsage()[currentGroup] ?? {};
    const usedNames   = Object.keys(usage).sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0));
    const unusedPresets = (PRESETS[currentGroup as keyof typeof PRESETS] ?? [])
      .filter(e => !usage[e]);
    return [...usedNames, ...unusedPresets];
  }, [currentGroup, getUsage]); // eslint-disable-line react-hooks/exhaustive-deps

  // When group or options change, reset selected exercise
  useEffect(() => {
    setSelectedEx(exerciseOptions[0] ?? '');
    setIsCustomEx(false);
    setCustomName('');
  }, [currentGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────
  // MUSCLE GROUP PILL DRAG-SCROLL
  // ─────────────────────────────────────────────────────────────────────────

  const onPillsMouseDown = useCallback((e: React.MouseEvent) => {
    const row = pillsRowRef.current;
    if (!row) return;
    dragState.current = { dragging: true, startX: e.pageX, scrollLeft: row.scrollLeft, moved: false };
    row.style.cursor = 'grabbing';
    row.style.userSelect = 'none';
  }, []);

  const onPillsMouseMove = useCallback((e: React.MouseEvent) => {
    const row = pillsRowRef.current;
    if (!row || !dragState.current.dragging) return;
    const dx = e.pageX - dragState.current.startX;
    if (Math.abs(dx) > 3) dragState.current.moved = true;
    if (dragState.current.moved) row.scrollLeft = dragState.current.scrollLeft - dx;
  }, []);

  const onPillsMouseUp = useCallback(() => {
    const row = pillsRowRef.current;
    if (!row) return;
    dragState.current.dragging = false;
    row.style.cursor = 'grab';
    row.style.userSelect = '';
  }, []);

  const onPillsWheel = useCallback((e: React.WheelEvent) => {
    const row = pillsRowRef.current;
    if (!row) return;
    e.preventDefault();
    row.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
  }, []);

  const handlePillClick = useCallback((g: string, e: React.MouseEvent) => {
    if (dragState.current.moved) { e.stopPropagation(); dragState.current.moved = false; return; }
    setCurrentGroup(g);
    // Scroll the pill into view
    const pill = pillsRowRef.current?.querySelector(`[data-group="${g}"]`) as HTMLElement | null;
    pill?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [setCurrentGroup]);

  // ─────────────────────────────────────────────────────────────────────────
  // SETS FORM
  // ─────────────────────────────────────────────────────────────────────────

  const adjustSets = useCallback((delta: number) => {
    setPendingSetsCount(prev => {
      const next = Math.max(1, Math.min(20, prev + delta));
      setPendingSetData(d => {
        const copy = [...d];
        while (copy.length < next) copy.push({ r: '1', w: '' });
        copy.length = next;
        return copy;
      });
      return next;
    });
  }, [setPendingSetsCount, setPendingSetData]);

  const updatePendingSet = useCallback((i: number, field: 'r' | 'w', val: string) => {
    setPendingSetData(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: val };
      return next;
    });
  }, [setPendingSetData]);

  // Enter key handlers for set inputs
  const handleRepsKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Enter') { e.preventDefault(); weightRefs.current[idx]?.focus(); }
  }, []);

  const handleWeightKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (idx < pendingSetsCount - 1) {
      repsRefs.current[idx + 1]?.focus();
    } else {
      commitLift();
    }
  }, [pendingSetsCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────────────────
  // COMMIT LIFT
  // ─────────────────────────────────────────────────────────────────────────

  const commitLift = useCallback(() => {
    const name = isCustomEx
      ? customName.trim()
      : selectedEx;
    if (!name || name === '__custom__') return;

    // Snapshot current DOM values into pendingSetData
    const snappedSets = pendingSetData.map((s, i) => ({
      r: repsRefs.current[i]?.value.trim()   || s.r || '1',
      w: weightRefs.current[i]?.value.trim() || s.w || '',
    }));

    bumpUsage(currentGroup, name);

    const next = [
      ...exercises,
      { k: 'lift' as const, g: currentGroup, n: name, sets: snappedSets },
    ];
    setExercises(next);

    // Reset weights only, keep set count and reps=1
    setPendingSetData(Array.from({ length: pendingSetsCount }, () => ({ r: '1', w: '' })));
    if (isCustomEx) { setCustomName(''); }
  }, [
    isCustomEx, customName, selectedEx, pendingSetData,
    currentGroup, exercises, pendingSetsCount,
    bumpUsage, setExercises, setPendingSetData,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // CARDIO
  // ─────────────────────────────────────────────────────────────────────────

  const addCardioEntry = useCallback((kind: CardioKind) => {
    setExercises([...exercises, { k: kind, v1: '', v2: '', note: '' }]);
  }, [exercises, setExercises]);

  const deleteEntry = useCallback((idx: number) => {
    const next = exercises.filter((_, i) => i !== idx);
    setExercises(next);
  }, [exercises, setExercises]);

  const updateCardioField = useCallback(
    (idx: number, field: 'v1' | 'v2' | 'note', val: string) => {
      const next = exercises.map((e, i) =>
        i === idx ? { ...e, [field]: val } : e
      );
      setExercisesRaw(next);
      persistExercises(next);
    },
    [exercises, persistExercises]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // EXERCISE LIST MUTATIONS
  // ─────────────────────────────────────────────────────────────────────────

  const updateExerciseName = useCallback((idx: number, name: string) => {
    const next = exercises.map((e, i) => i === idx ? { ...e, n: name } : e);
    setExercises(next);
  }, [exercises, setExercises]);

  const updateExerciseSets = useCallback(
    (idx: number, sets: Array<{ r: string; w: string }>) => {
      const next = exercises.map((e, i) => i === idx ? { ...e, sets } : e);
      setExercises(next);
    },
    [exercises, setExercises]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // CLEAR + LOG WORKOUT
  // ─────────────────────────────────────────────────────────────────────────

  const clearWorkout = useCallback(() => {
    if (!window.confirm(`Clear all workout & cardio data for ${activeDayFocus}?`)) return;
    setExercisesRaw([]);
    setNotesRaw('');
    updateDayRecord(activeDayFocus, {
      exercises: '', notes: '', steps: 0,
      runDist: 0, runTime: 0, bikeDist: 0, bikeTime: 0, swimTime: 0, burn: 0,
    });
  }, [activeDayFocus, updateDayRecord]);

  const logWorkout = useCallback(() => {
    persistExercises(exercises, notes);
    setLoggedFlash(true);
    setTimeout(() => setLoggedFlash(false), 2200);
  }, [exercises, notes, persistExercises]);

  // ─────────────────────────────────────────────────────────────────────────
  // TEMPLATE LOADING
  // ─────────────────────────────────────────────────────────────────────────

  const loadTemplate = useCallback((text: string) => {
    const newEntries = text
      .split('\n')
      .filter(l => l.trim())
      .map(l => ({ k: 'text' as const, n: l }));
    setExercises([...exercises, ...newEntries]);
  }, [exercises, setExercises]);

  const templates = useMemo(() => getTemplatePool(), [getTemplatePool]);

  // ─────────────────────────────────────────────────────────────────────────
  // RECURRING WORKOUT
  // ─────────────────────────────────────────────────────────────────────────

  const loadRecurringWorkout = useCallback((preset: WorkoutPreset) => {
    const newEntries = parseEx(preset.exercises);
    setExercises([...exercises, ...newEntries]);
    setRecurringPreset(null);
  }, [exercises, setExercises]);

  // ─────────────────────────────────────────────────────────────────────────
  // SAVE WORKOUT MODAL
  // ─────────────────────────────────────────────────────────────────────────

  const openSaveModal = useCallback(() => {
    const groups = [...new Set(lifts.map(e => e.g ?? 'other'))];
    const autoName = groups.map(capitalize).join(' + ') + ' Workout';
    setSwm({ name: autoName, isPreset: true, isRecurring: false, days: [], freq: 1 });
    setSaveModal(true);
  }, [lifts]);

  const confirmSave = useCallback(() => {
    const name = swm.name.trim();
    if (!name || lifts.length === 0) return;

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // Add to template pool if preset
    if (swm.isPreset) {
      const pool = getTemplatePool();
      const textLines = lifts.map(e => {
        const n = e.sets ? e.sets.length : 1;
        return `${e.n ?? 'Exercise'}: ${n}x`;
      });
      pool.push({ id, title: name, text: textLines.join('\n') });
      saveTemplatePool(pool);
    }

    // Save as workout preset (always)
    const preset: WorkoutPreset = {
      id,
      name,
      exercises:   JSON.stringify(lifts.map(({ _idx: _, ...e }) => e)),
      isRecurring: swm.isRecurring,
      daysOfWeek:  swm.isRecurring ? [...swm.days] : [],
      everyNWeeks: swm.freq,
      createdAt:   activeDayFocus,
    };
    saveWorkoutPresets([...getWorkoutPresets(), preset]);

    setSaveModal(false);
  }, [swm, lifts, activeDayFocus, getTemplatePool, saveTemplatePool, getWorkoutPresets, saveWorkoutPresets]);

  // ─────────────────────────────────────────────────────────────────────────
  // NOTES
  // ─────────────────────────────────────────────────────────────────────────

  const handleNotesChange = useCallback((val: string) => {
    setNotesRaw(val);
    persistExercises(exercises, val);
  }, [exercises, persistExercises]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const isTodayFocus = activeDayFocus === todayStr;

  // Day label for the header pill
  const today2 = new Date();
  const d = new Date(activeDayFocus + 'T00:00:00');
  const diff = Math.round((today2.getTime() - d.getTime()) / 86400000);
  const dayLabel = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday'
    : `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;

  return (
    <>
      {/* ── Modals ── */}
      <TemplateModal
        open={templateModal}
        templates={templates}
        onLoad={loadTemplate}
        onClose={() => setTemplateModal(false)}
      />
      <SaveWorkoutModal
        open={saveModal}
        swm={swm}
        lifts={lifts}
        onClose={() => setSaveModal(false)}
        onSave={confirmSave}
        onChangeName={v => setSwm(s => ({ ...s, name: v }))}
        onTogglePreset={() => setSwm(s => ({ ...s, isPreset: !s.isPreset }))}
        onToggleRecurring={() => setSwm(s => ({ ...s, isRecurring: !s.isRecurring }))}
        onToggleDay={dayNum =>
          setSwm(s => ({
            ...s,
            days: s.days.includes(dayNum)
              ? s.days.filter(d => d !== dayNum)
              : [...s.days, dayNum],
          }))
        }
        onSetFreq={n => setSwm(s => ({ ...s, freq: n }))}
      />

      {/* ╔══════════════════════════════════════════════════════════╗
          ║  WORKOUT LOG CARD                                        ║
          ╚══════════════════════════════════════════════════════════╝ */}
      <div
        className="rounded-2xl border border-slate-800/50 backdrop-blur-md overflow-hidden"
        style={{ background: 'linear-gradient(150deg,#0d0e20 0%,#070810 100%)' }}
      >
        <div className="p-5">

          {/* ── Header row ── */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                <Dumbbell size={13} className="text-indigo-400/70" />
                Workout Log
              </h2>
              {/* Save indicator */}
              <span className={`flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 transition-opacity duration-300 ${saveFlash ? 'opacity-100' : 'opacity-0'}`}>
                <Check size={12} /> Saved
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              {/* Day pill */}
              <span className="font-mono text-xs font-bold text-slate-500 bg-[#111228] border border-slate-800 rounded-full px-3 py-1">
                {dayLabel}
              </span>
              {/* Clear */}
              <button
                onClick={clearWorkout}
                title="Clear this day's workout"
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 border border-red-500/18 text-red-400 hover:bg-red-500/18 hover:border-red-500/36 hover:scale-[1.06] transition-all duration-200"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* ── Template quick-load ── */}
          <button
            onClick={() => setTemplateModal(true)}
            className="w-full flex items-center justify-center gap-2.5 mb-5 px-4 py-3.5 rounded-xl border border-dashed border-white/11 bg-[#111228]/50 text-sm font-semibold text-white/70 hover:bg-white/7 hover:border-solid hover:text-white hover:scale-[1.01] transition-all duration-200"
          >
            <Layers size={15} />
            Load from Template
          </button>

          {/* ══════════════════════════════════════════════════════
              LIFTING SECTION
          ══════════════════════════════════════════════════════ */}
          <div className="mb-7">
            {/* Section header */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[rgba(140,150,255,0.08)]">
              <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-slate-400">
                <Dumbbell size={13} />
                Lifting
              </span>
            </div>

            {/* ── Muscle group pills ── */}
            <div className="relative mb-4">
              {/* Right fade */}
              <span className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-r from-transparent to-[#0d0e20] pointer-events-none z-10" />
              <div
                ref={pillsRowRef}
                className="flex gap-2 overflow-x-scroll pb-0.5 pr-12 scrollbar-none cursor-grab select-none"
                style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
                onMouseDown={onPillsMouseDown}
                onMouseMove={onPillsMouseMove}
                onMouseUp={onPillsMouseUp}
                onMouseLeave={onPillsMouseUp}
                onWheel={onPillsWheel}
              >
                {MUSCLE_GROUPS.map(g => (
                  <button
                    key={g}
                    data-group={g}
                    onClick={e => handlePillClick(g, e)}
                    className={[
                      'flex-shrink-0 px-5 py-2.5 rounded-full border text-sm font-semibold whitespace-nowrap transition-all duration-200',
                      currentGroup === g
                        ? 'bg-white/9 border-white/22 text-white'
                        : 'bg-[#111228] border-[rgba(140,150,255,0.12)] text-slate-500 hover:text-white hover:border-[rgba(180,190,255,0.18)]',
                    ].join(' ')}
                  >
                    {capitalize(g)}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Add Lift Form ── */}
            <div className="bg-[#111228] border border-[rgba(140,150,255,0.12)] rounded-xl p-4 mb-3.5">
              {/* Exercise select or custom input */}
              <div className="mb-3">
                {isCustomEx ? (
                  <input
                    autoFocus
                    type="text"
                    className={INPUT}
                    value={customName}
                    placeholder="Type exercise name…"
                    onChange={e => setCustomName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitLift(); } }}
                  />
                ) : (
                  <div className="relative">
                    <select
                      className={INPUT + ' pr-9 cursor-pointer'}
                      value={selectedEx}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setIsCustomEx(true);
                          setSelectedEx('');
                        } else {
                          setSelectedEx(e.target.value);
                        }
                      }}
                    >
                      {exerciseOptions.map(ex => (
                        <option key={ex} value={ex}>{ex}</option>
                      ))}
                      <option value="__custom__">✏ Custom exercise…</option>
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  </div>
                )}
                {isCustomEx && (
                  <button
                    onClick={() => { setIsCustomEx(false); setCustomName(''); }}
                    className="mt-1.5 text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                  >
                    ← Back to presets
                  </button>
                )}
              </div>

              {/* Sets stepper */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Sets</span>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => adjustSets(-1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-[rgba(140,150,255,0.12)] bg-[#0b0c1c] text-white text-lg hover:bg-[#181a32] hover:border-[rgba(180,190,255,0.18)] transition-all"
                  >
                    −
                  </button>
                  <span className="text-base font-bold font-mono text-white min-w-[24px] text-center">
                    {pendingSetsCount}
                  </span>
                  <button
                    onClick={() => adjustSets(1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-[rgba(140,150,255,0.12)] bg-[#0b0c1c] text-white text-lg hover:bg-[#181a32] hover:border-[rgba(180,190,255,0.18)] transition-all"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Set table */}
              <div className="mb-3">
                {/* Column headers */}
                <div className="grid grid-cols-[28px_1fr_1.6fr] gap-2 mb-1.5">
                  <span />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-700 pl-1">Reps</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-700 pl-1">
                    Weight <span className="font-normal text-slate-800">(optional)</span>
                  </span>
                </div>

                {/* Set rows */}
                <div className="flex flex-col gap-1.5">
                  <AnimatePresence initial={false}>
                  {pendingSetData.map((set, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.16, delay: i * 0.03, ease: 'easeOut' }}
                      className="grid grid-cols-[28px_1fr_1.6fr] gap-2 items-center"
                    >
                      <span className="text-[11px] font-bold font-mono text-slate-700 text-right">{i + 1}</span>
                      <input
                        ref={el => { repsRefs.current[i] = el; }}
                        type="number"
                        min="1"
                        inputMode="numeric"
                        value={set.r}
                        placeholder="1"
                        className={INPUT + ' py-2.5 text-[15px] font-bold text-center [appearance:textfield]'}
                        onChange={e => updatePendingSet(i, 'r', e.target.value)}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => handleRepsKeyDown(e, i)}
                      />
                      <input
                        ref={el => { weightRefs.current[i] = el; }}
                        type="text"
                        inputMode="decimal"
                        value={set.w}
                        placeholder="e.g. 135 lbs"
                        className={INPUT + ' py-2.5 text-[15px] font-bold'}
                        onChange={e => updatePendingSet(i, 'w', e.target.value)}
                        onFocus={e => e.target.select()}
                        onKeyDown={e => handleWeightKeyDown(e, i)}
                      />
                    </motion.div>
                  ))}
                  </AnimatePresence>
                </div>
              </div>

              {/* Log Exercise button */}
              <button
                onClick={commitLift}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[#f0f0f0] text-[#0a0a0a] text-xs font-bold uppercase tracking-widest hover:bg-white hover:scale-[1.01] active:scale-[0.98] transition-all duration-200"
              >
                <Plus size={14} />
                Log Exercise
              </button>
            </div>

            {/* ── Recurring banner ── */}
            {recurringPreset && (
              <div className="flex items-center justify-between gap-3 bg-[#111228] border border-[rgba(140,150,255,0.12)] rounded-xl px-4 py-3 mb-3">
                <p className="text-xs text-slate-400 flex-1">
                  Recurring: <strong className="text-white">{recurringPreset.name}</strong>
                </p>
                <button
                  onClick={() => loadRecurringWorkout(recurringPreset)}
                  className="flex-shrink-0 px-4 py-1.5 rounded-lg bg-[#f0f0f0] text-[#0a0a0a] text-[11px] font-bold uppercase tracking-widest hover:bg-white transition-colors"
                >
                  Load
                </button>
              </div>
            )}

            {/* ── Logged exercises list ── */}
            {lifts.length === 0 ? (
              <div className="text-center text-slate-600 text-sm py-6 border border-dashed border-slate-800 rounded-xl">
                No exercises yet — pick a muscle group, set reps &amp; weight, and hit Log.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {lifts.map((entry, numIdx) => (
                    <motion.div
                      key={entry._idx}
                      initial={{ opacity: 0, y: 10, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -24, scale: 0.95 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                    >
                      <ExerciseItem
                        entry={entry}
                        numIdx={numIdx}
                        onDelete={deleteEntry}
                        onUpdateName={updateExerciseName}
                        onUpdateSets={updateExerciseSets}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Save Workout button */}
            {lifts.length > 0 && (
              <button
                onClick={openSaveModal}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-[rgba(140,150,255,0.12)] text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:border-[rgba(180,190,255,0.22)] hover:text-white hover:bg-[#111228]/50 transition-all duration-200"
              >
                <Save size={13} />
                Save Workout
              </button>
            )}
          </div>

          {/* Divider */}
          <hr className="border-[rgba(140,150,255,0.08)] my-1 mb-6" />

          {/* ══════════════════════════════════════════════════════
              CARDIO SECTION
          ══════════════════════════════════════════════════════ */}
          <div className="mb-7">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[rgba(140,150,255,0.08)]">
              <span className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-slate-400">
                <Flame size={13} className="text-amber-400/70" />
                Cardio
              </span>
              <div className="flex gap-2">
                {(['swim','run','bike'] as CardioKind[]).map(kind => (
                  <button
                    key={kind}
                    onClick={() => addCardioEntry(kind)}
                    className={[
                      'text-xs font-bold px-3.5 py-2 rounded-full border transition-all duration-200 hover:scale-[1.04]',
                      kind === 'swim' ? 'text-[#6aaec4] bg-[rgba(106,174,196,0.09)] border-[rgba(6,203,232,0.22)]' : '',
                      kind === 'run'  ? 'text-[#80b99a] bg-[rgba(128,185,154,0.09)] border-[rgba(15,217,160,0.22)]'  : '',
                      kind === 'bike' ? 'text-[#c4a06a] bg-[rgba(196,160,106,0.09)] border-[rgba(245,166,35,0.22)]'  : '',
                    ].join(' ')}
                  >
                    {kind === 'swim' ? '🏊 Swim' : kind === 'run' ? '🏃 Run' : '🚴 Bike'}
                  </button>
                ))}
              </div>
            </div>

            {cardios.length === 0 ? (
              <div className="text-center text-slate-600 text-sm py-5 border border-dashed border-slate-800 rounded-xl">
                No cardio yet — tap Swim, Run, or Bike to log a session.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <AnimatePresence initial={false}>
                  {cardios.map(entry => (
                    <motion.div
                      key={entry._idx}
                      initial={{ opacity: 0, y: 10, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -24, scale: 0.95 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                    >
                      <CardioEntryCard
                        entry={entry}
                        onDelete={deleteEntry}
                        onUpdateField={updateCardioField}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Divider */}
          <hr className="border-[rgba(140,150,255,0.08)] my-1 mb-6" />

          {/* ── Session Notes ── */}
          <div className="mb-6">
            <label className={LABEL}>Session Notes</label>
            <textarea
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
              rows={2}
              placeholder="PRs hit, fatigue level, form cues…"
              className={INPUT + ' resize-y min-h-[72px]'}
            />
          </div>

          {/* Divider */}
          <hr className="border-[rgba(140,150,255,0.08)] my-1 mb-5" />

          {/* ── Log Workout ── */}
          <button
            onClick={logWorkout}
            className={[
              'w-full py-4 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all duration-200',
              loggedFlash
                ? 'bg-[#80b99a] text-[#0a0a0a] scale-[0.99]'
                : 'bg-[#f0f0f0] text-[#0a0a0a] hover:bg-white hover:scale-[1.01] active:scale-[0.98]',
            ].join(' ')}
          >
            {loggedFlash ? '✓ Logged' : 'Log Workout'}
          </button>

        </div>
      </div>

      {/* Scrollbar suppression */}
      <style>{`.scrollbar-none::-webkit-scrollbar { display: none; }`}</style>
    </>
  );
}
