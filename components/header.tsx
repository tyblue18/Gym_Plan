'use client';

/**
 * AuthHeader — Athletic command bar
 * All visual rules live in .auth-* classes in app/globals.css.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import Image from 'next/image';
import {
  applyAccent, applyBg,
  ACCENT_KEY, BG_KEY,
  ACCENT_SWATCHES, BG_PRESETS,
  type BgPreset,
} from '@/lib/colorScheme';
import { pushNow } from '@/lib/syncEngine';

const PHOTO_KEY = 'queProfilePhoto';
const PLAN_KEY  = 'queAthletePlan';

interface PlanData {
  type: string; intensity: string; dailyKcal: number;
  startDate: string; startWeight: number; goalWeight: number; weeksTarget: number;
}
function loadPlanData(): PlanData | null {
  try { const r = localStorage.getItem(PLAN_KEY); return r ? JSON.parse(r) as PlanData : null; }
  catch { return null; }
}

function compressPhoto(file: File): Promise<string> {
  return new Promise(resolve => {
    const img = document.createElement('img');
    img.onload = () => {
      const SIZE = 200;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx = canvas.getContext('2d')!;
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });
}

function GitHubMark({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function AuthSkeleton() {
  return (
    <div
      className="auth-skeleton"
      role="status"
      aria-label="Loading authentication state"
    />
  );
}

function SignInButton() {
  return (
    <button
      type="button"
      onClick={() => signIn('github')}
      className="auth-signin-btn"
      aria-label="Sign in with GitHub OAuth"
    >
      <GitHubMark />
      Sign in
    </button>
  );
}

interface UserPillProps {
  image: string | null | undefined;
  name:  string | null | undefined;
  email: string | null | undefined;
}

function UserPill({ image, name, email }: UserPillProps) {
  const displayName = name ?? email ?? 'Athlete';
  const [localPhoto, setLocalPhoto]   = useState<string | null>(null);
  const [open, setOpen]               = useState(false);
  const [view, setView]               = useState<'menu' | 'scheme' | 'start'>('menu');
  const [accentHex, setAccentHex]     = useState('#4FC3F7');
  const [bgLabel, setBgLabel]         = useState('Charcoal');
  const [plan,      setPlan]          = useState<PlanData | null>(null);
  const [editWeight, setEditWeight]   = useState('');
  const [editDate,   setEditDate]     = useState('');
  const [startSaved, setStartSaved]   = useState(false);
  const pillRef      = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalPhoto(localStorage.getItem(PHOTO_KEY));
    const refresh = () => setLocalPhoto(localStorage.getItem(PHOTO_KEY));
    window.addEventListener('queProfilePhotoChanged', refresh);
    window.addEventListener('storage', refresh);

    const storedAccent = localStorage.getItem(ACCENT_KEY);
    if (storedAccent) setAccentHex(storedAccent);
    const storedBg = localStorage.getItem(BG_KEY);
    if (storedBg) setBgLabel(storedBg);

    return () => {
      window.removeEventListener('queProfilePhotoChanged', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (!open) { setView('menu'); setStartSaved(false); return; }
    const p = loadPlanData();
    setPlan(p);
    if (p) { setEditWeight(String(p.startWeight)); setEditDate(p.startDate); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handlePhotoSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressPhoto(file);
    localStorage.setItem(PHOTO_KEY, compressed);
    setLocalPhoto(compressed);
    window.dispatchEvent(new Event('queProfilePhotoChanged'));
    e.target.value = '';
    setOpen(false);
  }, []);

  const handleAccentChange = useCallback((hex: string) => {
    setAccentHex(hex);
    applyAccent(hex);
    localStorage.setItem(ACCENT_KEY, hex);
  }, []);

  const handleBgChange = useCallback((preset: BgPreset) => {
    setBgLabel(preset.label);
    applyBg(preset);
    localStorage.setItem(BG_KEY, preset.label);
  }, []);

  const handleSavePlanStart = useCallback(() => {
    const current = loadPlanData();
    if (!current) return;
    const w = parseFloat(editWeight);
    if (!editWeight || isNaN(w) || !editDate) return;
    const updated = { ...current, startWeight: w, startDate: editDate };
    localStorage.setItem(PLAN_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('storage'));
    setPlan(updated);
    setStartSaved(true);
    pushNow({});
  }, [editWeight, editDate]);

  const avatarSrc = localPhoto ?? image;

  return (
    <div className="auth-pill-wrapper" ref={pillRef}>
      <button
        type="button"
        className="auth-user-pill"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen(v => !v)}
      >
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarSrc} alt={`${displayName} profile picture`} className="auth-avatar" />
        ) : (
          <span className="auth-avatar-placeholder" aria-hidden="true">
            {displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="auth-user-name" title={email ?? undefined}>{displayName}</span>
        <svg className="auth-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>

      {open && (
        <div className={`auth-dropdown${view !== 'menu' ? ' auth-dropdown--wide' : ''}`} role="menu">

          {view === 'menu' ? (
            <>
              <button type="button" role="menuitem" className="auth-dropdown-item"
                onClick={() => fileInputRef.current?.click()}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Change photo
              </button>

              <button type="button" role="menuitem" className="auth-dropdown-item"
                onClick={() => setView('scheme')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                  <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
                </svg>
                Color scheme
              </button>

              {plan && (
                <button type="button" role="menuitem" className="auth-dropdown-item"
                  onClick={() => setView('start')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  Fix plan start
                </button>
              )}

              <button type="button" role="menuitem" className="auth-dropdown-item"
                onClick={() => {
                  setOpen(false);
                  try {
                    const db       = JSON.parse(localStorage.getItem('ironmanCoreDB_v2') ?? '{}');
                    const profile  = JSON.parse(localStorage.getItem('ironmanProfileSettings_v2') ?? '{}');
                    const settings: Record<string, unknown> = {};
                    ['queAthletePlan','queWorkoutPresets','queExerciseUsage','queLiftPRs'].forEach(k => {
                      const v = localStorage.getItem(k);
                      if (v) try { settings[k] = JSON.parse(v); } catch { settings[k] = v; }
                    });
                    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile, settings, localDB: db }, null, 2)], { type: 'application/json' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `que-data-${new Date().toISOString().slice(0,10)}.json`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  } catch { /* silent */ }
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export data
              </button>

              <div className="auth-dropdown-divider" />

              <button type="button" role="menuitem" className="auth-dropdown-item auth-dropdown-item--danger"
                onClick={() => { setOpen(false); signOut({ callbackUrl: '/' }); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign out
              </button>
            </>
          ) : view === 'start' ? (
            <>
              <button type="button" className="auth-scheme-back" onClick={() => { setView('menu'); setStartSaved(false); }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
                Fix plan start
              </button>

              <div className="auth-dropdown-divider" />

              <div className="px-3 py-2.5 space-y-3">
                {/* Warning */}
                <div className="rounded border border-[var(--warn)]/40 bg-[var(--warn)]/8 px-2.5 py-2">
                  <p className="font-mono text-[9px] text-[var(--warn)] leading-relaxed tracking-[0.3px]">
                    Only use if your original start date or weight was entered incorrectly. Overwrites the plan baseline and resets progress calculations.
                  </p>
                </div>

                {/* Start weight */}
                <div>
                  <label className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)] block mb-1">
                    Start weight / lbs
                  </label>
                  <input
                    type="number" inputMode="decimal"
                    value={editWeight}
                    onChange={e => setEditWeight(e.target.value)}
                    className="w-full bg-[var(--bg-3)] border border-[var(--line-2)] rounded-sm px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-0)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                </div>

                {/* Start date */}
                <div>
                  <label className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)] block mb-1">
                    Start date
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full bg-[var(--bg-3)] border border-[var(--line-2)] rounded-sm px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-0)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                </div>

                {startSaved ? (
                  <p className="font-mono text-[9px] text-[var(--positive)] tracking-[0.5px] text-center py-1">
                    ✓ Plan start updated
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleSavePlanStart}
                    disabled={!editWeight || !editDate}
                    className="w-full font-mono text-[10px] font-bold tracking-[1px] uppercase py-2 rounded-sm border border-[var(--warn)]/60 text-[var(--warn)] hover:bg-[var(--warn)]/10 transition-all disabled:opacity-40"
                  >
                    Update plan start
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <button type="button" className="auth-scheme-back" onClick={() => setView('menu')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
                Color scheme
              </button>

              <div className="auth-dropdown-divider" />

              <p className="auth-scheme-label">Accent</p>
              <div className="auth-swatch-grid">
                {ACCENT_SWATCHES.map(s => (
                  <button
                    key={s.hex}
                    type="button"
                    className={`auth-swatch${accentHex === s.hex ? ' auth-swatch--active' : ''}`}
                    style={{ background: s.hex }}
                    title={s.label}
                    onClick={() => handleAccentChange(s.hex)}
                  />
                ))}
                <label className="auth-swatch auth-swatch--rainbow" title="Custom color">
                  <input
                    type="color"
                    value={accentHex}
                    onChange={e => handleAccentChange(e.target.value)}
                  />
                </label>
              </div>

              <div className="auth-dropdown-divider" />

              <p className="auth-scheme-label">Background</p>
              <div className="auth-bg-grid">
                {BG_PRESETS.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    className={`auth-bg-swatch${bgLabel === p.label ? ' auth-bg-swatch--active' : ''}`}
                    style={{ background: p.bg2 }}
                    onClick={() => handleBgChange(p)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="auth-file-input" onChange={handlePhotoSelect} />
    </div>
  );
}

export function AuthHeader() {
  const { data: session, status } = useSession();

  return (
    <header className="auth-header" role="banner">
      <div className="auth-header-inner">
        <span className="auth-wordmark" aria-label="Que">
          <Image
            src="/Que_logo.png"
            alt=""
            width={32}
            height={32}
            style={{
              objectFit: 'contain',
              filter: 'invert(1)',
              mixBlendMode: 'screen',
            }}
            priority
          />
          QUE
        </span>

        <div className="auth-controls" aria-live="polite" aria-atomic="true">
          {status === 'loading' && <AuthSkeleton />}
          {status === 'unauthenticated' && <SignInButton />}
          {status === 'authenticated' && session?.user && (
            <UserPill
              image={session.user.image}
              name={session.user.name}
              email={session.user.email}
            />
          )}
        </div>
      </div>
    </header>
  );
}
