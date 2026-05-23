'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import { Plus, X, Search, Camera, Trash2, ChevronRight, BookOpen, Pencil } from 'lucide-react';
import Lottie from 'lottie-react';
import coinAnim      from '@/public/Calorie_Coin_animation.json';
import celebrateAnim from '@/public/Celebrate_animation.json';
import { useApp } from '@/lib/AppContext';
import type { FoodEntry } from '@/lib/AppContext';

// ── Calorie Coin system ───────────────────────────────────────────────────────

const COIN_KEY = 'queCalorieCoins';
const GOAL_TOLERANCE = 100; // ±100 kcal counts as hitting the goal

interface CoinData { total: number; awardedDates: string[] }

function loadCoins(): CoinData {
  if (typeof window === 'undefined') return { total: 0, awardedDates: [] };
  try { return JSON.parse(localStorage.getItem(COIN_KEY) ?? 'null') ?? { total: 0, awardedDates: [] }; }
  catch { return { total: 0, awardedDates: [] }; }
}
function saveCoins(d: CoinData) { localStorage.setItem(COIN_KEY, JSON.stringify(d)); }

function hitGoal(calsEaten: string | undefined, budget: number | undefined): boolean {
  const eaten = parseFloat(String(calsEaten ?? '0'));
  const bud   = parseFloat(String(budget ?? '0'));
  return eaten > 0 && bud > 0 && Math.abs(eaten - bud) <= GOAL_TOLERANCE;
}

// ── Coin award modal ──────────────────────────────────────────────────────────

function CoinAwardModal({ open, onClose, total, dateLabel }: {
  open: boolean; onClose: () => void; total: number; dateLabel: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[500] flex items-end md:items-center justify-center backdrop-blur-sm px-3 md:px-0"
          style={{ background: 'rgba(7,8,10,0.92)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="w-full md:max-w-[360px] rounded-t-2xl md:rounded-2xl bg-[var(--bg-1)] overflow-hidden"
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 0 1px rgba(255,181,71,0.5), 0 0 40px rgba(255,181,71,0.2), 0 40px 80px rgba(0,0,0,0.6)' }}
          >
            {/* Coin animation */}
            <div className="flex justify-center bg-[var(--bg-2)] py-2">
              <Lottie animationData={coinAnim} loop={false} autoplay={true} style={{ width: 160, height: 160 }} />
            </div>

            <div className="px-6 pb-7 pt-4 text-center space-y-2">
              <p className="font-mono text-[10px] font-bold tracking-[2px] uppercase" style={{ color: '#FFB547' }}>
                Calorie Coin Earned
              </p>
              <h3 className="font-display text-[26px] tracking-[2px] uppercase text-[var(--ink-0)]">
                Goal Hit!
              </h3>
              <p className="font-mono text-[11px] text-[var(--ink-2)] tracking-[0.5px]">
                You stayed within 100 kcal of your goal on {dateLabel}.
              </p>

              {/* Coin stack display */}
              <div className="flex items-center justify-center gap-2 py-3">
                {Array.from({ length: Math.min(total, 7) }).map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ y: -8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.06, duration: 0.3 }}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[14px] font-bold"
                    style={{ background: 'rgba(255,181,71,0.2)', border: '2px solid rgba(255,181,71,0.6)' }}
                  >
                    🪙
                  </motion.div>
                ))}
                {total > 7 && (
                  <span className="font-mono text-[11px] font-bold" style={{ color: '#FFB547' }}>+{total - 7}</span>
                )}
              </div>

              <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[0.5px]">
                {total} coin{total !== 1 ? 's' : ''} total
              </p>

              <button onClick={onClose} className="que-btn-primary w-full py-3 mt-2"
                style={{ background: '#FFB547', boxShadow: '0 0 0 1px #FFB547, 0 0 20px rgba(255,181,71,0.3)' }}>
                Collect!
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Macro goals ───────────────────────────────────────────────────────────────

const MACRO_GOALS_KEY = 'queMacroGoals';
interface MacroGoals { protein: number; carbs: number; fat: number }

function loadMacroGoals(): MacroGoals | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(MACRO_GOALS_KEY) ?? 'null'); }
  catch { return null; }
}
function saveMacroGoals(g: MacroGoals) { localStorage.setItem(MACRO_GOALS_KEY, JSON.stringify(g)); }

/**
 * Science-backed baseline:
 * Protein  = 0.7 g/lb bodyweight (ISSN 2017: 1.4–2.0 g/kg; 0.7 g/lb ≈ 1.54 g/kg)
 * Fat      = 25% of total kcal  (ADA/ACSM: 20–35%; 25% optimal for hormones & vitamin absorption)
 * Carbs    = remainder           (typically 45–55%; protein-sparing + primary fuel for training)
 */
function getBaseline(budget: number, weightLbs: number): MacroGoals {
  const proteinG = Math.max(50, Math.round(0.7 * weightLbs));
  const fatG     = Math.max(30, Math.round((budget * 0.25) / 9));
  const carbG    = Math.max(0,  Math.round((budget - proteinG * 4 - fatG * 9) / 4));
  return { protein: proteinG, carbs: carbG, fat: fatG };
}

// ── Donut chart ───────────────────────────────────────────────────────────────

function DonutChart({ protein, carbs, fat, size = 130 }: MacroGoals & { size?: number }) {
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

function MacroGoalModal({ open, onClose, onSave, budget, weightLbs, initial }: {
  open: boolean; onClose: () => void;
  onSave: (g: MacroGoals) => void;
  budget: number; weightLbs: number;
  initial: MacroGoals;
}) {
  const [p, setP] = useState(String(initial.protein));
  const [f, setF] = useState(String(initial.fat));

  // Carbs auto-fills the remaining calories
  const pNum = parseFloat(p) || 0;
  const fNum = parseFloat(f) || 0;
  const carbsAuto = Math.max(0, Math.round((budget - pNum * 4 - fNum * 9) / 4));
  const totalKcal = pNum * 4 + carbsAuto * 4 + fNum * 9;
  const diff = Math.round(totalKcal - budget);

  // Reset inputs when modal opens with new initial values
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

// ── Custom / My Foods ─────────────────────────────────────────────────────────

export interface CustomFood {
  id:          string;
  name:        string;
  type:        'ingredient' | 'meal';
  kcal:        number;
  protein:     number;
  carbs:       number;
  fat:         number;
  servingDesc: string;  // e.g. "1 serving", "100g", "1 cup"
  createdAt:   number;
}

const MY_FOODS_KEY = 'queMyFoods';

function loadMyFoods(): CustomFood[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(MY_FOODS_KEY) ?? '[]'); }
  catch { return []; }
}
function saveMyFoods(foods: CustomFood[]) {
  localStorage.setItem(MY_FOODS_KEY, JSON.stringify(foods));
}

// ── Meal section constants ────────────────────────────────────────────────────

