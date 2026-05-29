'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import Lottie from 'lottie-react';
import celebrateAnim from '@/public/Celebrate_animation.json';
import { AutoCropImage } from '@/components/AutoCropImage';
import { SHOWN_BADGES_KEY, PENDING_BADGE_POPUPS_KEY } from '@/lib/constants';

type EarnedBadge = { slug: string; label: string; icon: string; category: string };

function readShown(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SHOWN_BADGES_KEY) ?? '[]') as string[]); }
  catch { return new Set<string>(); }
}
function writeShown(set: Set<string>): void {
  try { localStorage.setItem(SHOWN_BADGES_KEY, JSON.stringify([...set])); } catch { /* noop */ }
}

/** Read + atomically clear the durable popup queue (sync engine fills it). */
function takeQueue(): EarnedBadge[] {
  try {
    const raw = localStorage.getItem(PENDING_BADGE_POPUPS_KEY);
    if (raw) localStorage.removeItem(PENDING_BADGE_POPUPS_KEY);
    return raw ? (JSON.parse(raw) as EarnedBadge[]) : [];
  } catch { return []; }
}

/**
 * Always-mounted celebration host for SERVER-confirmed badge awards.
 *
 * The sync engine fires `que-badge-earned` whenever a push/pull drains pending
 * badges (battle wins, referrals, or anything awarded off the client's tab).
 * Previously only WorkoutLogger listened, so the popup was missed unless the
 * user happened to be on the Calendar/Protocol tab. Mounting this once in the
 * app shell guarantees the popup fires on any tab.
 *
 * Dedup is shared with WorkoutLogger's optimistic popups via the
 * `queShownBadgePopups` localStorage set: a badge already shown optimistically
 * is skipped here. We then unmark received slugs so a future revoke → re-earn
 * pops again — identical to the logic this replaces in WorkoutLogger.
 */
export function BadgeCelebration() {
  const [earned, setEarned] = useState<EarnedBadge[]>([]);

  useEffect(() => {
    // Badges reach us two ways: the DURABLE QUEUE (sync engine persists every
    // server-confirmed award there before firing the event), and the EVENT
    // DETAIL (e.g. SocialTab's optimistic battle-win popup, which dispatches
    // directly without a sync). We merge both so neither path is dropped — and
    // because the queue survives a frozen/unmounted tab, a popup missed earlier
    // still surfaces on the next open.
    function drain(e?: Event) {
      const fromEvent = e ? ((e as CustomEvent<EarnedBadge[]>).detail ?? []) : [];
      const bySlug    = new Map<string, EarnedBadge>();
      for (const b of [...takeQueue(), ...fromEvent]) if (b?.slug) bySlug.set(b.slug, b);
      const badges = [...bySlug.values()];
      if (!badges.length) return;

      const shown  = readShown();
      const toShow = badges.filter(b => !shown.has(b.slug));
      for (const b of badges) shown.delete(b.slug); // unmark → re-earn re-pops
      writeShown(shown);
      if (toShow.length > 0) {
        setEarned(prev => {
          const have = new Set(prev.map(p => p.slug)); // don't double-stack on screen
          const add  = toShow.filter(b => !have.has(b.slug));
          return add.length ? [...prev, ...add] : prev;
        });
        navigator.vibrate?.([0, 60, 80, 120, 80, 60]);
      }
    }
    // 1) Drain anything left from a previous session (the missed-event case).
    drain();
    // 2) Live wake-ups from this session's syncs / optimistic dispatches.
    //    Also re-drain on foreground in case a sync landed while backgrounded.
    window.addEventListener('que-badge-earned', drain);
    document.addEventListener('visibilitychange', drain);
    return () => {
      window.removeEventListener('que-badge-earned', drain);
      document.removeEventListener('visibilitychange', drain);
    };
  }, []);

  return (
    <AnimatePresence>
      {earned.length > 0 && (
        <motion.div
          className="fixed inset-0 z-[400] flex items-center justify-center px-6 pointer-events-none"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <Lottie
            animationData={celebrateAnim}
            loop={false}
            autoplay
            className="absolute inset-0 w-full h-full pointer-events-none"
          />

          <motion.div
            className="relative w-full max-w-[320px] rounded-2xl overflow-hidden pointer-events-auto"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            style={{ boxShadow: '0 0 0 1px rgba(79,195,247,0.5), 0 0 60px rgba(79,195,247,0.2), 0 24px 60px rgba(0,0,0,0.7)' }}
          >
            <div className="h-1.5" style={{ background: 'linear-gradient(90deg, #1a6fa8, #4fc3f7, #1a6fa8)' }} />
            <div className="bg-[var(--bg-1)] px-5 py-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-mono text-[9px] font-bold tracking-[3px] uppercase" style={{ color: '#4fc3f7' }}>
                  Badge{earned.length > 1 ? 's' : ''} Unlocked
                </p>
                <button type="button" onClick={() => setEarned([])}
                  className="w-6 h-6 flex items-center justify-center rounded text-[var(--ink-3)] hover:text-[var(--ink-0)]">
                  <X size={14} />
                </button>
              </div>
              <div className="flex flex-col gap-4">
                {earned.map((b, i) => (
                  <div key={`${b.slug}-${i}`} className="flex items-center gap-4">
                    {b.icon.startsWith('/') ? (
                      <AutoCropImage src={b.icon} alt={b.label} className="w-14 h-14 object-contain flex-shrink-0" />
                    ) : (
                      <span className="text-[44px] leading-none flex-shrink-0">{b.icon}</span>
                    )}
                    <div>
                      <p className="font-display text-[18px] tracking-[1px] uppercase text-[var(--ink-0)]">{b.label}</p>
                      <p className="font-mono text-[9px] text-[var(--ink-3)] capitalize tracking-[1px] mt-0.5">{b.category} badge</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
