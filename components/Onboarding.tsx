'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { useApp } from '@/lib/AppContext';
import { pushNow } from '@/lib/syncEngine';

export const ONBOARDING_KEY = 'queProfileSetup';

export function needsOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  return !localStorage.getItem(ONBOARDING_KEY);
}

const ACTIVITY_OPTIONS = [
  { value: '1.20', label: 'Desk job, no gym' },
  { value: '1.30', label: 'Desk + light activity' },
  { value: '1.40', label: 'Desk + gym 3×/wk' },
  { value: '1.45', label: 'Desk + gym 4–5×/wk' },
  { value: '1.55', label: 'Active job + gym 4–5×/wk' },
  { value: '1.65', label: 'Physical job + heavy training' },
];

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const { setProfile, persistProfile, updateDayRecord, todayStr } = useApp();

  const [weight,   setWeight]   = useState('');
  const [height,   setHeight]   = useState('');
  const [age,      setAge]      = useState('');
  const [sex,      setSex]      = useState<'male' | 'female'>('male');
  const [activity, setActivity] = useState('1.45');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!weight || !height || !age) {
      setError('Weight, height and age are required.');
      return;
    }
    setLoading(true);

    const updates = { weight, height, age, sex, activityLevel: activity, deficit: '500' };
    setProfile(updates);
    persistProfile(updates);

    // Save the entered weight as today's log entry — this becomes the first tracked weight
    updateDayRecord(todayStr, { weight });

    localStorage.setItem(ONBOARDING_KEY, 'done');
    pushNow({});

    onComplete();
  }, [weight, height, age, sex, activity, todayStr, setProfile, persistProfile, updateDayRecord, onComplete]);

  return (
    <div className="fixed inset-0 z-[500] flex flex-col bg-[var(--bg-0)] overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 max-w-md mx-auto w-full">

        {/* Logo + wordmark */}
        <div className="flex items-center gap-3 mb-8">
          <Image src="/Que_logo.png" alt="" width={36} height={36}
            style={{ objectFit: 'contain', filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <span className="font-display text-[28px] tracking-[8px] text-[var(--ink-0)]">QUE</span>
        </div>

        <h1 className="font-display text-[26px] md:text-[32px] tracking-[2px] uppercase text-[var(--ink-0)] text-center mb-1">
          Set up your profile
        </h1>
        <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[1px] text-center mb-8">
          This is used to calculate your calorie budget and track plan progress.
        </p>

        <div className="w-full space-y-4">

          {/* Weight */}
          <div>
            <label className="que-label">Current Weight / lbs</label>
            <input
              type="number" inputMode="decimal" className="que-input"
              placeholder="e.g. 185"
              value={weight} onChange={e => { setWeight(e.target.value); setError(''); }}
            />
          </div>

          {/* Height */}
          <div>
            <label className="que-label">Height / inches</label>
            <input
              type="number" inputMode="decimal" className="que-input"
              placeholder="e.g. 70  (5 ft 10 in = 70)"
              value={height} onChange={e => setHeight(e.target.value)}
            />
          </div>

          {/* Age */}
          <div>
            <label className="que-label">Age</label>
            <input
              type="number" inputMode="numeric" className="que-input"
              placeholder="e.g. 24"
              value={age} onChange={e => setAge(e.target.value)}
            />
          </div>

          {/* Sex */}
          <div>
            <label className="que-label">Sex</label>
            <div className="flex gap-2">
              {(['male', 'female'] as const).map(s => (
                <button
                  key={s} type="button"
                  onClick={() => setSex(s)}
                  className={[
                    'flex-1 py-2.5 rounded border font-mono text-[10px] font-bold uppercase tracking-[1.5px] transition-all',
                    sex === s
                      ? 'border-[var(--accent)] bg-[var(--accent-12)] text-[var(--accent)]'
                      : 'border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-2)] hover:border-[var(--line-3)]',
                  ].join(' ')}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Activity level */}
          <div>
            <label className="que-label">Activity Level</label>
            <select
              className="que-input cursor-pointer"
              value={activity} onChange={e => setActivity(e.target.value)}
            >
              {ACTIVITY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="font-mono text-[9px] text-[var(--danger)] tracking-[0.5px]">{error}</p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="que-btn-primary w-full py-4 mt-2"
          >
            {loading ? 'Saving…' : 'Get Started'}
          </button>
        </div>
      </div>
    </div>
  );
}
