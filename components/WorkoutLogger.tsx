'use client';

/**
 * components/WorkoutLogger.tsx
 *
 * Athletic redesign — all interactive logic, refs, hooks, drag-scroll,
 * keyboard handlers, template loading, recurring presets, save modal,
 * inline editing and serialization are preserved exactly. Only visuals
 * are rebuilt around the QUE token system (ice-blue accent + Anton condensed).
 */

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  AnimatePresence, motion, Reorder,
  useDragControls, useMotionValue, useTransform, animate,
} from 'framer-motion';
import { useSpotlightBorder } from '@/hooks/useSpotlightBorder';
import {
  Check, ChevronDown, Dumbbell, Edit3, Flame, GripVertical,
  Layers, Plus, Save, Trash2, X,
} from 'lucide-react';
import {
  useApp, PRESETS,
  type ExerciseEntry, type SetData,
  type WorkoutPreset,
} from '@/lib/AppContext';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES — unchanged
// ─────────────────────────────────────────────────────────────────────────────
type CardioKind = 'run' | 'bike' | 'swim';
interface NormalizedLift extends ExerciseEntry {
  sets: Array<{ r: string; w: string }>;
  _idx: number;
  _key: string;
}
interface CardioItem extends ExerciseEntry { k: CardioKind; _idx: number; }
interface SwmState {
  name: string; isPreset: boolean; isRecurring: boolean;
  days: number[]; freq: 1 | 2;
}

const MUSCLE_GROUPS = Object.keys(PRESETS) as Array<keyof typeof PRESETS>;
const DAY_LABELS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

