'use client';

/**
 * components/workout/RestTimerBar.tsx
 *
 * Floating bottom bar that counts down between sets. Started by WorkoutLogger
 * on every successful commitLift; dismissable; ±30 s adjusters. Vibrates once
 * when the timer reaches 0, then sticks around in a "done" state so the user
 * sees it expired (auto-disappears 8 s later).
 *
 * Wall-clock based — survives tab background / sleep without drift.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Minus, X } from 'lucide-react';

export function RestTimerBar({
  startMs,
  durationMs,
  onAdjust,
  onDismiss,
}: {
  startMs:    number;
  durationMs: number;
  onAdjust:   (deltaMs: number) => void;
  onDismiss:  () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  // 1 s tick. Don't tick faster — it's wall-clock anyway, granularity is fine.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, durationMs - (now - startMs));
  const done      = remaining === 0;

  // One-shot vibration the instant we hit zero. The ref-style guard prevents
  // it from firing again on subsequent ticks while the user lingers on the
  // "done" state.
  const [vibed, setVibed] = useState(false);
  useEffect(() => {
    if (done && !vibed) {
      setVibed(true);
      navigator.vibrate?.([120, 60, 120, 60, 200]);
    }
  }, [done, vibed]);

  // Auto-dismiss 8 s after expiry so the bar doesn't linger forever once the
  // user has moved on to their next set or left the tab.
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(onDismiss, 8_000);
    return () => clearTimeout(id);
  }, [done, onDismiss]);

  const mm = Math.floor(remaining / 60_000);
  const ss = Math.floor((remaining % 60_000) / 1000).toString().padStart(2, '0');

  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="fixed left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-full border bg-[var(--bg-1)] px-3 py-2 shadow-2xl"
      style={{
        bottom:       'calc(20px + env(safe-area-inset-bottom))',
        borderColor:  done ? 'var(--positive)' : 'var(--accent)',
        boxShadow:    `0 0 0 1px ${done ? 'var(--positive-12)' : 'var(--accent-12)'}, 0 18px 40px rgba(0,0,0,0.5)`,
      }}
    >
      <button
        type="button"
        onClick={() => onAdjust(-30_000)}
        disabled={done}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all disabled:opacity-30"
        title="Subtract 30 s"
      >
        <Minus size={13} />
      </button>

      <div className="flex flex-col items-center min-w-[64px]">
        <span
          className="font-display tabular text-[22px] leading-none"
          style={{ color: done ? 'var(--positive)' : 'var(--accent)' }}
        >
          {done ? 'GO' : `${mm}:${ss}`}
        </span>
        <span className="font-mono text-[7px] tracking-[1.5px] uppercase text-[var(--ink-3)] mt-0.5">
          {done ? 'next set' : 'rest'}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onAdjust(30_000)}
        disabled={done}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-2)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all disabled:opacity-30"
        title="Add 30 s"
      >
        <Plus size={13} />
      </button>

      <button
        type="button"
        onClick={onDismiss}
        className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--ink-3)] hover:text-[var(--danger)] transition-colors"
        title="Skip rest"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