const FIXED_MEALS = ['breakfast', 'lunch', 'dinner'] as const;
const MEAL_LABELS: Record<string, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const DEFAULT_ORDER = ['breakfast', 'lunch', 'dinner'];

function getMealLabel(id: string, order: string[]): string {
  if (FIXED_MEALS.includes(id as typeof FIXED_MEALS[number])) return MEAL_LABELS[id];
  const snacks = order.filter(m => !FIXED_MEALS.includes(m as typeof FIXED_MEALS[number]));
  return snacks.length === 1 ? 'Snack' : `Snack ${snacks.indexOf(id) + 1}`;
}

function IngredientIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2a4 4 0 0 1 4 4c0 3-4 8-4 8S8 9 8 6a4 4 0 0 1 4-4z"/>
      <path d="M12 14v8M8 22h8"/>
    </svg>
  );
}
function MealIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 11l19-9-9 19-2-8-8-2z"/>
    </svg>
  );
}

// ── Open Food Facts types ─────────────────────────────────────────────────────

interface OFFNutriments {
  'energy-kcal_100g'?:    number;
  'energy-kcal_serving'?: number;
  proteins_100g?:         number;
  carbohydrates_100g?:    number;
  fat_100g?:              number;
}
interface OFFProduct {
  code?: string;
  product_name: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments: OFFNutriments;
}

function perServing(p: OFFProduct, servings: number): Pick<FoodEntry, 'kcal'|'protein'|'carbs'|'fat'> {
  const n   = p.nutriments;
  const g   = parseFloat(String(p.serving_quantity ?? '100')) || 100;
  const f   = (g / 100) * servings;
  return {
    kcal:    Math.round((n['energy-kcal_100g'] ?? 0) * f),
    protein: Math.round((n.proteins_100g      ?? 0) * f * 10) / 10,
    carbs:   Math.round((n.carbohydrates_100g ?? 0) * f * 10) / 10,
    fat:     Math.round((n.fat_100g           ?? 0) * f * 10) / 10,
  };
}

// ── Macro bar ─────────────────────────────────────────────────────────────────

function MacroBar({ label, value, max, color, hit = false, allHit = false }: {
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
          {/* Checkmark springs in when goal is hit */}
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
          {/* Label — bounces in colour when goal first hit */}
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

      {/* Bar track — glow pulses when hit, bigger when allHit */}
      <motion.div
        className="h-2 rounded-full relative"
        style={{ background: 'var(--bg-3)' }}
        animate={{
          boxShadow: allHit
            ? ['0 0 0px rgba(255,181,71,0)', '0 0 18px rgba(255,181,71,0.7)', '0 0 10px rgba(255,181,71,0.45)']
            : hit
            ? ['0 0 0px rgba(109,255,153,0)', '0 0 12px rgba(109,255,153,0.65)', '0 0 6px rgba(109,255,153,0.35)']
            : '0 0 0px transparent',
        }}
        transition={{ duration: 0.6, times: [0, 0.4, 1] }}
      >
        {/* Fill — spring physics, overshoots on hit for satisfying "pop" */}
        <motion.div
          className="absolute inset-y-0 left-0 w-full rounded-full origin-left"
          style={{ background: barColor }}
          animate={{ scaleX: pct }}
          transition={{
            type:      'spring',
            stiffness: hit ? 280 : 180,
            damping:   hit ? 11  : 22,   // low damping = visible overshoot on goal hit
            mass:      hit ? 0.7 : 1,
          }}
        />
      </motion.div>
    </div>
  );
}

// ── Edit food modal ───────────────────────────────────────────────────────────

