'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

// ── Macro goals ───────────────────────────────────────────────────────────────

export const MACRO_GOALS_KEY = 'queMacroGoals';
export interface MacroGoals { protein: number; carbs: number; fat: number }

export function loadMacroGoals(): MacroGoals | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(MACRO_GOALS_KEY) ?? 'null'); }
  catch { return null; }
}
export function saveMacroGoals(g: MacroGoals) { localStorage.setItem(MACRO_GOALS_KEY, JSON.stringify(g)); }

export function getBaseline(budget: number, weightLbs: number): MacroGoals {
  const proteinG = Math.max(50, Math.round(0.7 * weightLbs));
  const fatG     = Math.max(30, Math.round((budget * 0.25) / 9));
  const carbG    = Math.max(0,  Math.round((budget - proteinG * 4 - fatG * 9) / 4));
  return { protein: proteinG, carbs: carbG, fat: fatG };
}

// ── Donut chart ───────────────────────────────────────────────────────────────

export function DonutChart({ protein, carbs, fat, size = 130 }: MacroGoals & { size?: number }) {
  const pKcal = protein * 4;
  const cKcal = carbs   * 4;
  const fKcal = fat     * 9;
  const total = pKcal + cKcal + fKcal;

  const R  = size / 2 - 14;
  const cx = size / 2, cy = size / 2;
  const C  = 2 * Math.PI * R;
  const SW = 16;

  if (total <= 0) {
    return (
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--bg-3)" strokeWidth={SW} />
        <text x={cx} y={cy + 4} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--ink-3)', fontFamily: 'monospace' }}>
          Set goals
        </text>
      </svg>
    );
  }

  const pLen = (pKcal / total) * C;
  const cLen = (cKcal / total) * C;
  const fLen = (fKcal / total) * C;

  const pAngle = -90;
  const cAngle = -90 + (pKcal / total) * 360;
  const fAngle = -90 + ((pKcal + cKcal) / total) * 360;

  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="var(--bg-3)" strokeWidth={SW} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#6DFF99" strokeWidth={SW}
        strokeDasharray={`${fLen} ${C}`} transform={`rotate(${fAngle}, ${cx}, ${cy})`} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#FFB547" strokeWidth={SW}
        strokeDasharray={`${cLen} ${C}`} transform={`rotate(${cAngle}, ${cx}, ${cy})`} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#4FC3F7" strokeWidth={SW}
        strokeDasharray={`${pLen} ${C}`} transform={`rotate(${pAngle}, ${cx}, ${cy})`} />
      <text x={cx} y={cy - 5} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: 'var(--ink-0)', fontFamily: 'monospace' }}>
        {Math.round(total)}
      </text>
      <text x={cx} y={cy + 9} textAnchor="middle" style={{ fontSize: 8, fill: 'var(--ink-3)', fontFamily: 'monospace' }}>
        kcal goal
      </text>
    </svg>
  );
}

// ── Macro goal modal ──────────────────────────────────────────────────────────

