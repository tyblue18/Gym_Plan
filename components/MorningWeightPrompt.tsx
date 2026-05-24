'use client';

import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Scale } from 'lucide-react';
import { useApp } from '@/lib/AppContext';

export function MorningWeightPrompt() {
  const { isLoaded, localDB, todayStr, updateDayRecord, getLastKnownWeight } = useApp();

  const [open, setOpen]   = useState(false);
  const [value, setValue] = useState('');
  const shownRef          = useRef(false);
  const inputRef          = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoaded || shownRef.current) return;
    const todayWeight = localDB[todayStr]?.weight;
    const hasWeight   = !!todayWeight && parseFloat(String(todayWeight)) > 0;
    if (!hasWeight) {
      shownRef.current = true;
      const last = getLastKnownWeight(todayStr);
      if (last) setValue(last);
      setOpen(true);
    }
  }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    const num = parseFloat(value);
    if (!num || num <= 0) return;
    updateDayRecord(todayStr, { weight: value });
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[450] flex items-end md:items-center justify-center backdrop-blur-sm px-3 md:px-0"
          style={{ background: 'rgba(7,8,10,0.88)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <motion.div
            className="w-full md:max-w-[340px] rounded-t-2xl md:rounded-2xl bg-[var(--bg-1)] overflow-hidden"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: '0 0 0 1px rgba(79,195,247,0.3), 0 0 40px rgba(79,195,247,0.1), 0 40px 80px rgba(0,0,0,0.6)' }}
            onAnimationComplete={() => inputRef.current?.focus()}
          >
            <div
              className="flex flex-col items-center justify-center gap-2 py-6 bg-[var(--bg-2)]"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(79,195,247,0.12)', border: '1.5px solid rgba(79,195,247,0.35)' }}
              >
                <Scale size={26} style={{ color: '#4FC3F7' }} />
              </div>
              <p
                className="font-mono text-[9px] font-bold tracking-[2.5px] uppercase mt-1"
                style={{ color: '#4FC3F7' }}
              >
                Morning Check-In
              </p>
            </div>

            <div className="px-6 pb-6 pt-5 space-y-4">
              <div className="text-center space-y-1">
                <h3 className="font-display text-[22px] tracking-[1.5px] uppercase text-[var(--ink-0)]">
                  Log Your Weight
                </h3>
                <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[0.3px]">
                  Track your progress — takes 5 seconds.
                </p>
              </div>

              <div>
                <label className="que-label">Weight / lbs</label>
                <input
                  ref={inputRef}
                  type="number"
                  inputMode="decimal"
                  className="que-input"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. 180"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setOpen(false)}
                  className="flex-1 py-3 rounded-lg font-mono text-[11px] font-bold tracking-[1px] uppercase text-[var(--ink-3)]"
                  style={{ background: 'var(--bg-3)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  Skip
                </button>
                <button
                  onClick={handleSave}
                  disabled={!value || parseFloat(value) <= 0}
                  className="flex-[2] py-3 rounded-lg font-mono text-[11px] font-bold tracking-[1px] uppercase disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: '#4FC3F7',
                    color: '#07080A',
                    boxShadow: '0 0 0 1px #4FC3F7, 0 0 20px rgba(79,195,247,0.25)',
                  }}
                >
                  Log Weight
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
