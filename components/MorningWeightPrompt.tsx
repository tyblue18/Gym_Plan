'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '@/lib/AppContext';
import type { UserProfile } from '@/lib/AppContext';

// ── constants ─────────────────────────────────────────────────────────────────

const RECAP_KEY      = 'queLastRecapDate';
const COIN_KEY       = 'queCalorieCoins';
const GOAL_TOLERANCE = 100;

// ── helpers ───────────────────────────────────────────────────────────────────

function computeBaseBudget(p: UserProfile): number {
  const kg  = (parseFloat(p.weight) || 180) / 2.20462;
  const cm  = (parseFloat(p.height) || 70)  * 2.54;
  const age = parseFloat(p.age) || 29;
  const def = parseFloat(p.deficit) || 500;
  const mul = parseFloat(p.activityLevel) || 1.55;
  const bmr = Math.round(
    p.sex === 'male' ? 10*kg + 6.25*cm - 5*age + 5 : 10*kg + 6.25*cm - 5*age - 161
  );
  return Math.max(0, Math.round(bmr * mul) - def);
}

function fmt(n: number) {
  return n.toLocaleString();
}

function loadCoins(): { total: number; awardedDates: string[] } {
  if (typeof window === 'undefined') return { total: 0, awardedDates: [] };
  try { return JSON.parse(localStorage.getItem(COIN_KEY) ?? 'null') ?? { total: 0, awardedDates: [] }; }
  catch { return { total: 0, awardedDates: [] }; }
}

// ── component ─────────────────────────────────────────────────────────────────

export function MorningWeightPrompt() {
  const { isLoaded, localDB, todayStr, today, profile, updateDayRecord, getLastKnownWeight } = useApp();

  const [open,   setOpen]   = useState(false);
  const [weight, setWeight] = useState('');
  const dismissedAtRef      = useRef(0);
  const inputRef            = useRef<HTMLInputElement>(null);

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

  // Re-check on every app foreground (visibilitychange) so the prompt reappears
  // on mobile PWA re-opens when today's weight is still missing.
  // A 5-minute cooldown prevents it from re-showing on quick app-switches.
  useEffect(() => {
    if (!isLoaded) return;
    const maybeShow = () => {
      if (document.visibilityState !== 'visible') return;
      if (localStorage.getItem(RECAP_KEY) === todayStr) return;
      if (dismissedAtRef.current > 0 && Date.now() - dismissedAtRef.current < 5 * 60_000) return;
      const last = getLastKnownWeight(todayStr);
      if (last) setWeight(last);
      setOpen(true);
    };
    maybeShow();
    document.addEventListener('visibilitychange', maybeShow);
    return () => document.removeEventListener('visibilitychange', maybeShow);
  }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = (saveWeight: boolean) => {
    const didEnter = saveWeight && weight && parseFloat(weight) > 0;
    if (didEnter) {
      updateDayRecord(todayStr, { weight });
      localStorage.setItem(RECAP_KEY, todayStr);
    }
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
            className="w-full md:max-w-[400px] rounded-t-2xl md:rounded-2xl bg-[var(--bg-1)] overflow-hidden"
            initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.7)' }}
            onAnimationComplete={() => inputRef.current?.focus()}
          >
            {/* Header */}
            <div
              className="px-6 pt-6 pb-5 bg-[var(--bg-2)]"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
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