const CARDIO_CFG: Record<CardioKind, {
  code: string; label: string;
  f1: string; f1ph: string; f1mode: React.HTMLInputTypeAttribute;
  f2: string; f2ph: string; f2mode: React.HTMLInputTypeAttribute;
  notePh: string;
}> = {
  swim: { code: 'SWIM', label: 'Swimming', f1: 'DURATION / MIN', f1ph: '45',  f1mode: 'numeric', f2: 'DISTANCE',  f2ph: '1500 yds', f2mode: 'decimal', notePh: 'drills, laps, style…' },
  run:  { code: 'RUN',  label: 'Running',  f1: 'DISTANCE / MI', f1ph: '5.2', f1mode: 'decimal', f2: 'TIME / MIN', f2ph: '45',       f2mode: 'numeric', notePh: 'pace, route, effort…' },
  bike: { code: 'BIKE', label: 'Cycling',  f1: 'DISTANCE / MI', f1ph: '20',  f1mode: 'decimal', f2: 'TIME / MIN', f2ph: '60',       f2mode: 'numeric', notePh: 'route, watts, HR zone…' },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function parseEx(raw: string): ExerciseEntry[] {
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
  catch { return raw.split('\n').filter(l => l.trim()).map(l => ({ k: 'text' as const, n: l })); }
}
function serializeEx(arr: ExerciseEntry[]): string {
  return arr.length ? JSON.stringify(arr) : '';
}
function normalizeSets(e: ExerciseEntry): Array<{ r: string; w: string }> {
  if (e.sets && Array.isArray(e.sets)) return e.sets;
  const count = parseInt(String(e.s ?? '1')) || 1;
  return Array.from({ length: count }, () => ({ r: String(e.r ?? '1'), w: String(e.w ?? '') }));
}
function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

/** Compare two serialised exercise lists by identity (kind + group + name),
 *  ignoring sets/reps/weight. Returns true if they represent the same workout. */
function isSameWorkout(jsonA: string, jsonB: string): boolean {
  const sig = (json: string) =>
    parseEx(json).map(e => `${e.k}|${e.g ?? ''}|${e.n ?? ''}`).join(',');
  return sig(jsonA) === sig(jsonB);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — FormatSets / SetBadge
// ─────────────────────────────────────────────────────────────────────────────
function FormatSets({ sets }: { sets: Array<{ r: string; w: string }> }) {
  if (!sets.length) return <span className="text-[var(--ink-3)]">—</span>;
  const n = sets.length;
  const allSameReps   = sets.every(s => s.r === sets[0].r);
  const allSameWeight = sets.every(s => s.w === sets[0].w);

  if (allSameReps && allSameWeight) {
    return (
      <span className="flex items-baseline gap-2">
        <span className="font-display tabular text-[22px] leading-none text-[var(--ink-0)]">
          {n}×{sets[0].r || '—'}
        </span>
        {sets[0].w && (
          <span className="font-mono text-[11px] text-[var(--accent)]">@ {sets[0].w}</span>
        )}
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      <span className="font-mono text-[9px] font-bold text-[var(--ink-3)] tracking-[1px] mr-1">{n} SETS</span>
      {sets.map((s, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 font-mono bg-[var(--bg-2)] border border-[var(--line)] rounded-sm px-2 py-0.5 whitespace-nowrap"
        >
          <span className="text-[9px] text-[var(--ink-3)]">{i + 1}</span>
          <span className="font-display text-[15px] leading-none text-[var(--ink-0)]">{s.r || '—'}</span>
          {s.w && <span className="text-[10px] text-[var(--accent)]">@{s.w}</span>}
        </span>
      ))}
    </span>
  );
}

function SetBadge({ sets, onSave }: {
  sets: Array<{ r: string; w: string }>;
  onSave: (updated: Array<{ r: string; w: string }>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editSets, setEditSets] = useState<Array<{ r: string; w: string }>>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const startEdit = () => {
    setEditSets(sets.map(s => ({ ...s })));
    setEditing(true);
    setTimeout(() => wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
  };
  const commit = useCallback(() => { onSave(editSets); setEditing(false); }, [editSets, onSave]);

  const updateSet = (i: number, field: 'r' | 'w', val: string) => {
    setEditSets(prev => { const next = [...prev]; next[i] = { ...next[i], [field]: val }; return next; });
  };

  if (editing) {
    return (
      <div
        ref={wrapRef}
        className="flex flex-col gap-1.5 p-2 bg-[var(--bg-2)] border border-[var(--accent)] rounded-sm"
        onBlur={e => { if (!wrapRef.current?.contains(e.relatedTarget as Node)) commit(); }}
      >
        {editSets.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--ink-3)] min-w-[14px] text-right">{i + 1}</span>
            <input
              autoFocus={i === 0}
              type="text" inputMode="numeric" value={s.r} placeholder="reps"
              className="w-12 rounded-sm px-1.5 py-1 font-mono text-[12px] bg-[var(--bg-1)] border border-[var(--line-2)] text-[var(--ink-0)] outline-none focus:border-[var(--accent)]"
              onChange={e => updateSet(i, 'r', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(); }}
              onFocus={e => { const el = e.target; setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350); }}
            />
            <span className="text-[var(--ink-3)] text-[11px]">@</span>
            <input
              type="text" inputMode="decimal" value={s.w} placeholder="wt"
              className="w-20 rounded-sm px-1.5 py-1 font-mono text-[12px] bg-[var(--bg-1)] border border-[var(--line-2)] text-[var(--ink-0)] outline-none focus:border-[var(--accent)]"
              onChange={e => updateSet(i, 'w', e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(); }}
              onFocus={e => { const el = e.target; setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350); }}
            />
          </div>
        ))}
        <button
          onMouseDown={e => { e.preventDefault(); commit(); }}
          className="flex items-center justify-center gap-1 font-mono text-[10px] font-bold text-[var(--accent)] mt-1 hover:text-[var(--accent-hi)] transition-colors tracking-[1px] uppercase"
        >
          <Check size={10} /> Save
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="inline-flex flex-wrap items-center gap-1.5 text-left cursor-pointer rounded-sm px-2.5 py-1.5 border border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--accent)] transition-all group"
      title="Click to edit sets"
    >
      <FormatSets sets={sets} />
      <Edit3 size={9} className="text-[var(--ink-3)] group-hover:text-[var(--accent)] ml-1" />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — ReorderableExerciseItem
// Drag handle (≡) → vertical reorder via Reorder.Item
// Swipe right     → reveals DELETE; release past 120px deletes the entry
// ─────────────────────────────────────────────────────────────────────────────
function ReorderableExerciseItem({
  entry, numIdx, onDelete, onUpdateName, onUpdateSets,
}: {
  entry: NormalizedLift; numIdx: number;
  onDelete: (idx: number) => void;
  onUpdateName: (idx: number, name: string) => void;
  onUpdateSets: (idx: number, sets: Array<{ r: string; w: string }>) => void;
}) {
  const dragControls  = useDragControls();
  const x             = useMotionValue(0);
  const deleteOpacity = useTransform(x, [40, 110], [0, 1]);

  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal]         = useState(entry.n ?? '');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const startNameEdit = () => {
    setNameVal(entry.n ?? ''); setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 10);
  };
  const commitName = () => {
    const v = nameVal.trim();
    if (v && v !== entry.n) onUpdateName(entry._idx, v);
    setEditingName(false);
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    if (info.offset.x > 120) {
      animate(x, 220, { duration: 0.18 }).then(() => onDelete(entry._idx));
    } else {
      animate(x, 0, { type: 'spring', stiffness: 400, damping: 35 });
    }
  };

  return (
    <Reorder.Item
      value={entry}
      dragListener={false}
      dragControls={dragControls}
      className="relative select-none"
      layout
    >
      {/* Delete indicator — revealed on swipe right */}
      <motion.div
        className="absolute inset-0 rounded border border-[var(--danger)]/40 bg-[var(--danger-12)] flex items-center justify-end pr-4 pointer-events-none"
        style={{ opacity: deleteOpacity }}
        aria-hidden
      >
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[2px] text-[var(--danger)] uppercase">
          <Trash2 size={13} /> Delete
        </span>
      </motion.div>

      {/* Swipeable card */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 160 }}
        dragElastic={{ left: 0, right: 0.05 }}
        dragMomentum={false}
        style={{ x, touchAction: 'pan-y' }}
        onDragEnd={handleDragEnd}
        className="group flex items-center gap-3 bg-[var(--bg-2)] border border-[var(--line)] rounded px-3 py-3 relative overflow-hidden z-10"
      >
        {/* Accent stripe */}
        <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--accent)] opacity-30 group-hover:opacity-100 transition-opacity" />

        {/* Reorder grip — touch here to drag vertically */}
        <div
          className="touch-none cursor-grab active:cursor-grabbing text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors flex-shrink-0"
          onPointerDown={e => { e.preventDefault(); dragControls.start(e); }}
        >
          <GripVertical size={15} />
        </div>

        <span className="font-display tabular text-[16px] leading-none text-[var(--ink-3)] min-w-[20px] text-right flex-shrink-0">
          {String(numIdx + 1).padStart(2, '0')}
        </span>

        {entry.k === 'lift' && entry.g && (
          <span className="font-mono text-[9px] font-bold tracking-[2px] text-[var(--accent)] uppercase flex-shrink-0 w-14 truncate">
            {entry.g}
          </span>
        )}

        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          {editingName ? (
            <input
              ref={nameInputRef} autoFocus type="text" value={nameVal}
              className="text-[14px] text-[var(--ink-0)] font-semibold bg-transparent border-b border-[var(--accent)] outline-none pb-0.5 w-full"
              onChange={e => setNameVal(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); nameInputRef.current?.blur(); }
                if (e.key === 'Escape') setEditingName(false);
              }}
            />
          ) : (
            <span
              onClick={startNameEdit}
              className="text-[14px] text-[var(--ink-0)] font-semibold cursor-text hover:text-[var(--accent)] transition-colors truncate"
            >
              {entry.n ?? entry.k}
            </span>
          )}

          {entry.k === 'lift' && entry.sets && (
            <SetBadge sets={entry.sets} onSave={updated => onUpdateSets(entry._idx, updated)} />
          )}
        </div>

        {/* Desktop-only X button (hover reveals) */}
        <button
          onClick={() => onDelete(entry._idx)}
          className="flex-shrink-0 w-8 h-8 hidden md:flex items-center justify-center rounded text-transparent group-hover:text-[var(--ink-2)] hover:!text-[var(--danger)] hover:bg-[var(--danger-12)] transition-all"
          title="Remove"
        >
          <X size={15} />
        </button>
      </motion.div>
    </Reorder.Item>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — CardioEntryCard
