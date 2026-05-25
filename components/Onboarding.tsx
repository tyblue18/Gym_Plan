'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { Bell, BellOff, Scale, Utensils } from 'lucide-react';
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

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribeAndSave(): Promise<boolean> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
    });
    await fetch('/api/push/subscribe', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(sub.toJSON()),
    });
    return true;
  } catch {
    return false;
  }
}

// ── Step 2 — Notifications opt-in ─────────────────────────────────────────────

function NotificationsStep({ onDone }: { onDone: () => void }) {
  const [state,   setState]   = useState<'idle' | 'loading' | 'granted' | 'denied'>('idle');
  const [support, setSupport] = useState(true);

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !VAPID_KEY) {
      setSupport(false);
    } else if (Notification.permission === 'granted') {
      // Already granted — skip this step immediately
      onDone();
    } else if (Notification.permission === 'denied') {
      setState('denied');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!support) {
    // Browser doesn't support push — skip silently
    onDone();
    return null;
  }

  const handleEnable = async () => {
    setState('loading');
    const ok = await subscribeAndSave();
    setState(ok ? 'granted' : 'denied');
    if (ok) setTimeout(onDone, 900);
  };

  return (
    <div className="w-full space-y-6">

      {/* Icon cluster */}
      <div className="flex justify-center gap-4">
        <div className="ob-notif-icon-wrap">
          <Scale size={20} className="text-[var(--accent)]" />
        </div>
        <div className="ob-notif-icon-wrap">
          <Utensils size={20} className="text-[var(--accent)]" />
        </div>
        <div className="ob-notif-icon-wrap">
          <Bell size={20} className="text-[var(--accent)]" />
        </div>
      </div>

      <div className="text-center space-y-2">
        <h2 className="font-display text-[24px] tracking-[2px] uppercase text-[var(--ink-0)]">
          Stay on track
        </h2>
        <p className="font-mono text-[10px] text-[var(--ink-2)] tracking-[0.5px] leading-relaxed">
          Get a reminder to weigh in each morning and a nudge in the evening if you haven&apos;t logged yet.
        </p>
      </div>

      {/* Reminder previews */}
      <div className="space-y-2">
        <div className="ob-notif-preview">
          <span className="ob-notif-preview-icon">⚖️</span>
          <div>
            <p className="ob-notif-preview-title">Morning weigh-in · 8 am</p>
            <p className="ob-notif-preview-body">Log your weight to keep your trend accurate.</p>
          </div>
        </div>
        <div className="ob-notif-preview">
          <span className="ob-notif-preview-icon">📋</span>
          <div>
            <p className="ob-notif-preview-title">Evening nudge · 8 pm</p>
            <p className="ob-notif-preview-body">Haven&apos;t logged today yet. Keep your streak alive.</p>
          </div>
        </div>
      </div>

      {state === 'granted' ? (
        <div className="ob-notif-success">
          <Bell size={14} /> Notifications on
        </div>
      ) : state === 'denied' ? (
        <>
          <div className="ob-notif-denied">
            <BellOff size={13} />
            Notifications blocked — enable them in browser settings later.
          </div>
          <button type="button" onClick={onDone} className="que-btn-primary w-full py-4">
            Continue
          </button>
        </>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleEnable}
            disabled={state === 'loading'}
            className="que-btn-primary w-full py-4"
          >
            {state === 'loading' ? 'Enabling…' : 'Enable Notifications'}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="w-full py-3 font-mono text-[10px] font-bold uppercase tracking-[1px] text-[var(--ink-3)]"
          >
            Maybe later
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Onboarding ────────────────────────────────────────────────────────────

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const { setProfile, persistProfile, updateDayRecord, todayStr } = useApp();

  const [step,     setStep]     = useState<'profile' | 'notifications'>('profile');
  const [weight,   setWeight]   = useState('');
  const [height,   setHeight]   = useState('');
  const [age,      setAge]      = useState('');
  const [sex,      setSex]      = useState<'male' | 'female'>('male');
  const [activity, setActivity] = useState('1.45');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleProfileSubmit = useCallback(async () => {
    if (!weight || !height || !age) {
      setError('Weight, height and age are required.');
      return;
    }
    setLoading(true);

    const updates = { weight, height, age, sex, activityLevel: activity, deficit: '500' };
    setProfile(updates);
    persistProfile(updates);
    updateDayRecord(todayStr, { weight });
    localStorage.setItem(ONBOARDING_KEY, 'done');
    pushNow({});

    setLoading(false);
    setStep('notifications');
  }, [weight, height, age, sex, activity, todayStr, setProfile, persistProfile, updateDayRecord]);

  return (
    <div className="fixed inset-0 z-[500] flex flex-col bg-[var(--bg-0)] overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 max-w-md mx-auto w-full">

        {/* Logo + wordmark */}
        <div className="flex items-center gap-3 mb-8">
          <Image src="/Que_logo.png" alt="" width={36} height={36}
            style={{ objectFit: 'contain', filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <span className="font-display text-[28px] tracking-[8px] text-[var(--ink-0)]">QUE</span>
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 mb-8">
          {(['profile', 'notifications'] as const).map((s, i) => (
            <div
              key={s}
              className="h-1 rounded-full transition-all"
              style={{
                width: step === s ? '24px' : '8px',
                background: step === s ? 'var(--accent)' : 'var(--bg-3)',
              }}
            />
          ))}
        </div>

        {step === 'profile' ? (
          <>
            <h1 className="font-display text-[26px] md:text-[32px] tracking-[2px] uppercase text-[var(--ink-0)] text-center mb-1">
              Set up your profile
            </h1>
            <p className="font-mono text-[10px] text-[var(--ink-3)] tracking-[1px] text-center mb-8">
              Used to calculate your calorie budget and track plan progress.
            </p>

            <div className="w-full space-y-4">

              <div>
                <label className="que-label">Current Weight / lbs</label>
                <input
                  type="number" inputMode="decimal" className="que-input"
                  placeholder="e.g. 185"
                  value={weight} onChange={e => { setWeight(e.target.value); setError(''); }}
                />
              </div>

              <div>
                <label className="que-label">Height / inches</label>
                <input
                  type="number" inputMode="decimal" className="que-input"
                  placeholder="e.g. 70  (5 ft 10 in = 70)"
                  value={height} onChange={e => setHeight(e.target.value)}
                />
              </div>

              <div>
                <label className="que-label">Age</label>
                <input
                  type="number" inputMode="numeric" className="que-input"
                  placeholder="e.g. 24"
                  value={age} onChange={e => setAge(e.target.value)}
                />
              </div>

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
                onClick={handleProfileSubmit}
                disabled={loading}
                className="que-btn-primary w-full py-4 mt-2"
              >
                {loading ? 'Saving…' : 'Next'}
              </button>
            </div>
          </>
        ) : (
          <NotificationsStep onDone={onComplete} />
        )}

      </div>
    </div>
  );
}
