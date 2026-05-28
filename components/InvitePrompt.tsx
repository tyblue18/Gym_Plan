'use client';

import { useEffect, useRef, useState } from 'react';
import { Share2, X } from 'lucide-react';
import { buildInviteUrl } from '@/lib/invite';
import { trackEvent }     from '@/lib/telemetry';

/**
 * Low-friction "post-win" invite nudge.
 *
 * Fires on `que-badge-earned` (which covers PRs, streak milestones, and
 * battle-win badges — the actual win moments), then shows a small dismissible
 * bottom toast a moment after the badge celebration finishes. Strict guards
 * keep it from being annoying:
 *
 *   • Cooldown: at most once per COOLDOWN_DAYS
 *   • Lifetime cap: MAX_SHOWS times ever per device
 *   • Age gate: account must be at least MIN_AGE_DAYS old (no nagging day-1 users)
 *   • Two dismissals (the ✕) → stops forever for that device
 *   • Auto-hides after AUTO_HIDE_MS if ignored (doesn't block the UI)
 *
 * State persists in localStorage so behavior survives reloads.
 */
const STATE_KEY      = 'queInvitePromptV1';
const FIRST_SEEN_KEY = 'queFirstSeenDate';
const COOLDOWN_DAYS  = 7;
const MAX_SHOWS      = 3;
const MIN_AGE_DAYS   = 3;
const DELAY_MS       = 3_500;   // wait for the badge celebration to land first
const AUTO_HIDE_MS   = 9_000;

interface PromptState {
  lastShownAt?: string;
  shownCount?:  number;
  dismissed?:   number;
  optedOut?:    boolean;
}

function read(): PromptState {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') as PromptState; }
  catch { return {}; }
}
function write(s: PromptState): void {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch { /* noop */ }
}
function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

export function InvitePrompt() {
  const [url, setUrl] = useState<string | null>(null);
  // Single in-flight guard so a flurry of badge events can't stack nudges.
  const firingRef = useRef(false);

  useEffect(() => {
    const hide = () => { setUrl(null); firingRef.current = false; };

    const onWin = () => {
      if (firingRef.current) return;
      const s = read();
      if (s.optedOut) return;
      if ((s.shownCount ?? 0) >= MAX_SHOWS) return;
      if (daysSince(s.lastShownAt) < COOLDOWN_DAYS) return;

      let firstSeen: string | null = null;
      try { firstSeen = localStorage.getItem(FIRST_SEEN_KEY); } catch { /* noop */ }
      if (daysSince(firstSeen) < MIN_AGE_DAYS) return;

      firingRef.current = true;

      // Need a username to build the invite link. If they haven't picked one,
      // skip silently (they can't be invited from anyway).
      void fetch('/api/user', { credentials: 'include' })
        .then(r => (r.ok ? r.json() : null))
        .then((me: { username?: string | null } | null) => {
          const username = me?.username ?? null;
          if (!username) { firingRef.current = false; return; }
          const link = buildInviteUrl(window.location.origin, username);

          // Let the badge celebration breathe before stacking another UI on top.
          window.setTimeout(() => {
            setUrl(link);
            write({ ...s, lastShownAt: new Date().toISOString(), shownCount: (s.shownCount ?? 0) + 1 });
            trackEvent('invite_prompt_shown');
            window.setTimeout(() => {
              // Auto-hide if it's still the same one being shown (no engagement = no penalty).
              setUrl(prev => (prev === link ? null : prev));
              if (firingRef.current) firingRef.current = false;
            }, AUTO_HIDE_MS);
          }, DELAY_MS);
        })
        .catch(() => { firingRef.current = false; });

      // hide is captured by share/dismiss handlers below via state setters; no-op here.
      void hide;
    };

    window.addEventListener('que-badge-earned', onWin);
    return () => window.removeEventListener('que-badge-earned', onWin);
  }, []);

  const share = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join me on Que',
          text:  "I track my workouts and calories on Que — join me.",
          url,
        });
        trackEvent('invite_shared', { method: 'native', source: 'win_prompt' });
      } catch { /* user dismissed the share sheet */ }
    } else {
      try { await navigator.clipboard.writeText(url); trackEvent('invite_shared', { method: 'copy', source: 'win_prompt' }); }
      catch { /* clipboard blocked */ }
    }
    // They engaged — count it as today (extends the cooldown naturally).
    write({ ...read(), lastShownAt: new Date().toISOString() });
    setUrl(null);
    firingRef.current = false;
  };

  const dismiss = () => {
    const s = read();
    const dismissed = (s.dismissed ?? 0) + 1;
    write({ ...s, dismissed, optedOut: dismissed >= 2 });   // 2 strikes → never again
    setUrl(null);
    firingRef.current = false;
  };

  if (!url) return null;

  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 z-[480] w-[calc(100vw-24px)] max-w-[380px] flex items-center gap-3 rounded-lg px-4 py-3"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
        background: 'var(--bg-1)',
        border: '1px solid var(--accent)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.55), 0 0 18px var(--accent-24)',
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[11px] font-bold text-[var(--ink-0)] tracking-[0.3px]">Nice win 🎉</p>
        <p className="font-mono text-[10px] text-[var(--ink-2)] leading-tight mt-0.5">
          Enjoying Que? Invite a friend — you both earn coins.
        </p>
      </div>
      <button
        type="button"
        onClick={share}
        className="que-btn-primary px-3 py-1.5 text-[10px] flex items-center gap-1 flex-shrink-0"
      >
        <Share2 size={12} /> Invite
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-[var(--ink-3)] hover:text-[var(--ink-0)] flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}