function EditFoodModal({ food, onClose, onSave, mealOrder = DEFAULT_ORDER }: {
  food: FoodEntry | null;
  onClose: () => void;
  onSave: (updated: FoodEntry) => void;
  mealOrder?: string[];
}) {
  const [name,     setName]     = useState('');
  const [servings, setServings] = useState(1);
  const [meal,     setMeal]     = useState<string>('breakfast');
  // Per-serving base values (derived when food changes)
  const [kcalPS,    setKcalPS]    = useState(0);
  const [proteinPS, setProteinPS] = useState(0);
  const [carbsPS,   setCarbsPS]   = useState(0);
  const [fatPS,     setFatPS]     = useState(0);

  useEffect(() => {
    if (!food) return;
    const s = Math.max(0.5, food.servings);
    setName(food.name);
    setServings(food.servings);
    setMeal(food.meal ?? 'breakfast');
    setKcalPS(   +(food.kcal    / s).toFixed(2));
    setProteinPS(+(food.protein / s).toFixed(3));
    setCarbsPS(  +(food.carbs   / s).toFixed(3));
    setFatPS(    +(food.fat     / s).toFixed(3));
  }, [food?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const newKcal    = Math.round(kcalPS    * servings);
  const newProtein = Math.round(proteinPS * servings * 10) / 10;
  const newCarbs   = Math.round(carbsPS   * servings * 10) / 10;
  const newFat     = Math.round(fatPS     * servings * 10) / 10;

  const save = () => {
    if (!food) return;
    onSave({ ...food, meal, name: name.trim() || food.name, servings, kcal: newKcal, protein: newProtein, carbs: newCarbs, fat: newFat });
  };

  return (
    <AnimatePresence>
      {food && (
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
              <h3 className="font-display text-[18px] tracking-[2px] uppercase text-[var(--ink-0)]">Edit Food</h3>
              <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Name */}
              <div>
                <label className="que-label">Name</label>
                <input type="text" className="que-input" value={name}
                  onChange={e => setName(e.target.value)} />
              </div>

              {/* Meal picker */}
              {mealOrder.length > 1 && (
                <div>
                  <label className="que-label">Meal</label>
                  <div className="flex flex-wrap gap-1.5">
                    {mealOrder.map(id => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setMeal(id)}
                        className={[
                          'px-3 py-1.5 rounded-sm font-mono text-[9px] font-bold tracking-[1px] uppercase transition-all border',
                          meal === id
                            ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)]'
                            : 'border-[var(--line-2)] text-[var(--ink-2)] hover:border-[var(--accent)]/60 hover:text-[var(--ink-0)]',
                        ].join(' ')}
                      >
                        {getMealLabel(id, mealOrder)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Serving info */}
              <div>
                <p className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)] mb-2">
                  Servings · {food.servingDesc} each
                </p>
                <div className="flex items-center gap-3">
                  <button type="button"
                    onClick={() => setServings(s => Math.max(0.5, +(s - 0.5).toFixed(1)))}
                    className="w-11 h-11 flex items-center justify-center rounded-sm border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-0)] text-xl hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all">−</button>
                  <span className="font-display tabular text-[26px] text-[var(--accent)] min-w-[52px] text-center leading-none">
                    {servings}
                  </span>
                  <button type="button"
                    onClick={() => setServings(s => +(s + 0.5).toFixed(1))}
                    className="w-11 h-11 flex items-center justify-center rounded-sm border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-0)] text-xl hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all">+</button>
                </div>
              </div>

              {/* Macro preview */}
              <div className="rounded border border-[var(--line-2)] bg-[var(--bg-2)] p-3">
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Calories', value: newKcal,    unit: 'kcal', accent: true },
                    { label: 'Protein',  value: newProtein, unit: 'g' },
                    { label: 'Carbs',    value: newCarbs,   unit: 'g' },
                    { label: 'Fat',      value: newFat,     unit: 'g' },
                  ].map(m => (
                    <div key={m.label}>
                      <p className="font-display text-[20px] leading-none" style={{ color: m.accent ? 'var(--accent)' : 'var(--ink-0)' }}>{m.value}</p>
                      <p className="font-mono text-[8px] text-[var(--ink-3)] mt-0.5">{m.unit}</p>
                      <p className="font-mono text-[7px] text-[var(--ink-3)] uppercase tracking-[0.5px]">{m.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="flex-1 que-btn-ghost py-3.5">Cancel</button>
                <button type="button" onClick={save}    className="flex-1 que-btn-primary py-3.5">Save</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Food log item ─────────────────────────────────────────────────────────────

function FoodLogItem({ food, onRemove, onEdit, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: {
  food: FoodEntry; onRemove: () => void; onEdit: () => void;
  onMoveUp?: () => void; onMoveDown?: () => void;
  canMoveUp?: boolean; canMoveDown?: boolean;
}) {
  const dragControls = useDragControls();

  return (
    <motion.div
      drag="y"
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.1}
      dragMomentum={false}
      onDragEnd={(_: unknown, info: { offset: { y: number } }) => {
        if (info.offset.y < -55 && canMoveUp)   onMoveUp?.();
        if (info.offset.y >  55 && canMoveDown) onMoveDown?.();
      }}
      className="flex items-center gap-2 py-3.5 border-b border-[var(--line)] last:border-0"
    >
      {/* Drag grip — 44×44 touch target, only this initiates drag */}
      <div
        className="touch-none cursor-grab active:cursor-grabbing text-[var(--ink-3)] flex-shrink-0 w-10 h-10 flex items-center justify-center"
        onPointerDown={e => { e.preventDefault(); dragControls.start(e); }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="8"  cy="6"  r="1.3" fill="currentColor"/>
          <circle cx="16" cy="6"  r="1.3" fill="currentColor"/>
          <circle cx="8"  cy="12" r="1.3" fill="currentColor"/>
          <circle cx="16" cy="12" r="1.3" fill="currentColor"/>
          <circle cx="8"  cy="18" r="1.3" fill="currentColor"/>
          <circle cx="16" cy="18" r="1.3" fill="currentColor"/>
        </svg>
      </div>

      {/* Food info — tap to edit */}
      <button type="button" onClick={onEdit} className="flex-1 min-w-0 text-left group/edit">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="font-mono text-[13px] font-semibold text-[var(--ink-0)] truncate">{food.name}</p>
          <Pencil size={10} className="flex-shrink-0 text-[var(--ink-4)] group-hover/edit:text-[var(--accent)] group-active/edit:text-[var(--accent)] transition-colors" />
        </div>
        {food.brand && <p className="font-mono text-[10px] text-[var(--ink-3)] truncate">{food.brand}</p>}
        <p className="font-mono text-[10px] text-[var(--ink-3)] mt-0.5">
          {food.servings} × {food.servingDesc}
        </p>
      </button>

      {/* Macros */}
      <div className="text-right flex-shrink-0">
        <p className="font-display text-[20px] leading-none" style={{ color: 'var(--accent)' }}>{food.kcal}</p>
        <p className="font-mono text-[9px] text-[var(--ink-3)]">kcal</p>
        <p className="font-mono text-[9px] text-[var(--ink-3)] mt-0.5">P{food.protein} C{food.carbs} F{food.fat}g</p>
      </div>

      {/* Remove — 44×44 */}
      <button
        type="button" onClick={onRemove}
        className="text-[var(--ink-3)] hover:text-[var(--danger)] active:text-[var(--danger)] transition-colors flex-shrink-0 w-11 h-11 flex items-center justify-center rounded"
      >
        <Trash2 size={16} />
      </button>
    </motion.div>
  );
}

// ── Food detail sheet ─────────────────────────────────────────────────────────

function FoodDetailSheet({ product, barcode, onAdd, onBack }: {
  product: OFFProduct;
  barcode?: string;
  onAdd: (food: Omit<FoodEntry, 'id' | 'loggedAt' | 'meal'>, barcode?: string) => void;
  onBack: () => void;
}) {
  const [servings, setServings] = useState(1);
  const macros = perServing(product, servings);
  const servingDesc = product.serving_size ?? `${product.serving_quantity ?? 100}g`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4">
        <button type="button" onClick={onBack} className="text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[13px] font-bold text-[var(--ink-0)] truncate">{product.product_name}</p>
          {product.brands && <p className="font-mono text-[9px] text-[var(--ink-3)]">{product.brands}</p>}
        </div>
      </div>

      {/* Macro preview */}
      <div className="rounded border border-[var(--line-2)] bg-[var(--bg-2)] p-3 mb-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Calories', value: macros.kcal, unit: 'kcal', accent: true },
            { label: 'Protein',  value: macros.protein, unit: 'g' },
            { label: 'Carbs',    value: macros.carbs,   unit: 'g' },
            { label: 'Fat',      value: macros.fat,     unit: 'g' },
          ].map(m => (
            <div key={m.label}>
              <p className="font-display text-[20px] leading-none" style={{ color: m.accent ? 'var(--accent)' : 'var(--ink-0)' }}>
                {m.value}
              </p>
              <p className="font-mono text-[8px] text-[var(--ink-3)] mt-0.5">{m.unit}</p>
              <p className="font-mono text-[7px] text-[var(--ink-3)] uppercase tracking-[0.5px]">{m.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Serving stepper */}
      <div className="mb-4">
        <p className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)] mb-2">
          Servings · {servingDesc} each
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setServings(s => Math.max(0.5, +(s - 0.5).toFixed(1)))}
            className="w-10 h-10 flex items-center justify-center rounded-sm border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-0)] text-xl hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
          >−</button>
          <span className="font-display tabular text-[26px] text-[var(--accent)] min-w-[48px] text-center leading-none">
            {servings}
          </span>
          <button
            type="button"
            onClick={() => setServings(s => +(s + 0.5).toFixed(1))}
            className="w-10 h-10 flex items-center justify-center rounded-sm border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-0)] text-xl hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all"
          >+</button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onAdd({
          name: product.product_name,
          brand: product.brands,
          ...macros,
          servingDesc,
          servings,
        }, barcode)}
        className="que-btn-primary w-full py-4 mt-auto"
      >
        Add to Log
      </button>
    </div>
  );
}

// ── My Foods tab ─────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', type: 'ingredient' as 'ingredient'|'meal', servingDesc: '1 serving', kcal: '', protein: '', carbs: '', fat: '' };

function MyFoodsTab({ onSelect }: { onSelect: (p: OFFProduct) => void }) {
  const [myFoods,   setMyFoods]   = useState<CustomFood[]>(() => loadMyFoods());
  const [creating,  setCreating]  = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = () => {
    if (!form.name.trim())           { setFormError('Name is required.'); return; }
    if (!form.kcal || +form.kcal <= 0) { setFormError('Calories must be > 0.'); return; }
    const food: CustomFood = {
      id:          `${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
      name:        form.name.trim(),
      type:        form.type,
      servingDesc: form.servingDesc.trim() || '1 serving',
      kcal:        +form.kcal,
      protein:     +form.protein || 0,
      carbs:       +form.carbs   || 0,
      fat:         +form.fat     || 0,
      createdAt:   Date.now(),
    };
    const updated = [...myFoods, food];
    saveMyFoods(updated);
    setMyFoods(updated);
    setCreating(false);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const remove = (id: string) => {
    const updated = myFoods.filter(f => f.id !== id);
    saveMyFoods(updated);
    setMyFoods(updated);
  };

  // Convert CustomFood → OFFProduct shape so FoodDetailSheet reuses existing logic
  // serving_quantity must be 100 so perServing's formula (g/100)*servings = 1*servings
  const toOFF = (f: CustomFood): OFFProduct => ({
    product_name:     f.name,
    serving_size:     f.servingDesc,
    serving_quantity: 100,
    nutriments: {
      'energy-kcal_100g': f.kcal,
      proteins_100g:       f.protein,
      carbohydrates_100g:  f.carbs,
      fat_100g:            f.fat,
    },
  });

  if (creating) return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <button type="button" onClick={() => { setCreating(false); setFormError(''); }}
          className="text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <p className="font-mono text-[11px] font-bold tracking-[1.5px] uppercase text-[var(--ink-1)]">New Food</p>
      </div>

      {/* Type toggle */}
      <div className="flex bg-[var(--bg-2)] border border-[var(--line)] rounded-sm p-1 gap-0.5">
        {([['ingredient','Ingredient', IngredientIcon], ['meal','Meal / Recipe', MealIcon]] as const).map(([val, label, Icon]) => (
          <button key={val} type="button"
            onClick={() => set('type', val)}
            className={['flex-1 flex items-center justify-center gap-2 py-2 rounded-sm font-mono text-[10px] font-bold tracking-[1px] uppercase transition-all',
              form.type === val ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--ink-2)] hover:text-[var(--ink-0)]'].join(' ')}
          >
            <Icon size={12} />{label}
          </button>
        ))}
      </div>

      <div>
        <label className="que-label">Name</label>
        <input type="text" className="que-input" placeholder={form.type === 'meal' ? 'e.g. Chicken & Rice Bowl' : 'e.g. Chicken Breast'}
          value={form.name} onChange={e => set('name', e.target.value)} />
      </div>
      <div>
        <label className="que-label">Serving description</label>
        <input type="text" className="que-input" placeholder="e.g. 1 serving, 100g, 1 cup"
          value={form.servingDesc} onChange={e => set('servingDesc', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([['kcal','Calories','numeric'],['protein','Protein / g','decimal'],['carbs','Carbs / g','decimal'],['fat','Fat / g','decimal']] as const).map(([k, label, mode]) => (
          <div key={k}>
            <label className="que-label">{label}{k !== 'kcal' && <span className="font-normal text-[var(--ink-3)] normal-case"> (opt)</span>}</label>
            <input type="number" inputMode={mode} className="que-input"
              value={(form as Record<string,string>)[k]} onChange={e => set(k, e.target.value)} />
          </div>
        ))}
      </div>

      {formError && <p className="font-mono text-[9px] text-[var(--danger)] tracking-[0.5px]">{formError}</p>}

      <button type="button" onClick={save} className="que-btn-primary w-full py-3">Save Food</button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] text-[var(--ink-3)] tracking-[0.5px]">
          {myFoods.length === 0 ? 'No saved foods yet' : `${myFoods.length} saved`}
        </p>
        <button type="button" onClick={() => { setCreating(true); setFormError(''); setForm(EMPTY_FORM); }}
          className="flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--accent)] border border-[var(--accent)]/40 rounded-sm px-2.5 py-1 hover:bg-[var(--accent)]/10 transition-all">
          <Plus size={10} /> New
        </button>
      </div>

      {myFoods.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-[var(--line-2)] rounded">
          <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[1px] uppercase">Save ingredients &amp; meals</p>
          <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1 tracking-[0.5px]">Tap New to create a custom food</p>
        </div>
      ) : (
        <div className="rounded border border-[var(--line)] bg-[var(--bg-2)] divide-y divide-[var(--line)]">
          {myFoods.sort((a, b) => b.createdAt - a.createdAt).map(f => (
            <div key={f.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className={['flex-shrink-0 w-7 h-7 rounded-sm flex items-center justify-center',
                f.type === 'meal' ? 'bg-[var(--positive)]/15 text-[var(--positive)]' : 'bg-[var(--accent)]/15 text-[var(--accent)]'].join(' ')}>
                {f.type === 'meal' ? <MealIcon size={14} /> : <IngredientIcon size={14} />}
              </span>
              <button type="button" onClick={() => onSelect(toOFF(f))} className="flex-1 min-w-0 text-left">
                <p className="font-mono text-[11px] font-semibold text-[var(--ink-0)] truncate">{f.name}</p>
                <p className="font-mono text-[9px] text-[var(--ink-3)]">{f.servingDesc} · {f.kcal} kcal</p>
              </button>
              <button type="button" onClick={() => remove(f.id)}
                className="text-[var(--ink-3)] hover:text-[var(--danger)] transition-colors flex-shrink-0 p-1">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Add food modal ────────────────────────────────────────────────────────────

function AddFoodModal({ open, onClose, onAdd }: {
  open: boolean;
  onClose: () => void;
  onAdd: (food: Omit<FoodEntry, 'id' | 'loggedAt' | 'meal'>, barcode?: string) => void;
}) {
  const [mode,            setMode]           = useState<'scan' | 'search' | 'myfoods'>('scan');
  const [searchQuery,     setSearchQuery]    = useState('');
  const [searchResults,   setSearchResults]  = useState<OFFProduct[]>([]);
  const [searching,       setSearching]      = useState(false);
  const [manualBarcode,   setManualBarcode]  = useState('');
  const [selectedProduct, setSelectedProduct] = useState<{ p: OFFProduct; barcode?: string } | null>(null);
  const [error,           setError]          = useState('');
  const [scanning,        setScanning]       = useState(false);
  const [hasBarcodeAPI,   setHasBarcodeAPI]  = useState(false);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const rafRef      = useRef<number>(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHasBarcodeAPI('BarcodeDetector' in window);
  }, []);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setMode('scan'); setSearchQuery(''); setSearchResults([]);
      setManualBarcode(''); setSelectedProduct(null); setError('');
      stopCamera();
    }
  }, [open]);

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const startCamera = useCallback(async () => {
    setError('');
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new (window as any).BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
      });

      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            stopCamera();
            await lookupBarcode(codes[0].rawValue);
            return;
          }
        } catch { /* continue scanning */ }
        rafRef.current = requestAnimationFrame(scan);
      };
      rafRef.current = requestAnimationFrame(scan);
    } catch (e) {
      setScanning(false);
      setError('Camera access denied. Use the barcode field below.');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lookupBarcode = async (code: string) => {
    setError('');
    setSearching(true);
    try {
      const res  = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
      const data = await res.json() as { status: number; product?: OFFProduct };
      if (data.status === 1 && data.product?.product_name) {
        setSelectedProduct({ p: data.product, barcode: code });
      } else {
        setError(`No product found for barcode ${code}. Try searching by name.`);
      }
    } catch {
      setError('Network error. Check your connection.');
    } finally {
      setSearching(false);
    }
  };

  const runSearch = useCallback(async (q: string) => {
    const query = q.trim();
    if (!query) return;
    setSearching(true); setError(''); setSearchResults([]);
    try {
      const res  = await fetch(`/api/food/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('fetch_failed');
      const data = await res.json() as { products?: OFFProduct[]; source?: string };
      const results = data.products ?? [];
      setSearchResults(results);
      if (results.length === 0) {
        setError('No results — try a simpler term (e.g. "chicken breast" not "grilled lemon chicken").');
      }
    } catch {
      setError('Search unavailable. Use the barcode scanner or add via My Foods.');
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchChange = useCallback((val: string) => {
    setSearchQuery(val);
    setSearchResults([]);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => runSearch(val), 500);
    }
  }, [runSearch]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[300] flex items-end md:items-center justify-center backdrop-blur-sm px-0 md:px-3"
          style={{ background: 'rgba(7,8,10,0.88)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={e => { if (e.target === e.currentTarget) { stopCamera(); onClose(); } }}
        >
          <motion.div
            className="w-full md:max-w-[480px] h-[88dvh] flex flex-col rounded-t-lg md:rounded-lg border border-[var(--line-2)] bg-[var(--bg-1)] overflow-hidden"
            initial={{ opacity: 0, y: 48 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 48 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.6)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--line)] flex-shrink-0">
              <h3 className="font-display text-[20px] tracking-[2px] uppercase text-[var(--ink-0)]">Add Food</h3>
              <button onClick={() => { stopCamera(); onClose(); }} className="text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors p-1">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-4 md:p-5">
              {selectedProduct ? (
                <FoodDetailSheet
                  product={selectedProduct.p}
                  barcode={selectedProduct.barcode}
                  onAdd={onAdd}
                  onBack={() => setSelectedProduct(null)}
                />
              ) : (
                <>
                  {/* Mode tabs */}
                  <div className="flex bg-[var(--bg-2)] border border-[var(--line)] rounded-sm p-1 gap-0.5 mb-4">
                    {([
                    ['scan',    'Scan',     Camera],
                    ['search',  'Search',   Search],
                    ['myfoods', 'My Foods', BookOpen],
                  ] as const).map(([id, label, Icon]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => { setMode(id); stopCamera(); setError(''); }}
                        className={[
                          'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-sm font-mono text-[9px] font-bold tracking-[0.5px] uppercase transition-all',
                          mode === id ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--ink-2)] hover:text-[var(--ink-0)]',
                        ].join(' ')}
                      >
                        <Icon size={12} />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* ── SCAN MODE ── */}
                  {mode === 'scan' && (
                    <div className="space-y-4">
                      {hasBarcodeAPI ? (
                        <>
                          {/* Live camera view */}
                          <div className="relative rounded border border-[var(--line-2)] bg-[var(--bg-2)] overflow-hidden aspect-[4/3]">
                            <video
                              ref={videoRef}
                              className={['block w-full h-full object-cover', scanning ? '' : 'hidden'].join(' ')}
                              playsInline muted
                            />
                            {!scanning && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                <Camera size={40} className="text-[var(--ink-3)]" />
                                <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[1px] uppercase">
                                  Point camera at barcode
                                </p>
                              </div>
                            )}
                            {/* Scan reticle */}
                            {scanning && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-52 h-24 border-2 border-[var(--accent)] rounded opacity-80" />
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={scanning ? stopCamera : startCamera}
                            className={scanning ? 'que-btn-ghost w-full py-3' : 'que-btn-primary w-full py-3'}
                          >
                            {scanning ? 'Stop Camera' : 'Start Camera'}
                          </button>
                        </>
                      ) : (
                        <div className="rounded border border-[var(--line-2)] bg-[var(--bg-2)] p-4 text-center">
                          <Camera size={32} className="text-[var(--ink-3)] mx-auto mb-2" />
                          <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[0.5px]">
                            Live scanning requires Chrome on Android.<br/>Enter barcode number below or use Search.
                          </p>
                        </div>
                      )}

                      {/* Manual barcode entry */}
                      <div>
                        <label className="que-label">Barcode number</label>
                        <div className="flex gap-2">
                          <input
                            type="text" inputMode="numeric" className="que-input flex-1"
                            placeholder="e.g. 3017620422003"
                            value={manualBarcode}
                            onChange={e => setManualBarcode(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && manualBarcode && lookupBarcode(manualBarcode)}
                          />
                          <button
                            type="button"
                            onClick={() => manualBarcode && lookupBarcode(manualBarcode)}
                            disabled={!manualBarcode || searching}
                            className="que-btn-ghost px-4 flex-shrink-0 disabled:opacity-40"
                          >
                            {searching ? '…' : <ChevronRight size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── SEARCH MODE ── */}
                  {mode === 'search' && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text" className="que-input flex-1"
                          placeholder="Search foods, brands…"
                          value={searchQuery}
                          onChange={e => handleSearchChange(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && runSearch(searchQuery)}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => runSearch(searchQuery)}
                          disabled={!searchQuery.trim() || searching}
                          className="que-btn-primary px-4 flex-shrink-0 disabled:opacity-40"
                        >
                          {searching ? '…' : <Search size={16} />}
                        </button>
                      </div>

                      {searchResults.length > 0 && (
                        <div className="rounded border border-[var(--line)] bg-[var(--bg-2)] divide-y divide-[var(--line)]">
                          {searchResults.map((p, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setSelectedProduct({ p })}
                              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-3)] transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="font-mono text-[11px] font-semibold text-[var(--ink-0)] truncate">{p.product_name}</p>
                                {p.brands && <p className="font-mono text-[9px] text-[var(--ink-3)] truncate">{p.brands}</p>}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-mono text-[11px] font-bold text-[var(--accent)]">
                                  {Math.round(p.nutriments['energy-kcal_100g'] ?? 0)}
                                </p>
                                <p className="font-mono text-[8px] text-[var(--ink-3)]">kcal/100g</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <p className="font-mono text-[9px] text-[var(--warn)] mt-3 tracking-[0.5px]">{error}</p>
                  )}

                  {searching && !searchResults.length && (
                    <p className="font-mono text-[9px] text-[var(--ink-3)] mt-3 text-center tracking-[1px] uppercase animate-pulse">
                      Searching…
                    </p>
                  )}

                  {/* ── MY FOODS MODE ── */}
                  {mode === 'myfoods' && (
                    <MyFoodsTab onSelect={p => setSelectedProduct({ p })} />
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Main Calorie Tracker ──────────────────────────────────────────────────────

export default function CalorieTracker() {
  const { localDB, updateDayRecord, todayStr, today, profile } = useApp();
  const todayRec = localDB[todayStr] ?? {};
  const [showModal,    setShowModal]    = useState(false);
  const [targetMeal,   setTargetMeal]   = useState<string>('breakfast');
  const [coinData,      setCoinData]     = useState<CoinData>(() => loadCoins());
  const [pendingCoin,   setPendingCoin]  = useState<{ date: string; label: string } | null>(null);
  const [macroGoals,    setMacroGoals]   = useState<MacroGoals | null>(() => loadMacroGoals());
  const [showMacroModal, setShowMacroModal] = useState(false);

  const foods = useMemo((): FoodEntry[] => {
    try { return JSON.parse(String(todayRec.foods ?? '[]')); }
    catch { return []; }
  }, [todayRec.foods]);

  const mealOrder = useMemo((): string[] => {
    try { return JSON.parse(String(todayRec.foodMealOrder ?? 'null')) ?? DEFAULT_ORDER; }
    catch { return DEFAULT_ORDER; }
  }, [todayRec.foodMealOrder]);

  const foodsByMeal = useMemo(() => {
    const map: Record<string, FoodEntry[]> = {};
    for (const id of mealOrder) map[id] = [];
    for (const f of foods) {
      const key = f.meal ?? 'breakfast';
      if (!map[key]) map[key] = [];
      map[key].push(f);
    }
    return map;
  }, [foods, mealOrder]);

  const totals = useMemo(() => ({
    kcal:    foods.reduce((s, f) => s + f.kcal,    0),
    protein: +(foods.reduce((s, f) => s + f.protein, 0)).toFixed(1),
    carbs:   +(foods.reduce((s, f) => s + f.carbs,   0)).toFixed(1),
    fat:     +(foods.reduce((s, f) => s + f.fat,     0)).toFixed(1),
  }), [foods]);

  const budget        = parseFloat(String(todayRec.budget ?? '0')) || 0;
  const proteinTarget = Math.round(parseFloat(profile.weight) * 0.8) || 0;

  // Whether today's intake is currently within goal (real-time)
  const todayGoalHit = hitGoal(todayRec.calsEaten, todayRec.budget);

  // On mount: scan past days for unawarded coins (only days before today)
  useEffect(() => {
    const coins = loadCoins();
    const awarded = new Set(coins.awardedDates);

    // Check every day in localDB that is before today
    const pendingDates = Object.keys(localDB)
      .filter(ds => ds < todayStr && !awarded.has(ds))
      .sort()
      .reverse(); // newest first

    for (const ds of pendingDates) {
      const rec = localDB[ds];
      if (hitGoal(rec.calsEaten, rec.budget)) {
        // Award the coin for this day
        const newTotal = coins.total + 1;
        const newData  = { total: newTotal, awardedDates: [...coins.awardedDates, ds] };
        saveCoins(newData);
        setCoinData(newData);

        // Format a friendly date label
        const d = new Date(ds + 'T00:00:00');
        const diff = Math.round((new Date(todayStr + 'T00:00:00').getTime() - d.getTime()) / 86400000);
        const label = diff === 1 ? 'yesterday'
          : diff === 2 ? 'two days ago'
          : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

        setPendingCoin({ date: ds, label });
        return; // show one coin at a time
      }
    }
  }, [todayStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const collectCoin = useCallback(() => {
    setPendingCoin(null);
  }, []);

  // ── Macro completion glow + celebration ────────────────────────────────────
  const hitProtein  = (macroGoals?.protein ?? 0) > 0 && totals.protein >= (macroGoals?.protein ?? Infinity);
  const hitCarbs    = (macroGoals?.carbs   ?? 0) > 0 && totals.carbs   >= (macroGoals?.carbs   ?? Infinity);
  const hitFat      = (macroGoals?.fat     ?? 0) > 0 && totals.fat     >= (macroGoals?.fat     ?? Infinity);
  const allMacrosHit = hitProtein && hitCarbs && hitFat;
  const isPerfect    = todayGoalHit && allMacrosHit;

  const [macroCelebrate, setMacroCelebrate] = useState(false);
  const prevAllHitRef = useRef(false);

  useEffect(() => {
    if (isPerfect && !prevAllHitRef.current) {
      navigator.vibrate?.([40, 20, 80, 20, 40]);
      setMacroCelebrate(true);
    }
    prevAllHitRef.current = isPerfect;
  }, [isPerfect]);

  const persistFoods = useCallback((updated: FoodEntry[], newOrder?: string[]) => {
    const kcal    = updated.reduce((s, f) => s + f.kcal, 0);
    const protein = +(updated.reduce((s, f) => s + f.protein, 0)).toFixed(1);
    updateDayRecord(todayStr, {
      foods: JSON.stringify(updated),
      ...(newOrder && { foodMealOrder: JSON.stringify(newOrder) }),
      ...(kcal > 0    && { calsEaten: String(kcal) }),
      ...(protein > 0 && { protein }),
    });
  }, [todayStr, updateDayRecord]);

  const [editingFood, setEditingFood] = useState<FoodEntry | null>(null);

  const removeFood = useCallback((id: string) => {
    persistFoods(foods.filter(f => f.id !== id));
  }, [foods, persistFoods]);

  const saveEditedFood = useCallback((updated: FoodEntry) => {
    persistFoods(foods.map(f => f.id === updated.id ? updated : f));
    setEditingFood(null);
  }, [foods, persistFoods]);

  const moveFoodInSection = useCallback((foodId: string, dir: 'up' | 'down') => {
    const food = foods.find(f => f.id === foodId);
    if (!food) return;
    const sectionId = food.meal ?? 'breakfast';
    const sec = foods
      .filter(f => (f.meal ?? 'breakfast') === sectionId)
      .sort((a, b) => (a.loggedAt) - (b.loggedAt));
    const idx = sec.findIndex(f => f.id === foodId);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sec.length) return;
    // Swap loggedAt values so sort order changes
    const aTs = sec[idx].loggedAt;
    const bTs = sec[swapIdx].loggedAt;
    persistFoods(foods.map(f => {
      if (f.id === sec[idx].id)     return { ...f, loggedAt: bTs };
      if (f.id === sec[swapIdx].id) return { ...f, loggedAt: aTs };
      return f;
    }));
  }, [foods, persistFoods]);

  const addFood = useCallback((food: Omit<FoodEntry, 'id' | 'loggedAt' | 'meal'>, barcode?: string) => {
    const entry: FoodEntry = {
      ...food,
      meal: targetMeal,
      id:       `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      loggedAt: Date.now(),
      ...(barcode && { barcode }),
    };
    persistFoods([...foods, entry]);
    setShowModal(false);
  }, [foods, targetMeal, persistFoods]);

  const openModal = useCallback((meal: string) => {
    setTargetMeal(meal); setShowModal(true);
  }, []);

  // Add a new snack section after the given section id
  const addSnack = useCallback((afterId: string) => {
    const snackId = `snack-${Date.now()}`;
    const idx = mealOrder.indexOf(afterId);
    const newOrder = [...mealOrder.slice(0, idx + 1), snackId, ...mealOrder.slice(idx + 1)];
    updateDayRecord(todayStr, { foodMealOrder: JSON.stringify(newOrder) });
    setTargetMeal(snackId); setShowModal(true);
  }, [mealOrder, todayStr, updateDayRecord]);

  // Move snack section up or down in the order
  const moveSnack = useCallback((snackId: string, dir: 'up' | 'down') => {
    const idx = mealOrder.indexOf(snackId);
    if (idx < 0) return;
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= mealOrder.length) return;
    const newOrder = [...mealOrder];
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    updateDayRecord(todayStr, { foodMealOrder: JSON.stringify(newOrder) });
  }, [mealOrder, todayStr, updateDayRecord]);

  // Remove an empty snack section
  const removeSnack = useCallback((snackId: string) => {
    const newOrder  = mealOrder.filter(id => id !== snackId);
    const remaining = foods.filter(f => f.meal !== snackId);
    persistFoods(remaining, newOrder);
  }, [mealOrder, foods, persistFoods]);

  const d       = today;
  const dateTag = `${d.getMonth() + 1}/${d.getDate()}`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 pb-28 lg:py-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="block w-2 h-2 rounded-full bg-[var(--accent)]" style={{ boxShadow: '0 0 8px var(--accent-40)' }} />
          <span className="font-mono text-[11px] font-bold tabular tracking-[2px] uppercase text-[var(--ink-1)]">
            Nutrition · {dateTag}
          </span>
        </div>
      </div>

      {/* Calorie summary hero — glows gold when goal is hit */}
      <div
        className="que-card mb-4 transition-all duration-700"
        style={
          isPerfect ? {
            borderColor: 'rgba(255,181,71,0.6)',
            boxShadow:   '0 0 0 1px rgba(255,181,71,0.5), 0 0 40px rgba(255,181,71,0.25)',
          } : undefined
        }
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="que-section-label !mb-0">
              <span className="dot" style={todayGoalHit ? { background: '#FFB547' } : undefined} />
              TODAY'S INTAKE
            </h2>
            {/* Coin stack badge */}
            {coinData.total > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[16px]">🪙</span>
                <span className="font-mono text-[11px] font-bold" style={{ color: '#FFB547' }}>
                  ×{coinData.total}
                </span>
              </div>
            )}
          </div>

          {/* Big calorie number */}
          <div className="flex items-end gap-3 mb-4">
            <span
              className="font-display tabular leading-none text-[72px] sm:text-[96px]"
              style={{
                color:      todayGoalHit ? '#FFB547' : 'var(--accent)',
                textShadow: todayGoalHit ? '0 0 32px rgba(255,181,71,0.5)' : '0 0 32px var(--accent-40)',
                letterSpacing: '-0.04em',
              }}
            >
              {totals.kcal}
            </span>
            <div className="pb-2">
              <span className="font-display text-[22px] tracking-[2px] text-[var(--ink-2)]">kcal</span>
              {todayGoalHit && (
                <p className="font-mono text-[9px] font-bold tracking-[1px] uppercase mt-0.5" style={{ color: '#FFB547' }}>
                  ✓ Goal hit!
                </p>
              )}
              {budget > 0 && !todayGoalHit && (
                <p className="font-mono text-[9px] text-[var(--ink-3)] tracking-[0.5px] mt-0.5">
                  of {budget} budget · {Math.max(0, budget - totals.kcal)} remaining
                </p>
              )}
            </div>
          </div>

          {/* Calorie progress bar */}
          {budget > 0 && (
            <div className="mb-4">
              <div className="h-2 bg-[var(--bg-3)] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: totals.kcal > budget ? 'var(--danger)' : 'var(--accent)',
                    boxShadow: totals.kcal > budget ? '0 0 8px rgba(255,77,94,0.4)' : '0 0 8px var(--accent-40)',
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (totals.kcal / budget) * 100)}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </div>
            </div>
          )}

          {/* Macro breakdown + goals */}
          <div className="flex items-center gap-4">
            {/* Donut chart — shows target distribution */}
            <button
              type="button"
              onClick={() => setShowMacroModal(true)}
              className="flex-shrink-0 relative group"
              title="Set macro goals"
            >
              <DonutChart
                protein={macroGoals?.protein ?? 0}
                carbs={macroGoals?.carbs ?? 0}
                fat={macroGoals?.fat ?? 0}
                size={120}
              />
              {/* Tap hint */}
              <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
                <span className="font-mono text-[8px] font-bold tracking-[1px] uppercase text-[var(--accent)] bg-[var(--bg-1)]/80 rounded px-1.5 py-0.5">
                  Edit
                </span>
              </span>
            </button>

            {/* Actual vs goal bars */}
            <div className="flex-1 space-y-2.5 min-w-0">
              <MacroBar label="Protein" value={totals.protein} max={macroGoals?.protein ?? proteinTarget} color="#4FC3F7" hit={hitProtein}  allHit={isPerfect} />
              <MacroBar label="Carbs"   value={totals.carbs}   max={macroGoals?.carbs   ?? 0}             color="#FFB547" hit={hitCarbs}    allHit={isPerfect} />
              <MacroBar label="Fat"     value={totals.fat}      max={macroGoals?.fat     ?? 0}             color="#6DFF99" hit={hitFat}      allHit={isPerfect} />
              <button
                type="button"
                onClick={() => setShowMacroModal(true)}
                className="font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--ink-3)] hover:text-[var(--accent)] active:text-[var(--accent)] transition-colors"
              >
                {macroGoals ? '⚙ Edit goals' : '⚙ Set macro goals'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Meal sections ──────────────────────────────────────────── */}
      {mealOrder.map((sectionId, sectionIdx) => {
        const isSnack      = !FIXED_MEALS.includes(sectionId as typeof FIXED_MEALS[number]);
        const label        = isSnack ? 'Snack' : MEAL_LABELS[sectionId];
        const sectionFoods = foodsByMeal[sectionId] ?? [];
        const sectionKcal  = sectionFoods.reduce((s, f) => s + f.kcal, 0);
        const canUp        = isSnack && sectionIdx > 0;
        const canDown      = isSnack && sectionIdx < mealOrder.length - 1;

        return (
          <div key={sectionId}>
            {/* Meal section card — snacks get a drag handle in the header only */}
            <motion.div layout className="que-card mb-1">
              {/* ── Section header ── */}
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Grip handle — drag-initiates here only to avoid scroll conflict */}
                  {isSnack && (
                    <motion.div
                      drag="y"
                      dragConstraints={{ top: 0, bottom: 0 }}
                      dragElastic={0.15}
                      dragMomentum={false}
                      onDragEnd={(_: unknown, info: { offset: { y: number } }) => {
                        if (info.offset.y < -55 && canUp)   moveSnack(sectionId, 'up');
                        if (info.offset.y >  55 && canDown) moveSnack(sectionId, 'down');
                      }}
                      className="flex items-center justify-center w-10 h-10 -ml-2 cursor-grab active:cursor-grabbing text-[var(--ink-3)] flex-shrink-0 touch-none"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="8" cy="6" r="1.2" fill="currentColor"/><circle cx="16" cy="6" r="1.2" fill="currentColor"/>
                        <circle cx="8" cy="12" r="1.2" fill="currentColor"/><circle cx="16" cy="12" r="1.2" fill="currentColor"/>
                        <circle cx="8" cy="18" r="1.2" fill="currentColor"/><circle cx="16" cy="18" r="1.2" fill="currentColor"/>
                      </svg>
                    </motion.div>
                  )}
                  <span className="font-display text-[18px] tracking-[1px] uppercase text-[var(--ink-0)]">
                    {label}
                  </span>
                  {sectionKcal > 0 && (
                    <span className="font-mono text-[11px] font-bold text-[var(--accent)]">{sectionKcal} kcal</span>
                  )}
                </div>

                {/* Snack controls — 44×44px tap targets */}
                {isSnack && (
                  <div className="flex items-center">
                    {canUp && (
                      <button type="button" onClick={() => moveSnack(sectionId, 'up')}
                        className="w-11 h-11 flex items-center justify-center text-[var(--ink-3)] hover:text-[var(--accent)] active:text-[var(--accent)] transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                      </button>
                    )}
                    {canDown && (
                      <button type="button" onClick={() => moveSnack(sectionId, 'down')}
                        className="w-11 h-11 flex items-center justify-center text-[var(--ink-3)] hover:text-[var(--accent)] active:text-[var(--accent)] transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                    )}
                    {sectionFoods.length === 0 && (
                      <button type="button" onClick={() => removeSnack(sectionId)}
                        className="w-11 h-11 flex items-center justify-center text-[var(--ink-3)] hover:text-[var(--danger)] active:text-[var(--danger)] transition-colors">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Foods ── */}
              <div className="px-4">
                {sectionFoods.length > 0 ? (
                  (() => {
                    const sorted = [...sectionFoods].sort((a, b) => a.loggedAt - b.loggedAt);
                    return sorted.map((food, fi) => (
                      <FoodLogItem
                        key={food.id}
                        food={food}
                        onRemove={() => removeFood(food.id)}
                        onEdit={() => setEditingFood(food)}
                        onMoveUp={() => moveFoodInSection(food.id, 'up')}
                        onMoveDown={() => moveFoodInSection(food.id, 'down')}
                        canMoveUp={fi > 0}
                        canMoveDown={fi < sorted.length - 1}
                      />
                    ));
                  })()
                ) : (
                  <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[0.5px] py-2 italic">
                    Nothing logged yet
                  </p>
                )}
              </div>

              {/* ── Add to section — full-width tappable row ── */}
              <button
                type="button"
                onClick={() => openModal(sectionId)}
                className="w-full flex items-center gap-2 px-4 py-4 text-left border-t border-[var(--line)] hover:bg-[var(--bg-2)] active:bg-[var(--bg-3)] transition-colors"
              >
                <span className="w-6 h-6 rounded flex items-center justify-center bg-[var(--accent)]/15 text-[var(--accent)]">
                  <Plus size={13} />
                </span>
                <span className="font-mono text-[11px] font-bold tracking-[0.5px] text-[var(--accent)]">
                  Add to {label}
                </span>
              </button>
            </motion.div>

            {/* Add snack divider — 44px tall tap area */}
            {sectionIdx < mealOrder.length - 1 && (
              <button
                type="button"
                onClick={() => addSnack(sectionId)}
                className="w-full flex items-center gap-2 py-3 px-2 group"
              >
                <div className="flex-1 h-px bg-[var(--line)] group-hover:bg-[var(--accent)]/30 transition-colors" />
                <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[1px] uppercase text-[var(--ink-3)] group-hover:text-[var(--accent)] transition-colors flex-shrink-0">
                  <Plus size={11} /> Add Snack
                </span>
                <div className="flex-1 h-px bg-[var(--line)] group-hover:bg-[var(--accent)]/30 transition-colors" />
              </button>
            )}
          </div>
        );
      })}

      {/* Add snack after last section */}
      <button
        type="button"
        onClick={() => addSnack(mealOrder[mealOrder.length - 1])}
        className="w-full flex items-center gap-2 py-3 px-2 group mt-1"
      >
        <div className="flex-1 h-px bg-[var(--line)] group-hover:bg-[var(--accent)]/30 transition-colors" />
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold tracking-[1px] uppercase text-[var(--ink-3)] group-hover:text-[var(--accent)] transition-colors flex-shrink-0">
          <Plus size={11} /> Add Snack
        </span>
        <div className="flex-1 h-px bg-[var(--line)] group-hover:bg-[var(--accent)]/30 transition-colors" />
      </button>

      {/* Attribution */}
      <p className="font-mono text-[8px] text-[var(--ink-4)] text-center tracking-[0.5px] mt-4">
        Nutrition data from USDA FoodData Central &amp; Open Food Facts
      </p>

      <AddFoodModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onAdd={addFood}
      />

      <CoinAwardModal
        open={pendingCoin !== null}
        onClose={collectCoin}
        total={coinData.total}
        dateLabel={pendingCoin?.label ?? ''}
      />

      {/* Macro all-hit confetti — pointer-events-none so it never blocks taps */}
      <AnimatePresence>
        {macroCelebrate && (
          <motion.div
            className="fixed inset-0 z-[450] flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Lottie
              animationData={celebrateAnim}
              loop={false}
              autoplay={true}
              onComplete={() => setMacroCelebrate(false)}
              style={{ width: 340, height: 340 }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <MacroGoalModal
        open={showMacroModal}
        onClose={() => setShowMacroModal(false)}
        onSave={g => {
          saveMacroGoals(g);
          setMacroGoals(g);
        }}
        budget={budget}
        weightLbs={parseFloat(profile.weight) || 170}
        initial={macroGoals ?? getBaseline(budget, parseFloat(profile.weight) || 170)}
      />

      <EditFoodModal
        food={editingFood}
        onClose={() => setEditingFood(null)}
        onSave={saveEditedFood}
        mealOrder={mealOrder}
      />
    </div>
  );
}