// ─────────────────────────────────────────────────────────────────────────────
function CardioEntryCard({
  entry, onDelete, onUpdateField,
}: {
  entry: CardioItem;
  onDelete: (idx: number) => void;
  onUpdateField: (idx: number, field: 'v1' | 'v2' | 'note', val: string) => void;
}) {
  const cfg = CARDIO_CFG[entry.k];
  return (
    <div className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-4 py-4 relative overflow-hidden">
      <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-[var(--accent)]" />

      <div className="flex items-center gap-3 mb-4">
        <span className="font-mono text-[10px] font-bold tracking-[2px] text-[var(--accent)] uppercase">{cfg.code}</span>
        <span className="text-[14px] font-semibold text-[var(--ink-0)] flex-1">{cfg.label}</span>
        <button
          onClick={() => onDelete(entry._idx)}
          className="w-7 h-7 flex items-center justify-center rounded text-[var(--ink-3)] hover:text-[var(--danger)] hover:bg-[var(--danger-12)] transition-all"
        >
          <X size={15} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="que-label">{cfg.f1}</label>
          <input
            type="text" inputMode={cfg.f1mode as React.HTMLAttributes<HTMLInputElement>['inputMode']}
            className="que-input" value={entry.v1 ?? ''} placeholder={cfg.f1ph}
            onChange={e => onUpdateField(entry._idx, 'v1', e.target.value)}
          />
        </div>
        <div>
          <label className="que-label">{cfg.f2}</label>
          <input
            type="text" inputMode={cfg.f2mode as React.HTMLAttributes<HTMLInputElement>['inputMode']}
            className="que-input" value={entry.v2 ?? ''} placeholder={cfg.f2ph}
            onChange={e => onUpdateField(entry._idx, 'v2', e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="que-label">Notes</label>
        <input type="text" className="que-input" value={entry.note ?? ''} placeholder={cfg.notePh}
          onChange={e => onUpdateField(entry._idx, 'note', e.target.value)} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — PresetModal
// ─────────────────────────────────────────────────────────────────────────────
function PresetModal({
  open, presets, currentCount, onLoad, onClose,
}: {
  open: boolean; presets: WorkoutPreset[];
  currentCount: number;
  onLoad: (preset: WorkoutPreset, replace: boolean) => void;
  onClose: () => void;
}) {
  const [pending, setPending] = React.useState<WorkoutPreset | null>(null);

  // Reset pending choice whenever the modal closes
  React.useEffect(() => { if (!open) setPending(null); }, [open]);

  function handleSelect(preset: WorkoutPreset) {
    if (currentCount > 0) {
      setPending(preset); // show the merge-or-replace screen
    } else {
      onLoad(preset, false);
      onClose();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start md:items-center justify-center backdrop-blur-sm pt-[60px] md:pt-0 px-3 md:px-0"
          style={{ background: 'rgba(7,8,10,0.85)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="w-full md:max-w-[600px] max-h-[calc(100dvh-68px)] md:max-h-[88vh] overflow-y-auto rounded-lg border border-[var(--line-2)] bg-[var(--bg-1)] p-4 md:p-6"
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.6)' }}
          >
            {pending ? (
              /* ── Merge-or-replace screen ── */
              <>
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-mono text-[9px] font-bold tracking-[3px] text-[var(--ink-3)] uppercase mb-1">
                      Session In Progress
                    </p>
                    <p className="font-display text-[18px] md:text-[22px] tracking-[2px] uppercase text-[var(--ink-0)] leading-none truncate max-w-[220px] md:max-w-none">
                      {pending.name}
                    </p>
                  </div>
                  <button onClick={onClose} className="text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors p-1.5 flex-shrink-0 ml-3 -mt-1">
                    <X size={20} />
                  </button>
                </div>

                {/* Context line */}
                <p className="font-mono text-[10px] text-[var(--ink-2)] tracking-[0.5px] mb-4 pb-4 border-b border-[var(--line)]">
                  You have{' '}
                  <span className="text-[var(--ink-0)] font-bold">
                    {currentCount} exercise{currentCount !== 1 ? 's' : ''}
                  </span>{' '}
                  logged — how do you want to load this?
                </p>

                {/* Side-by-side action cards */}
                <div className="grid grid-cols-2 gap-2.5 mb-4">
                  <button
                    onClick={() => { onLoad(pending, false); onClose(); }}
                    className="group flex flex-col gap-3 rounded border border-[var(--line-2)] bg-[var(--bg-2)] p-3 md:p-4 text-left hover:border-[var(--accent)] active:bg-[var(--accent-12)] transition-all min-h-[120px]"
                  >
                    <span
                      className="block w-8 h-[2px] bg-[var(--accent)] rounded-full flex-shrink-0"
                      style={{ boxShadow: '0 0 6px var(--accent-40)' }}
                    />
                    <div>
                      <p className="font-display text-[15px] md:text-[16px] tracking-[1px] uppercase text-[var(--ink-0)] group-hover:text-[var(--accent)] transition-colors leading-tight mb-1.5">
                        Add On Top
                      </p>
                      <p className="font-mono text-[9px] text-[var(--ink-2)] tracking-[0.3px] leading-[1.5]">
                        Keep current &amp; stack preset below
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => { onLoad(pending, true); onClose(); }}
                    className="group flex flex-col gap-3 rounded border border-[var(--line-2)] bg-[var(--bg-2)] p-3 md:p-4 text-left hover:border-[var(--warn)] active:bg-[var(--bg-3)] transition-all min-h-[120px]"
                  >
                    <span className="block w-8 h-[2px] bg-[var(--warn)] rounded-full flex-shrink-0" />
                    <div>
                      <p className="font-display text-[15px] md:text-[16px] tracking-[1px] uppercase text-[var(--ink-0)] group-hover:text-[var(--warn)] transition-colors leading-tight mb-1.5">
                        Start Fresh
                      </p>
                      <p className="font-mono text-[9px] text-[var(--ink-2)] tracking-[0.3px] leading-[1.5]">
                        Clear session, load preset only
                      </p>
                    </div>
                  </button>
                </div>

                <button
                  onClick={() => setPending(null)}
                  className="que-btn-ghost w-full"
                >
                  ← Back to Presets
                </button>
              </>
            ) : (
              /* ── Preset list ── */
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-display text-[22px] md:text-[28px] tracking-[2px] uppercase text-[var(--ink-0)]">Load Preset</h3>
                  <button onClick={onClose} className="text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors p-1">
                    <X size={20} />
                  </button>
                </div>

                {presets.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-[var(--line-2)] rounded">
                    <p className="font-mono text-[11px] tracking-[1px] text-[var(--ink-3)] uppercase">No presets saved yet</p>
                    <p className="font-mono text-[10px] text-[var(--ink-3)] mt-1.5 tracking-[0.5px]">Log a workout and hit "Save as Preset"</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {presets.map(preset => {
                      const entries = parseEx(preset.exercises);
                      const lifts   = entries.filter(e => e.k === 'lift' || e.k === 'text');
                      const cardios = entries.filter(e => ['run','bike','swim'].includes(e.k));
                      const names   = lifts.slice(0, 3).map(e => e.n ?? e.k);
                      const more    = lifts.length - names.length;
                      return (
                        <button
                          key={preset.id}
                          onClick={() => handleSelect(preset)}
                          className="text-left rounded border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2.5 md:px-4 md:py-3 hover:border-[var(--accent)] hover:bg-[var(--bg-3)] transition-all group"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="font-display text-[14px] md:text-[16px] tracking-[1px] uppercase text-[var(--ink-0)] group-hover:text-[var(--accent)] transition-colors truncate">
                              {preset.name}
                            </p>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {lifts.length > 0 && (
                                <span className="font-mono text-[9px] font-bold tracking-[1px] text-[var(--accent-ink)] bg-[var(--accent)] px-1.5 py-0.5 rounded-sm uppercase">
                                  {lifts.length} EX
                                </span>
                              )}
                              {cardios.length > 0 && (
                                <span className="font-mono text-[9px] font-bold tracking-[1px] text-[var(--ink-0)] bg-[var(--bg-3)] border border-[var(--line-2)] px-1.5 py-0.5 rounded-sm uppercase">
                                  {cardios.length} CARDIO
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="font-mono text-[9px] md:text-[10px] text-[var(--ink-2)] tracking-[0.5px] truncate">
                            {names.join(' · ')}{more > 0 ? ` · +${more} more` : ''}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                <button onClick={onClose} className="que-btn-ghost mt-3 w-full">CANCEL</button>
              </>
            )}
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
  open, swm, lifts, dupWarning, onClose, onSave,
  onChangeName, onTogglePreset, onToggleRecurring,
  onToggleDay, onSetFreq,
}: {
  open: boolean; swm: SwmState; lifts: NormalizedLift[];
  dupWarning: boolean;
  onClose: () => void; onSave: () => void;
  onChangeName: (v: string) => void;
  onTogglePreset: () => void;
  onToggleRecurring: () => void;
  onToggleDay: (d: number) => void;
  onSetFreq: (n: 1 | 2) => void;
}) {
  const Toggle = ({ on }: { on: boolean }) => (
    <div className={`relative w-[40px] h-[22px] rounded-sm border transition-all flex-shrink-0 ${
      on ? 'bg-[var(--accent)] border-[var(--accent)]' : 'bg-[var(--bg-2)] border-[var(--line-2)]'
    }`}>
      <span className={`absolute top-[2px] w-4 h-4 rounded-sm transition-all ${
        on ? 'left-[20px] bg-[var(--accent-ink)]' : 'left-[2px] bg-[var(--ink-2)]'
      }`} />
    </div>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start md:items-center justify-center backdrop-blur-sm pt-[60px] md:pt-0 px-3 md:px-0"
          style={{ background: 'rgba(7,8,10,0.85)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="w-full md:max-w-[600px] max-h-[calc(100dvh-68px)] md:max-h-[88vh] overflow-y-auto rounded-lg border border-[var(--line-2)] bg-[var(--bg-1)] p-4 md:p-6"
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.6)' }}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display text-[22px] md:text-[28px] tracking-[2px] uppercase text-[var(--ink-0)]">Save Workout</h3>
              <button onClick={onClose} className="text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors p-1">
                <X size={20} />
              </button>
            </div>

            <div className="mb-4">
              <label className="que-label">Workout Name</label>
              <input
                autoFocus type="text" className="que-input"
                value={swm.name} placeholder="e.g. Chest Day"
                onChange={e => onChangeName(e.target.value)}
              />
              {dupWarning && (
                <div className="mt-2 flex items-center gap-2 rounded border border-[var(--danger)] bg-[var(--danger-12)] px-3 py-2">
                  <span className="font-mono text-[11px] font-bold text-[var(--danger)] tracking-[0.5px]">
                    Preset Already Saved — this exact workout is already in your presets
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col divide-y divide-[var(--line)]">
              <button onClick={onTogglePreset} className="flex items-center gap-3 py-3 hover:opacity-90 transition-opacity text-left w-full">
                <div className="flex-1">
                  <p className="text-[13px] md:text-[14px] font-semibold text-[var(--ink-0)]">Save to Presets</p>
                  <p className="font-mono text-[10px] text-[var(--ink-2)] mt-0.5 tracking-[0.5px]">load this workout from the preset picker</p>
                </div>
                <Toggle on={swm.isPreset} />
              </button>

              <button onClick={onToggleRecurring} className="flex items-center gap-3 py-3 hover:opacity-90 transition-opacity text-left w-full">
                <div className="flex-1">
                  <p className="text-[13px] md:text-[14px] font-semibold text-[var(--ink-0)]">Recurring Schedule</p>
                  <p className="font-mono text-[10px] text-[var(--ink-2)] mt-0.5 tracking-[0.5px]">auto-suggest on selected days</p>
                </div>
                <Toggle on={swm.isRecurring} />
              </button>
            </div>

            {swm.isRecurring && (
              <div className="mt-3 p-3 bg-[var(--bg-2)] rounded border border-[var(--line)]">
                <p className="que-label mb-2">Days of Week</p>
                <div className="grid grid-cols-7 gap-1 mb-3">
                  {DAY_LABELS.map((d, i) => (
                    <button
                      key={d} onClick={() => onToggleDay(i)}
                      className={[
                        'py-2 rounded-sm font-mono text-[9px] md:text-[10px] font-bold tracking-[0.5px] border transition-all text-center',
                        swm.days.includes(i)
                          ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-ink)]'
                          : 'bg-[var(--bg-1)] border-[var(--line-2)] text-[var(--ink-2)] hover:text-[var(--ink-0)]',
                      ].join(' ')}
                    >
                      {d.slice(0, 2)}
                    </button>
                  ))}
                </div>

                <p className="que-label mb-2">Frequency</p>
                <div className="flex gap-2">
                  {([1, 2] as const).map(n => (
                    <button
                      key={n} onClick={() => onSetFreq(n)}
                      className={[
                        'flex-1 py-2 rounded-sm font-mono text-[10px] md:text-[11px] font-bold tracking-[1px] border transition-all uppercase',
                        swm.freq === n
                          ? 'bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-ink)]'
                          : 'bg-[var(--bg-1)] border-[var(--line-2)] text-[var(--ink-2)] hover:text-[var(--ink-0)]',
                      ].join(' ')}
                    >
                      {n === 1 ? 'Weekly' : 'Bi-weekly'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={onSave}
              disabled={!swm.name.trim() || lifts.length === 0}
              className="que-btn-primary mt-4 w-full"
            >
              SAVE WORKOUT
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
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
    getWorkoutPresets, saveWorkoutPresets,
    isLoaded,
  } = useApp();

  const [exercises, setExercisesRaw] = useState<ExerciseEntry[]>([]);
  const [notes, setNotesRaw] = useState('');
  const [selectedEx, setSelectedEx] = useState('');
  const [isCustomEx, setIsCustomEx] = useState(false);
  const [customName, setCustomName] = useState('');
  const [saveFlash, setSaveFlash] = useState(false);
  const [loggedFlash, setLoggedFlash] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [saveModal, setSaveModal] = useState(false);
  const [recurringPreset, setRecurringPreset] = useState<WorkoutPreset | null>(null);
  const [swm, setSwm] = useState<SwmState>({ name: '', isPreset: true, isRecurring: false, days: [], freq: 1 });
  const [dupWarning, setDupWarning] = useState(false);
  const [activeSection, setActiveSection] = useState<'lifting' | 'cardio'>('lifting');
  const [confirmClear, setConfirmClear] = useState(false);

  // Stable keys for Reorder (parallel to exercises array, never derived)
  const exerciseKeysRef = useRef<string[]>([]);
  const keyCounterRef   = useRef(0);
  const nextKey = useCallback(() => `k${++keyCounterRef.current}`, []);

  const pillsRowRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ dragging: false, startX: 0, scrollLeft: 0, moved: false });
  const repsRefs = useRef<Array<HTMLInputElement | null>>([]);
  const weightRefs = useRef<Array<HTMLInputElement | null>>([]);
  const notesFlashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── persist & derive
  const persistExercises = useCallback(
    (arr: ExerciseEntry[], notesTxt = notes) => {
      const raw   = serializeEx(arr);
      const runs  = arr.filter(e => e.k === 'run');
      const bikes = arr.filter(e => e.k === 'bike');
      const swims = arr.filter(e => e.k === 'swim');
      updateDayRecord(activeDayFocus, {
        exercises: raw, notes: notesTxt,
        runDist:   runs.reduce((s, e)  => s + (parseFloat(e.v1 ?? '0') || 0), 0),
        runTime:   runs.reduce((s, e)  => s + (parseFloat(e.v2 ?? '0') || 0), 0),
        bikeDist:  bikes.reduce((s, e) => s + (parseFloat(e.v1 ?? '0') || 0), 0),
        bikeTime:  bikes.reduce((s, e) => s + (parseFloat(e.v2 ?? '0') || 0), 0),
        swimTime:  swims.reduce((s, e) => s + (parseFloat(e.v1 ?? '0') || 0), 0),
      });
      setSaveFlash(true);
      if (notesFlashRef.current) clearTimeout(notesFlashRef.current);
      notesFlashRef.current = setTimeout(() => setSaveFlash(false), 2000);
    },
    [activeDayFocus, notes, updateDayRecord]
  );
  const setExercises = useCallback((arr: ExerciseEntry[]) => {
    setExercisesRaw(arr); persistExercises(arr);
  }, [persistExercises]);

  useEffect(() => {
    const rec    = localDB[activeDayFocus] ?? {};
    const loaded = parseEx(rec.exercises ?? '');
    setExercisesRaw(loaded);
    exerciseKeysRef.current = loaded.map(() => nextKey());
    setNotesRaw(rec.notes ?? '');
    const dow = new Date(activeDayFocus + 'T00:00:00').getDay();
    const all = getWorkoutPresets();
    const match = all.find(p => p.isRecurring && p.daysOfWeek.includes(dow));
    const hasLifts = parseEx(rec.exercises ?? '').some(e => e.k === 'lift');
    setRecurringPreset(match && !hasLifts ? match : null);
  }, [activeDayFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  const lifts = useMemo<NormalizedLift[]>(() =>
    exercises
      .map((e, i) => ({ ...e, sets: normalizeSets(e), _idx: i, _key: exerciseKeysRef.current[i] ?? `fallback-${i}` }))
      .filter(e => e.k === 'lift' || e.k === 'text') as NormalizedLift[],
    [exercises]
  );
  const cardios = useMemo<CardioItem[]>(() =>
    exercises.map((e, i) => ({ ...e, _idx: i }))
      .filter(e => ['run','bike','swim'].includes(e.k)) as CardioItem[],
    [exercises]
  );

  const exerciseOptions = useMemo(() => {
    const presets = PRESETS[currentGroup as keyof typeof PRESETS] ?? [];
    // Only read localStorage after hydration — prevents server/client mismatch
    if (!isLoaded) return presets;
    const usage = getUsage()[currentGroup] ?? {};
    const usedNames = Object.keys(usage).sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0));
    const unusedPresets = presets.filter(e => !usage[e]);
    return [...usedNames, ...unusedPresets];
  }, [currentGroup, getUsage, isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedEx(exerciseOptions[0] ?? '');
    setIsCustomEx(false); setCustomName('');
  }, [currentGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── pill drag
  const onPillsMouseDown = useCallback((e: React.MouseEvent) => {
    const row = pillsRowRef.current; if (!row) return;
    dragState.current = { dragging: true, startX: e.pageX, scrollLeft: row.scrollLeft, moved: false };
    row.style.cursor = 'grabbing'; row.style.userSelect = 'none';
  }, []);
  const onPillsMouseMove = useCallback((e: React.MouseEvent) => {
    const row = pillsRowRef.current; if (!row || !dragState.current.dragging) return;
    const dx = e.pageX - dragState.current.startX;
    if (Math.abs(dx) > 3) dragState.current.moved = true;
    if (dragState.current.moved) row.scrollLeft = dragState.current.scrollLeft - dx;
  }, []);
  const onPillsMouseUp = useCallback(() => {
    const row = pillsRowRef.current; if (!row) return;
    dragState.current.dragging = false;
    row.style.cursor = 'grab'; row.style.userSelect = '';
  }, []);
  const onPillsWheel = useCallback((e: React.WheelEvent) => {
    const row = pillsRowRef.current; if (!row) return;
    e.preventDefault();
    row.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
  }, []);
  const handlePillClick = useCallback((g: string, e: React.MouseEvent) => {
    if (dragState.current.moved) { e.stopPropagation(); dragState.current.moved = false; return; }
    setCurrentGroup(g);
    const pill = pillsRowRef.current?.querySelector(`[data-group="${g}"]`) as HTMLElement | null;
    pill?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [setCurrentGroup]);

  // ── sets form
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
    setPendingSetData(prev => { const next = [...prev]; next[i] = { ...next[i], [field]: val }; return next; });
  }, [setPendingSetData]);

  const handleRepsKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Enter') { e.preventDefault(); weightRefs.current[idx]?.focus(); }
  }, []);

  const commitLift = useCallback(() => {
    const name = isCustomEx ? customName.trim() : selectedEx;
    if (!name || name === '__custom__') return;
    const snappedSets = pendingSetData.map((s, i) => ({
      r: repsRefs.current[i]?.value.trim()   || s.r || '1',
      w: weightRefs.current[i]?.value.trim() || s.w || '',
    }));
    bumpUsage(currentGroup, name);
    const next = [...exercises, { k: 'lift' as const, g: currentGroup, n: name, sets: snappedSets }];
    exerciseKeysRef.current = [...exerciseKeysRef.current, nextKey()];
    setExercisesRaw(next);
    setPendingSetData(Array.from({ length: pendingSetsCount }, () => ({ r: '1', w: '' })));
    if (isCustomEx) setCustomName('');
  }, [
    isCustomEx, customName, selectedEx, pendingSetData,
    currentGroup, exercises, pendingSetsCount,
    bumpUsage, setPendingSetData,
  ]);

  const handleWeightKeyDown = useCallback((e: React.KeyboardEvent, idx: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (idx < pendingSetsCount - 1) repsRefs.current[idx + 1]?.focus();
    else commitLift();
  }, [pendingSetsCount, commitLift]);

  const addCardioEntry = useCallback((kind: CardioKind) => {
    exerciseKeysRef.current = [...exerciseKeysRef.current, nextKey()];
    setExercisesRaw([...exercises, { k: kind, v1: '', v2: '', note: '' }]);
  }, [exercises, nextKey]);

  const deleteEntry = useCallback((idx: number) => {
    exerciseKeysRef.current = exerciseKeysRef.current.filter((_, i) => i !== idx);
    setExercises(exercises.filter((_, i) => i !== idx));
  }, [exercises, setExercises]);

  const updateCardioField = useCallback(
    (idx: number, field: 'v1' | 'v2' | 'note', val: string) => {
      setExercisesRaw(exercises.map((e, i) => i === idx ? { ...e, [field]: val } : e));
    },
    [exercises]
  );

  const updateExerciseName = useCallback((idx: number, name: string) => {
    setExercisesRaw(exercises.map((e, i) => i === idx ? { ...e, n: name } : e));
  }, [exercises]);

  const updateExerciseSets = useCallback((idx: number, sets: Array<{ r: string; w: string }>) => {
    setExercisesRaw(exercises.map((e, i) => i === idx ? { ...e, sets } : e));
  }, [exercises]);

  const clearWorkout = useCallback(() => {
    exerciseKeysRef.current = [];
    setExercisesRaw([]); setNotesRaw('');
    updateDayRecord(activeDayFocus, {
      exercises: '', notes: '', steps: 0,
      runDist: 0, runTime: 0, bikeDist: 0, bikeTime: 0, swimTime: 0, burn: 0,
    });
  }, [activeDayFocus, updateDayRecord]);

  const handleLiftReorder = useCallback((reorderedLifts: NormalizedLift[]) => {
    const cardios    = exercises.filter(e => ['run','bike','swim'].includes(e.k));
    const cardioKeys = exercises
      .map((e, i) => (['run','bike','swim'].includes(e.k) ? exerciseKeysRef.current[i] ?? nextKey() : null))
      .filter(Boolean) as string[];
    const liftEntries: ExerciseEntry[] = reorderedLifts.map(({ _idx, _key, ...rest }) => rest as ExerciseEntry);
    const liftKeys = reorderedLifts.map(l => l._key);
    exerciseKeysRef.current = [...liftKeys, ...cardioKeys];
    setExercisesRaw([...liftEntries, ...cardios]);
  }, [exercises, nextKey]);

  const logWorkout = useCallback(() => {
    persistExercises(exercises, notes);
    setLoggedFlash(true);
    setTimeout(() => setLoggedFlash(false), 2200);
  }, [exercises, notes, persistExercises]);

  const loadPreset = useCallback((preset: WorkoutPreset, replace: boolean) => {
    const incoming = parseEx(preset.exercises);
    const next     = replace ? incoming : [...exercises, ...incoming];
    const inKeys   = incoming.map(() => nextKey());
    exerciseKeysRef.current = replace
      ? inKeys
      : [...exerciseKeysRef.current, ...inKeys];
    setExercises(next);
  }, [exercises, setExercises, nextKey]);

  const [presets, setPresets] = useState<WorkoutPreset[]>([]);
  useEffect(() => {
    if (templateModal) setPresets(getWorkoutPresets());
  }, [templateModal]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadRecurringWorkout = useCallback((preset: WorkoutPreset) => {
    const newEntries = parseEx(preset.exercises);
    exerciseKeysRef.current = [...exerciseKeysRef.current, ...newEntries.map(() => nextKey())];
    setExercisesRaw([...exercises, ...newEntries]);
    setRecurringPreset(null);
  }, [exercises, nextKey]);

  const openSaveModal = useCallback(() => {
    const groups = [...new Set(lifts.map(e => e.g ?? 'other'))];
    const autoName = groups.map(capitalize).join(' + ') + ' Workout';
    setSwm({ name: autoName, isPreset: true, isRecurring: false, days: [], freq: 1 });
    setDupWarning(false);
    setSaveModal(true);
  }, [lifts]);

  const confirmSave = useCallback(() => {
    const baseName = swm.name.trim();
    if (!baseName || lifts.length === 0) return;

    const existing   = getWorkoutPresets();
    const currentEx  = JSON.stringify(lifts.map(({ _idx: _, ...e }) => e));

    // Block if the exact same exercises are already saved (content duplicate)
    if (existing.some(p => isSameWorkout(p.exercises, currentEx))) {
      setDupWarning(true);
      return;
    }
    setDupWarning(false);

    // If the name is taken (but exercises differ), auto-version: "Name v2", "Name v3", …
    let finalName = baseName;
    if (existing.some(p => p.name.toLowerCase() === baseName.toLowerCase())) {
      let v = 2;
      while (existing.some(p => p.name.toLowerCase() === `${baseName} v${v}`.toLowerCase())) {
        v++;
      }
      finalName = `${baseName} v${v}`;
    }

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const preset: WorkoutPreset = {
      id, name: finalName,
      exercises:   currentEx,
      isRecurring: swm.isRecurring,
      daysOfWeek:  swm.isRecurring ? [...swm.days] : [],
      everyNWeeks: swm.freq,
      createdAt:   activeDayFocus,
    };
    saveWorkoutPresets([...existing, preset]);
    setSaveModal(false);
  }, [swm, lifts, activeDayFocus, getWorkoutPresets, saveWorkoutPresets]);

  const handleNotesChange = useCallback((val: string) => {
    setNotesRaw(val); persistExercises(exercises, val);
  }, [exercises, persistExercises]);

  // ── render
  const isTodayFocus = activeDayFocus === todayStr;
  const spotlight = useSpotlightBorder({ color: '79,195,247', size: 280, opacity: 0.45 });

  const today2   = new Date();
  const d        = new Date(activeDayFocus + 'T00:00:00');
  const todayMid = new Date(today2.getFullYear(), today2.getMonth(), today2.getDate());
  const diff     = Math.round((todayMid.getTime() - d.getTime()) / 86400000);
  const dayLabel = diff === 0 ? 'TODAY' : diff === 1 ? 'YESTERDAY'
    : `${['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;

  return (
    <>
      <PresetModal
        open={templateModal} presets={presets}
        currentCount={exercises.length}
        onLoad={loadPreset} onClose={() => setTemplateModal(false)}
      />

      {/* ── Clear session confirm ── */}
      <AnimatePresence>
        {confirmClear && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-5 backdrop-blur-sm"
            style={{ background: 'rgba(7,8,10,0.85)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={e => { if (e.target === e.currentTarget) setConfirmClear(false); }}
          >
            <motion.div
              className="w-full max-w-[320px] rounded-lg border border-[var(--line-2)] bg-[var(--bg-1)] p-5"
              initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 12 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              style={{ boxShadow: '0 0 0 1px var(--line-2), 0 24px 48px rgba(0,0,0,0.55)' }}
            >
              <p className="font-display text-[20px] tracking-[1px] uppercase text-[var(--ink-0)] mb-1">
                Clear Session
              </p>
              <p className="font-mono text-[11px] text-[var(--ink-2)] tracking-[0.3px] leading-relaxed mb-5">
                This will remove all exercises and cardio logged for this day.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmClear(false)}
                  className="flex-1 que-btn-ghost"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setConfirmClear(false); clearWorkout(); }}
                  className="flex-1 py-2.5 rounded font-mono text-[11px] font-bold tracking-[1.5px] uppercase border border-[var(--danger)]/50 bg-[var(--danger-12)] text-[var(--danger)] hover:border-[var(--danger)] transition-all"
                >
                  Clear
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <SaveWorkoutModal
        open={saveModal} swm={swm} lifts={lifts}
        dupWarning={dupWarning}
        onClose={() => setSaveModal(false)}
        onSave={confirmSave}
        onChangeName={v => { setDupWarning(false); setSwm(s => ({ ...s, name: v })); }}
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

      {/* ── Workout Log Card ── */}
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

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h2 className="que-section-label"><span className="dot" />WORKOUT LOG</h2>
              <span className={`flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[1.5px] uppercase text-[var(--positive)] transition-opacity duration-300 ${saveFlash ? 'opacity-100' : 'opacity-0'}`}>
                <Check size={11} /> Saved
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[10px] font-bold tracking-[1.5px] text-[var(--accent)] bg-[var(--accent-12)] border border-[var(--accent)] rounded-sm px-3 py-1">
                {dayLabel}
              </span>
              <button
                onClick={() => setConfirmClear(true)}
                title="Clear this day's workout"
                className="w-8 h-8 flex items-center justify-center rounded bg-[var(--danger-12)] border border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger)]/20 hover:border-[var(--danger)] transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Template loader */}
          <button
            onClick={() => setTemplateModal(true)}
            className="w-full flex items-center justify-center gap-2.5 mb-5 px-4 py-3 rounded border border-dashed border-[var(--line-2)] bg-[var(--bg-2)] font-mono text-[11px] font-bold tracking-[2px] uppercase text-[var(--ink-1)] hover:bg-[var(--bg-3)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
          >
            <Layers size={14} /> Load Preset
          </button>

          {/* ── SECTION TABS ── */}
          <div className="flex mb-5 border-b border-[var(--line)]">
            {(['lifting', 'cardio'] as const).map(sec => {
              const count = sec === 'lifting' ? lifts.length : cardios.length;
              const active = activeSection === sec;
              return (
                <button
                  key={sec}
                  onClick={() => setActiveSection(sec)}
                  className={[
                    'flex-1 flex items-center justify-center gap-2 py-2.5 font-mono text-[10px] font-bold tracking-[2px] uppercase transition-colors relative',
                    active ? 'text-[var(--accent)]' : 'text-[var(--ink-3)] hover:text-[var(--ink-1)]',
                  ].join(' ')}
                >
                  {sec}
                  {count > 0 && (
                    <span className={[
                      'font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-sm',
                      active
                        ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                        : 'bg-[var(--bg-3)] text-[var(--ink-2)]',
                    ].join(' ')}>
                      {count}
                    </span>
                  )}
                  {active && (
                    <span
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-[var(--accent)] rounded-t-sm"
                      style={{ boxShadow: '0 0 6px var(--accent-40)' }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── LIFTING TAB ── */}
          {activeSection === 'lifting' && <div className="mb-4">

            {/* Pills */}
            <div className="relative mb-4">
              <span className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-r from-transparent to-[var(--bg-1)] pointer-events-none z-10" />
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
                    key={g} data-group={g}
                    onClick={e => handlePillClick(g, e)}
                    data-active={currentGroup === g}
                    className="que-pill flex-shrink-0"
                  >
                    {g.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Add Lift Form */}
            <div className="bg-[var(--bg-2)] border border-[var(--line)] rounded p-4 mb-3.5">
              <div className="mb-3">
                {isCustomEx ? (
                  <input
                    autoFocus type="text" className="que-input"
                    value={customName} placeholder="Type exercise name…"
                    onChange={e => setCustomName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitLift(); } }}
                  />
                ) : (
                  <div className="relative">
                    <select
                      className="que-input pr-9 cursor-pointer"
                      value={selectedEx}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setIsCustomEx(true); setSelectedEx('');
                        } else setSelectedEx(e.target.value);
                      }}
                    >
                      {exerciseOptions.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                      <option value="__custom__">+ Custom exercise…</option>
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-2)] pointer-events-none" />
                  </div>
                )}
                {isCustomEx && (
                  <button
                    onClick={() => { setIsCustomEx(false); setCustomName(''); }}
                    className="mt-2 font-mono text-[10px] text-[var(--ink-3)] hover:text-[var(--accent)] transition-colors tracking-[1px] uppercase"
                  >
                    ← back to presets
                  </button>
                )}
              </div>

              {/* Sets stepper */}
              <div className="flex items-center gap-3 mb-3">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[2px] text-[var(--ink-2)]">SETS</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjustSets(-1)}
                    className="w-8 h-8 flex items-center justify-center rounded-sm border border-[var(--line-2)] bg-[var(--bg-1)] text-[var(--ink-0)] text-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                  >−</button>
                  <span className="font-display tabular text-[22px] text-[var(--accent)] min-w-[28px] text-center leading-none">
                    {String(pendingSetsCount).padStart(2, '0')}
                  </span>
                  <button
                    onClick={() => adjustSets(1)}
                    className="w-8 h-8 flex items-center justify-center rounded-sm border border-[var(--line-2)] bg-[var(--bg-1)] text-[var(--ink-0)] text-lg hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
                  >+</button>
                </div>
              </div>

              {/* Set rows */}
              <div className="mb-3">
                <div className="grid grid-cols-[28px_1fr_1.6fr] gap-2 mb-2">
                  <span />
                  <span className="que-label !mb-0">Reps</span>
                  <span className="que-label !mb-0">Weight <span className="normal-case font-normal text-[var(--ink-3)]">(opt)</span></span>
                </div>

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
                        <span className="font-display tabular text-[16px] text-[var(--ink-3)] text-right leading-none">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <input
                          ref={el => { repsRefs.current[i] = el; }}
                          type="number" min="1" inputMode="numeric"
                          value={set.r} placeholder="1"
                          className="que-input text-center font-display text-[18px] py-2 [appearance:textfield]"
                          style={{ MozAppearance: 'textfield' } as React.CSSProperties}
                          onChange={e => updatePendingSet(i, 'r', e.target.value)}
                          onFocus={e => e.target.select()}
                          onKeyDown={e => handleRepsKeyDown(e, i)}
                        />
                        <input
                          ref={el => { weightRefs.current[i] = el; }}
                          type="text" inputMode="decimal"
                          value={set.w} placeholder="e.g. 135 lbs"
                          className="que-input py-2 font-mono text-[14px] font-bold"
                          onChange={e => updatePendingSet(i, 'w', e.target.value)}
                          onFocus={e => e.target.select()}
                          onKeyDown={e => handleWeightKeyDown(e, i)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <button onClick={commitLift} className="que-btn-primary w-full">
                <Plus size={14} /> LOG EXERCISE
              </button>
            </div>

            {/* Recurring banner */}
            {recurringPreset && (
              <div className="flex items-center justify-between gap-3 bg-[var(--accent-12)] border border-[var(--accent)] rounded px-4 py-3 mb-3">
                <p className="font-mono text-[11px] text-[var(--ink-1)] flex-1 tracking-[0.5px]">
                  <span className="text-[var(--accent)] font-bold uppercase tracking-[1.5px]">RECURRING ·</span>{' '}
                  <strong className="text-[var(--ink-0)]">{recurringPreset.name}</strong>
                </p>
                <button
                  onClick={() => loadRecurringWorkout(recurringPreset)}
                  className="flex-shrink-0 que-btn-primary !py-2 !px-4 !text-[10px]"
                >
                  LOAD
                </button>
              </div>
            )}

            {/* Logged list */}
            {lifts.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-[var(--line-2)] rounded">
                <p className="font-mono text-[10px] tracking-[1px] text-[var(--ink-3)] uppercase">
                  No exercises · Pick a group, log sets &amp; hit commit
                </p>
              </div>
            ) : (
              <>
                <p className="font-mono text-[9px] text-[var(--ink-3)] tracking-[1px] uppercase mb-1 md:hidden">
                  Hold ≡ to reorder · Swipe right to delete
                </p>
                <Reorder.Group
                  as="div"
                  axis="y"
                  values={lifts}
                  onReorder={handleLiftReorder}
                  className="flex flex-col gap-2"
                >
                  {lifts.map((entry, numIdx) => (
                    <ReorderableExerciseItem
                      key={entry._key}
                      entry={entry}
                      numIdx={numIdx}
                      onDelete={deleteEntry}
                      onUpdateName={updateExerciseName}
                      onUpdateSets={updateExerciseSets}
                    />
                  ))}
                </Reorder.Group>
              </>
            )}

            {lifts.length > 0 && (
              <button
                onClick={openSaveModal}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded border border-dashed border-[var(--line-2)] font-mono text-[10px] font-bold tracking-[2px] uppercase text-[var(--ink-2)] hover:border-[var(--accent)] hover:text-[var(--accent)] hover:bg-[var(--bg-2)] transition-all"
              >
                <Save size={13} /> Save as Preset
              </button>
            )}
          </div>}

          {/* ── CARDIO TAB ── */}
          {activeSection === 'cardio' && <div className="mb-4">
            {/* Add cardio buttons */}
            <div className="flex gap-2 mb-4">
              {(['swim','run','bike'] as CardioKind[]).map(kind => (
                <button
                  key={kind}
                  onClick={() => addCardioEntry(kind)}
                  className="flex-1 font-mono text-[10px] font-bold tracking-[1.5px] uppercase py-2.5 rounded border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-1)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-all"
                >
                  + {kind}
                </button>
              ))}
            </div>

            {cardios.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-[var(--line-2)] rounded">
                <p className="font-mono text-[10px] tracking-[1px] text-[var(--ink-3)] uppercase">
                  Tap Swim, Run or Bike above to log cardio
                </p>
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
          </div>}

          {/* Notes */}
          <div className="mb-6">
            <label className="que-label">Session Notes</label>
            <textarea
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
              rows={2}
              placeholder="PRs hit, fatigue level, form cues…"
              className="que-input resize-y min-h-[72px] font-sans !text-[13px] tracking-normal"
            />
          </div>

          {/* Log Workout */}
          <button
            onClick={logWorkout}
            className={[
              'w-full py-4 rounded font-sans text-[12px] font-bold uppercase tracking-[3px] transition-all duration-200',
              loggedFlash
                ? 'bg-[var(--positive)] text-[var(--accent-ink)] que-flicker'
                : 'que-btn-primary',
            ].join(' ')}
          >
            {loggedFlash ? '✓ LOGGED' : 'COMMIT SESSION'}
          </button>

        </div>
      </div>
    </>
  );
}