export function MacroGoalModal({ open, onClose, onSave, budget, weightLbs, initial }: {
  open: boolean; onClose: () => void;
  onSave: (g: MacroGoals) => void;
  budget: number; weightLbs: number;
  initial: MacroGoals;
}) {
  const [p, setP] = useState(String(initial.protein));
  const [f, setF] = useState(String(initial.fat));

  const pNum = parseFloat(p) || 0;
  const fNum = parseFloat(f) || 0;
  const carbsAuto = Math.max(0, Math.round((budget - pNum * 4 - fNum * 9) / 4));
  const totalKcal = pNum * 4 + carbsAuto * 4 + fNum * 9;
  const diff = Math.round(totalKcal - budget);

  useEffect(() => {
    if (open) { setP(String(initial.protein)); setF(String(initial.fat)); }
  }, [open, initial.protein, initial.fat]);

  const applyBaseline = () => {
    const b = getBaseline(budget, weightLbs);
    setP(String(b.protein)); setF(String(b.fat));
  };

  const save = () => {
    onSave({ protein: pNum, carbs: carbsAuto, fat: fNum });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[350] flex items-end md:items-center justify-center backdrop-blur-sm px-0 md:px-3"
          style={{ background: 'rgba(7,8,10,0.88)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="w-full md:max-w-[460px] rounded-t-2xl md:rounded-2xl bg-[var(--bg-1)] overflow-hidden"
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.6)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--line)]">
              <div>
                <h3 className="font-display text-[18px] tracking-[2px] uppercase text-[var(--ink-0)]">Macro Goals</h3>
                <p className="font-mono text-[9px] text-[var(--ink-3)] mt-0.5 tracking-[0.5px]">
                  Carbs auto-fill remaining calories from your budget
                </p>
              </div>
              <button onClick={onClose} className="text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors p-1">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Live donut + percentages */}
              <div className="flex items-center gap-5">
                <DonutChart protein={pNum} carbs={carbsAuto} fat={fNum} size={130} />
                <div className="flex-1 space-y-2">
                  {[
                    { label: 'Protein', g: pNum,       kcal: pNum*4,       color: '#4FC3F7', pct: totalKcal > 0 ? Math.round(pNum*4/totalKcal*100) : 0 },
                    { label: 'Carbs',   g: carbsAuto,  kcal: carbsAuto*4,  color: '#FFB547', pct: totalKcal > 0 ? Math.round(carbsAuto*4/totalKcal*100) : 0 },
                    { label: 'Fat',     g: fNum,       kcal: fNum*9,       color: '#6DFF99', pct: totalKcal > 0 ? Math.round(fNum*9/totalKcal*100) : 0 },
                  ].map(m => (
                    <div key={m.label} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: m.color }} />
                      <span className="font-mono text-[10px] text-[var(--ink-2)] flex-1">{m.label}</span>
                      <span className="font-mono text-[10px] font-bold text-[var(--ink-0)]">{m.g}g</span>
                      <span className="font-mono text-[9px] text-[var(--ink-3)] w-8 text-right">{m.pct}%</span>
                    </div>
                  ))}
                  <div className="pt-1 border-t border-[var(--line)]">
                    <p className="font-mono text-[9px] tracking-[0.5px]"
                      style={{ color: Math.abs(diff) < 20 ? 'var(--positive)' : 'var(--warn)' }}>
                      {Math.abs(diff) < 5 ? '✓ Matches budget' : `${diff > 0 ? '+' : ''}${diff} kcal vs budget`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Inputs */}
              <div className="space-y-3">
                {[
                  { label: 'Protein / g', val: p, set: setP, note: `${Math.round(pNum * 4)} kcal · 4 kcal/g` },
                  { label: 'Fat / g',     val: f, set: setF, note: `${Math.round(fNum * 9)} kcal · 9 kcal/g` },
                ].map(row => (
                  <div key={row.label}>
                    <div className="flex items-baseline justify-between mb-1">
                      <label className="que-label !mb-0">{row.label}</label>
                      <span className="font-mono text-[9px] text-[var(--ink-3)]">{row.note}</span>
                    </div>
                    <input type="number" inputMode="numeric" className="que-input"
                      value={row.val} onChange={e => row.set(e.target.value)} />
                  </div>
                ))}

                {/* Auto carbs display */}
                <div>
                  <div className="flex items-baseline justify-between mb-1">
                    <label className="que-label !mb-0 opacity-60">Carbs / g <span className="font-normal text-[var(--ink-3)] normal-case">(auto)</span></label>
                    <span className="font-mono text-[9px] text-[var(--ink-3)]">{carbsAuto * 4} kcal · 4 kcal/g</span>
                  </div>
                  <div className="que-input flex items-center" style={{ opacity: 0.6 }}>
                    <span className="font-mono text-[12px] text-[var(--ink-0)]">{carbsAuto}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button type="button" onClick={applyBaseline}
                  className="flex-1 que-btn-ghost text-[10px] py-2.5">
                  Use recommended
                </button>
                <button type="button" onClick={save}
                  className="flex-1 que-btn-primary py-2.5">
                  Save goals
                </button>
              </div>

              <p className="font-mono text-[8px] text-[var(--ink-3)] text-center leading-relaxed">
                Protein: 0.7 g/lb · Fat: 25% kcal · Carbs: remainder · Source: ISSN 2017, ADA/ACSM 2016
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Macro bar ─────────────────────────────────────────────────────────────────

export function MacroBar({ label, value, max, color, hit = false, allHit = false }: {
  label: string; value: number; max: number; color: string;
  hit?: boolean; allHit?: boolean;
}) {
  const pct      = Math.min(1, max > 0 ? value / max : 0);
  const barColor = allHit ? '#FFB547' : hit ? '#6DFF99' : color;
  const accent   = allHit ? '#FFB547' : hit ? '#6DFF99' : null;

  return (
    <div>
      {/* Label row */}
      <div className="flex justify-between items-center mb-1.5">
        <div className="flex items-center gap-1">
          <AnimatePresence>
            {hit && (
              <motion.span
                key="check"
                initial={{ scale: 0, opacity: 0, rotate: -30 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                className="font-mono text-[11px] font-bold"
                style={{ color: accent ?? color }}
              >
                ✓
              </motion.span>
            )}
          </AnimatePresence>
          <motion.span
            key={`${label}-${hit ? 'hit' : 'miss'}`}
            initial={hit ? { scale: 1.18 } : false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
            className="font-mono text-[10px] font-bold tracking-[1px] uppercase"
            style={{ color: accent ?? 'var(--ink-2)' }}
          >
            {label}
          </motion.span>
        </div>
        <motion.span
          animate={{ color: accent ?? 'var(--ink-3)' }}
          transition={{ duration: 0.4 }}
          className="font-mono text-[10px]"
        >
          {value}g{max > 0 ? ` / ${max}g` : ''}
        </motion.span>
      </div>

      {/* Bar track */}
      <motion.div
        className="h-2 rounded-full relative"
        style={{ background: 'var(--bg-3)' }}
        animate={{
          boxShadow: allHit
            ? ['0 0 8px rgba(255,181,71,0.5)', '0 0 24px rgba(255,181,71,1)', '0 0 8px rgba(255,181,71,0.5)']
            : hit
            ? ['0 0 0px rgba(109,255,153,0)', '0 0 12px rgba(109,255,153,0.65)', '0 0 6px rgba(109,255,153,0.35)']
            : '0 0 0px transparent',
        }}
        transition={
          allHit
            ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
            : { duration: 0.6, times: [0, 0.4, 1] }
        }
      >
        <motion.div
          className="absolute inset-y-0 left-0 w-full rounded-full origin-left"
          style={{ background: barColor }}
          animate={{ scaleX: pct }}
          transition={{
            type:      'spring',
            stiffness: hit ? 280 : 180,
            damping:   hit ? 11  : 22,
            mass:      hit ? 0.7 : 1,
          }}
        />
      </motion.div>
    </div>
  );
}
