'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import { GOAL_TOLERANCE, WEIGHT_PROMPT_KEY } from '@/lib/constants';
import { computeBaseBudget, loadCoins } from '@/lib/calorie-utils';

// set to today's date-string on dismiss so the prompt only shows once per day
const PROMPT_KEY = WEIGHT_PROMPT_KEY;

function fmt(n: number) {
  return n.toLocaleString();
}

// ── component ─────────────────────────────────────────────────────────────────

export function MorningWeightPrompt() {
  const { localDB, todayStr, today, profile, updateDayRecord, persistProfile, getLastKnownWeight } = useApp();

  const [open,   setOpen]   = useState(false);
  const [weight, setWeight] = useState('');
  const dismissedAtRef          = useRef(0);
  const inputRef                = useRef<HTMLInputElement>(null);
  const getLastKnownWeightRef   = useRef(getLastKnownWeight);
  getLastKnownWeightRef.current = getLastKnownWeight;

  // Yesterday's date string
  const yesterdayStr = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
  }, [today]);

  // Blocked for today only if the user already dismissed the prompt today.
  // Weight presence is NOT a blocker — the prompt is the UI for logging weight,
  // so it should show regardless of whether weight came in via cloud sync.
  const dismissedToday = () => localStorage.getItem(PROMPT_KEY) === todayStr;

  useEffect(() => {
    // Clean up old keys from previous code versions so they don't interfere.
    localStorage.removeItem('queLastRecapDate');

    // Show after a short delay so the app shell settles before the modal appears.
    const timer = setTimeout(() => {
      if (dismissedToday()) return;
      if (dismissedAtRef.current > 0 && Date.now() - dismissedAtRef.current < 5 * 60_000) return;
      const last = getLastKnownWeightRef.current(todayStr);
      if (last) setWeight(last);
      setOpen(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-show when PWA comes back to foreground (e.g., app switcher → reopen).
  useEffect(() => {
    const onForeground = () => {
      if (document.visibilityState !== 'visible') return;
      if (dismissedToday()) return;
      if (dismissedAtRef.current > 0 && Date.now() - dismissedAtRef.current < 5 * 60_000) return;
      const last = getLastKnownWeightRef.current(todayStr);
      if (last) setWeight(last);
      setOpen(true);
    };
    document.addEventListener('visibilitychange', onForeground);
    return () => document.removeEventListener('visibilitychange', onForeground);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = (saveWeight: boolean) => {
    const didEnter = saveWeight && weight && parseFloat(weight) > 0;
    if (didEnter) {
      updateDayRecord(todayStr, { weight });
      persistProfile({ weight });
    }
    // Mark as dismissed for today so the prompt doesn't reappear until tomorrow.
    localStorage.setItem(PROMPT_KEY, todayStr);
    dismissedAtRef.current = Date.now();
    setOpen(false);
  };

  // ── Yesterday's stats ──────────────────────────────────────────────────────

  const baseBudget = useMemo(() => computeBaseBudget(profile), [profile]);

  const yrec    = localDB[yesterdayStr] ?? {};
  const yBudget = (parseFloat(String(yrec.budget  ?? '0')) || 0) || baseBudget;
  const yEaten  =  parseFloat(String(yrec.calsEaten ?? '0')) || 0;
  const yHit    = yEaten > 0 && yBudget > 0 && Math.abs(yEaten - yBudget) <= GOAL_TOLERANCE;
  const yOver   = yEaten > yBudget + GOAL_TOLERANCE;
  const yUnder  = yEaten > 0 && yEaten < yBudget - GOAL_TOLERANCE;
  const hasYesterday = yEaten > 0;

  const yesterdayCoinEarned = useMemo(
    () => loadCoins().awardedDates.includes(yesterdayStr),
    [yesterdayStr],
  );

  // Consecutive on-track days ending at yesterday
  const streak = useMemo(() => {
    let count = 0;
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    for (let i = 0; i < 365; i++) {
      const ds  = [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
      const rec = localDB[ds];
      if (!rec) break;
      const dayBudget = (parseFloat(String(rec.budget ?? '0')) || 0) || baseBudget;
      const dayEaten  =  parseFloat(String(rec.calsEaten ?? '0')) || 0;
      if (!dayEaten || !dayBudget || Math.abs(dayEaten - dayBudget) > GOAL_TOLERANCE) break;
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }, [localDB, baseBudget, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // Streak-based coin multiplier: week 1 = 1 coin/day, week 2 = 2 coins/day, etc.
  const coinsPerDay     = Math.floor(streak / 7) + 1;
  const daysIntoWeek    = streak % 7;
  const daysUntilNext   = daysIntoWeek === 0 && streak > 0 ? 0 : 7 - daysIntoWeek;
  const justUnlocked    = daysIntoWeek === 0 && streak > 0;
  // How many coins yesterday's goal hit was worth
  const yesterdayCoins  = yHit ? coinsPerDay : 0;

  // ── Greeting ───────────────────────────────────────────────────────────────

  const dayNames  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayLabel  = dayNames[today.getDay()];
  const dateLabel = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[450] flex items-end md:items-center justify-center backdrop-blur-sm px-3 md:px-0"
          style={{ background: 'rgba(7,8,10,0.92)' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          <motion.div
            className="w-full md:max-w-[400px] rounded-t-2xl md:rounded-2xl bg-[var(--bg-1)] overflow-y-auto max-h-[88dvh]"
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.7)' }}
          >
            {/* Header */}
            <div
              className="px-6 pt-6 pb-5 bg-[var(--bg-2)] relative"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
              <button
                onClick={() => dismiss(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-[var(--bg-3)] transition-colors"
                aria-label="Close"
              >
                <X size={14} />
              </button>
              <p className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase text-[var(--accent)] mb-1">
                {dayLabel} · {dateLabel}
              </p>
              <h2 className="font-display text-[28px] tracking-[1.5px] uppercase text-[var(--ink-0)] leading-none">
                Good Morning
              </h2>

              {streak > 0 ? (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px]">🔥</span>
                    <p className="font-mono text-[10px] font-bold text-[var(--ink-1)]">
                      {streak}-day streak
                    </p>
                    <span
                      className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(255,181,71,0.15)', color: '#FFB547' }}
                    >
                      ×{coinsPerDay} coins/day
                    </span>
                  </div>
                  {justUnlocked ? (
                    <p className="font-mono text-[9px] font-bold" style={{ color: '#FFB547' }}>
                      🎉 Week {coinsPerDay} unlocked — {coinsPerDay} coins per day!
                    </p>
                  ) : (
                    <p className="font-mono text-[9px] text-[var(--ink-3)]">
                      {daysUntilNext} more day{daysUntilNext !== 1 ? 's' : ''} until ×{coinsPerDay + 1} coins/day
                    </p>
                  )}
                </div>
              ) : (
                <p className="font-mono text-[10px] text-[var(--ink-3)] mt-2">
                  Hit your calorie goal to start a streak and earn bonus coins
                </p>
              )}
            </div>

            <div className="px-6 pt-5 pb-6 space-y-5">

              {/* ── Yesterday recap ── */}
              <div>
                <p className="font-mono text-[8px] font-bold tracking-[2px] uppercase text-[var(--ink-3)] mb-2">
                  Yesterday's Performance
                </p>

                {hasYesterday ? (
                  <div
                    className="rounded border bg-[var(--bg-2)] p-4 space-y-3"
                    style={{ borderColor: yHit ? 'rgba(109,255,153,0.25)' : 'var(--line)' }}
                  >
                    {/* Calorie bar */}
                    <div>
                      <div className="flex justify-between items-baseline mb-1.5">
                        <span className="font-mono text-[10px] font-bold text-[var(--ink-1)]">Calories</span>
                        <span
                          className="font-mono text-[10px] font-bold"
                          style={{ color: yHit ? 'var(--positive)' : yOver ? 'var(--danger)' : 'var(--ink-2)' }}
                        >
                          {fmt(yEaten)} / {fmt(yBudget)}
                        </span>
                      </div>
                      <div className="h-2 bg-[var(--bg-3)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, yBudget > 0 ? (yEaten / yBudget) * 100 : 0)}%`,
                            background: yHit ? 'var(--positive)' : yOver ? 'var(--danger)' : 'var(--accent)',
                            boxShadow: yHit ? '0 0 8px rgba(109,255,153,0.5)' : undefined,
                          }}
                        />
                      </div>
                    </div>

                    {/* Verdict row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px]">
                          {yHit ? '✅' : yOver ? '📈' : '📉'}
                        </span>
                        <div>
                          <p
                            className="font-mono text-[10px] font-bold leading-tight"
                            style={{ color: yHit ? 'var(--positive)' : yOver ? 'var(--danger)' : 'var(--warn)' }}
                          >
                            {yHit
                              ? 'On track'
                              : yOver
                              ? `${fmt(yEaten - yBudget)} kcal over budget`
                              : `${fmt(yBudget - yEaten)} kcal under budget`}
                          </p>
                          {yUnder && (
                            <p className="font-mono text-[8px] text-[var(--ink-3)] mt-0.5">
                              Try to stay within ±100 kcal of your target
                            </p>
                          )}
                        </div>
                      </div>

                      {yesterdayCoinEarned ? (
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-[13px] font-bold" style={{ color: '#FFB547' }}>
                            +{yesterdayCoins} 🪙
                          </span>
                          <span className="font-mono text-[8px] text-[var(--ink-3)]">
                            {yesterdayCoins > 1 ? `×${yesterdayCoins} streak` : 'earned'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end">
                          <span className="font-mono text-[11px] opacity-40">🪙</span>
                          <span className="font-mono text-[8px] text-[var(--ink-3)]">no coin</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-dashed border-[var(--line-2)] bg-[var(--bg-2)] px-4 py-3 flex items-center gap-3">
                    <span className="text-[18px]">📋</span>
                    <div>
                      <p className="font-mono text-[10px] font-bold text-[var(--ink-2)]">No calories logged yesterday</p>
                      <p className="font-mono text-[9px] text-[var(--ink-3)] mt-0.5">
                        Log food in the Calories tab to track your progress
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Today's weight ── */}
              <div>
                <label className="que-label">Today's Weight / lbs</label>
                <input
                  ref={inputRef}
                  type="number"
                  inputMode="decimal"
                  className="que-input"
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  dismiss(true);
                    if (e.key === 'Escape') dismiss(false);
                  }}
                  placeholder="e.g. 180"
                />
              </div>

              {/* ── Actions ── */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => dismiss(false)}
                  className="flex-1 py-3 rounded-lg font-mono text-[10px] font-bold tracking-[1px] uppercase text-[var(--ink-3)]"
                  style={{ background: 'var(--bg-3)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  Skip
                </button>
                <button
                  onClick={() => dismiss(true)}
                  className="flex-[2] py-3 rounded-lg font-mono text-[10px] font-bold tracking-[1px] uppercase"
                  style={{
                    background: 'var(--accent)',
                    color: 'var(--accent-ink)',
                    boxShadow: '0 0 0 1px var(--accent), 0 0 20px var(--accent-24)',
                  }}
                >
                  {weight && parseFloat(weight) > 0 ? 'Log & Start Day' : 'Start Day'}
                </button>
              </div>

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
