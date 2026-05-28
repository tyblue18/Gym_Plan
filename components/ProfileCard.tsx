'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Pencil, Clock, Infinity as InfinityIcon, ChevronDown } from 'lucide-react';
import { AutoCropImage } from '@/components/AutoCropImage';
import { BADGE_CATALOG } from '@/lib/badgeCatalog';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PublicProfile {
  id:              string;
  name:            string | null;
  username:        string | null;
  status:          string | null;
  statusExpiresAt: string | null;
  showcaseBadges:  string[];       // ordered slugs, up to 8
  badges:          BadgeInfo[];
  badgeCount:      number;
  profilePhoto:    string | null;
  coinBalance?:    number;
  battleRecord?:   { wins: number; losses: number; ties: number };
  referralCount?:  number;          // own profile only — friends brought in via invite
}

export interface BadgeInfo {
  id:       string;
  slug:     string;
  label:    string;
  icon:     string;
  category: string;
  earnedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function BadgeIcon({ icon, size = 28 }: { icon: string; size?: number }) {
  if (icon.startsWith('/')) {
    return (
      <AutoCropImage
        src={icon}
        alt=""
        style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
      />
    );
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{icon}</span>;
}

function fmtBadgeDate(iso: string): string {
  const d   = new Date(iso);
  const day = d.getUTCDate();
  const sfx = [11, 12, 13].includes(day % 100) ? 'th'
    : day % 10 === 1 ? 'st'
    : day % 10 === 2 ? 'nd'
    : day % 10 === 3 ? 'rd'
    : 'th';
  const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${month} ${day}${sfx}, ${d.getUTCFullYear()}`;
}

function timeRemaining(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

// ── Battle W-L-T strip ────────────────────────────────────────────────────────
// Renders nothing until the user has at least one resolved battle, so new users
// don't see a noisy "0-0-0" on their card.
function BattleRecordChip({ record }: { record?: { wins: number; losses: number; ties: number } }) {
  if (!record) return null;
  const total = record.wins + record.losses + record.ties;
  if (total === 0) return null;
  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--line-2)] bg-[var(--bg-2)]"
      title={`${record.wins} wins · ${record.losses} losses · ${record.ties} ties`}
    >
      <span className="text-[9px] leading-none">⚔️</span>
      <span className="font-mono text-[10px] font-bold tabular-nums tracking-[0.5px]">
        <span style={{ color: 'var(--positive)' }}>{record.wins}</span>
        <span className="text-[var(--ink-3)] mx-0.5">-</span>
        <span style={{ color: 'var(--danger)' }}>{record.losses}</span>
        <span className="text-[var(--ink-3)] mx-0.5">-</span>
        <span className="text-[var(--ink-2)]">{record.ties}</span>
      </span>
    </div>
  );
}

// ── Status modal ───────────────────────────────────────────────────────────────

/**
 * Combined profile editor — Status + Badge Showcase in one scrollable sheet.
 * One Save PATCHes status, duration and showcase together (the /api/user PATCH
 * handler merges all three fields in a single update).
 */
function EditProfileModal({ status, expiresAt, badges, currentShowcase, onSaved, onClose }: {
  status:          string | null;
  expiresAt:       string | null;
  badges:          BadgeInfo[];
  currentShowcase: string[];
  onSaved:         (slugs: string[]) => void;
  onClose:         () => void;
}) {
  // Status
  const [text,     setText]     = useState(status ?? '');
  const [duration, setDuration] = useState<'24h' | 'forever'>(expiresAt ? '24h' : 'forever');
  // Showcase
  const [slots, setSlots] = useState<(string | null)[]>(() => {
    const arr = Array<string | null>(8).fill(null);
    currentShowcase.slice(0, 8).forEach((slug, i) => { arr[i] = slug; });
    return arr;
  });
  const [saving,            setSaving]            = useState(false);
  const [shake,             setShake]             = useState(false);
  const [tab,               setTab]               = useState<'mine' | 'all'>('mine');
  const [hoveredCatalogSlug, setHoveredCatalogSlug] = useState<string | null>(null);
  // Slot index "picked up" for a two-tap reorder (replaces drag-to-reorder,
  // which fought with scroll and clipped against the sheet on mobile).
  const [pickedSlot, setPickedSlot] = useState<number | null>(null);

  const selected = slots.filter((s): s is string => s !== null);

  // Add (fills the first empty slot) or remove, from the badge picker below.
  const toggle = (slug: string) => {
    setPickedSlot(null);
    setSlots(prev => {
      const idx = prev.indexOf(slug);
      if (idx !== -1) { const n = [...prev]; n[idx] = null; return n; }  // already in → remove
      const emptyIdx = prev.indexOf(null);
      if (emptyIdx === -1) {                                              // full → shake the counter
        setShake(true);
        setTimeout(() => setShake(false), 600);
        return prev;
      }
      const n = [...prev]; n[emptyIdx] = slug; return n;
    });
  };

  // Two-tap reorder: tap a filled slot to pick it up, tap another slot to swap
  // (tapping an empty slot moves it there). Tapping the picked slot again cancels.
  const handleSlotTap = (i: number) => {
    if (pickedSlot === null) {
      if (slots[i] !== null) setPickedSlot(i);
      return;
    }
    if (pickedSlot === i) { setPickedSlot(null); return; }
    setSlots(prev => {
      const n = [...prev];
      [n[pickedSlot], n[i]] = [n[i], n[pickedSlot]];
      return n;
    });
    setPickedSlot(null);
  };

  // One Save persists status + duration + showcase together.
  const save = async () => {
    setSaving(true);
    const slugs = slots.filter((s): s is string => s !== null);
    await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: text.trim(), statusDuration: duration, showcaseBadges: slugs }),
    });
    setSaving(false);
    onSaved(slugs);
    onClose();
  };

  // My Badges tab: selected first (in slot order), then rest by earnedAt desc
  const sorted = [
    ...badges.filter(b => selected.includes(b.slug)).sort(
      (a, b) => selected.indexOf(a.slug) - selected.indexOf(b.slug)
    ),
    ...badges.filter(b => !selected.includes(b.slug)).sort(
      (a, b) => new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime()
    ),
  ];

  const earnedMap = new Map(badges.map(b => [b.slug, b]));

  return (
    <motion.div
      className="fixed inset-0 z-[500] flex items-end md:items-center justify-center backdrop-blur-sm px-0 md:px-3"
      style={{ background: 'rgba(7,8,10,0.9)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="w-full md:max-w-[480px] h-[90dvh] flex flex-col rounded-t-2xl md:rounded-2xl bg-[var(--bg-1)] overflow-hidden"
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.6)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0 border-b border-[var(--line)]">
          <h3 className="font-display text-[18px] tracking-[2px] uppercase text-[var(--ink-0)]">Edit Profile</h3>
          <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body — Status stacked above Showcase */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ── Status ── */}
          <div className="space-y-3">
            <p className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-[var(--ink-3)]">Status</p>
            <div>
              <input
                type="text"
                className="que-input"
                placeholder="e.g. On a cut · Bulk szn 💪 · Rest day"
                value={text}
                maxLength={60}
                onChange={e => setText(e.target.value)}
              />
              <p className="font-mono text-[8px] text-[var(--ink-3)] mt-1 flex justify-between">
                <span>Leave empty to clear</span><span>{text.length}/60</span>
              </p>
            </div>
            <div className="flex gap-2">
              {([['24h', '24 Hours', Clock], ['forever', 'Indefinite', InfinityIcon]] as const).map(([val, label, Icon]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setDuration(val)}
                  className={[
                    'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-sm border font-mono text-[10px] font-bold tracking-[0.5px] uppercase transition-all',
                    duration === val ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)]'
                      : 'border-[var(--line-2)] text-[var(--ink-2)] hover:border-[var(--accent)]/60'
                  ].join(' ')}
                >
                  <Icon size={13} />{label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[var(--line)]" />

          {/* ── Showcase ── */}
          <div className="space-y-3">
            <div>
              <p className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-[var(--ink-3)]">Badge Showcase</p>
              <p className="font-mono text-[8px] text-[var(--ink-3)] mt-1">Tap a badge to add or remove · tap two slots to swap</p>
            </div>

            {/* Preview 4×2 grid */}
            <div
              className="relative rounded-xl overflow-visible px-3 py-3"
              style={{
                background: 'linear-gradient(160deg, #0C0C1C 0%, #070710 100%)',
                boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
              }}
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-xl"
                style={{ background: 'linear-gradient(90deg, #CC1100, #EE2200, #CC1100)' }} />

              <div className="flex items-center justify-between mb-2 mt-0.5">
                <p className="font-mono text-[7px] font-bold tracking-[2px] uppercase" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  Showcase
                </p>
                <motion.p
                  animate={shake ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
                  transition={{ duration: 0.4 }}
                  className="font-mono text-[7px] font-bold tracking-[1px]"
                  style={{ color: selected.length >= 8 ? 'var(--accent)' : 'rgba(255,255,255,0.2)' }}
                >
                  {selected.length}/8
                </motion.p>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => {
                  const slug   = slots[i];
                  const badge  = slug ? badges.find(b => b.slug === slug) : null;
                  const picked = pickedSlot === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSlotTap(i)}
                      className="aspect-square relative flex items-center justify-center select-none transition-transform active:scale-95"
                      style={{
                        borderRadius: '50%',
                        background: badge
                          ? 'radial-gradient(circle at 35% 30%, #181828, #06060E)'
                          : 'radial-gradient(circle at 35% 30%, #101018, #05050C)',
                        boxShadow: picked
                          ? '0 0 0 2px var(--accent), 0 0 14px var(--accent-40)'
                          : badge
                            ? 'inset 0 2px 6px rgba(0,0,0,0.9), inset 0 -1px 2px rgba(255,255,255,0.03)'
                            : 'inset 0 2px 8px rgba(0,0,0,0.95)',
                      }}
                    >
                      {badge ? (
                        badge.icon.startsWith('/') ? (
                          <AutoCropImage src={badge.icon} alt={badge.label} className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-[22px] leading-none">{badge.icon}</span>
                        )
                      ) : (
                        <span style={{ color: pickedSlot !== null ? 'var(--accent)' : 'rgba(255,255,255,0.10)', fontSize: 16 }}>
                          {pickedSlot !== null ? '↓' : '+'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab toggle */}
            <div className="flex gap-1 p-0.5 rounded-sm bg-[var(--bg-3)]">
              {(['mine', 'all'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={[
                    'flex-1 py-1.5 font-mono text-[9px] font-bold tracking-[1px] uppercase rounded-sm transition-all',
                    tab === t
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-1)]',
                  ].join(' ')}
                >
                  {t === 'mine' ? `My Badges · ${badges.length}` : 'All Badges'}
                </button>
              ))}
            </div>

            {/* Badge picker */}
            {tab === 'mine' ? (
              badges.length === 0 ? (
                <div className="text-center py-10">
                  <p className="font-mono text-[10px] text-[var(--ink-3)]">Earn badges first by logging lifts and hitting calorie goals.</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {sorted.map(badge => {
                    const slotIdx    = slots.indexOf(badge.slug);
                    const inShowcase = slotIdx !== -1;
                    return (
                      <button
                        key={badge.id}
                        type="button"
                        onClick={() => toggle(badge.slug)}
                        className={[
                          'relative flex flex-col items-center text-center p-2 rounded-lg border transition-all active:scale-95',
                          inShowcase
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                            : 'border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--accent)]/50',
                        ].join(' ')}
                      >
                        {inShowcase && (
                          <span
                            className="absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 rounded-full text-[7px] font-bold font-mono flex items-center justify-center"
                            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                          >
                            {slotIdx + 1}
                          </span>
                        )}
                        <div className="w-10 h-10 flex items-center justify-center mb-1">
                          <BadgeIcon icon={badge.icon} size={36} />
                        </div>
                        <p className="font-mono text-[7px] font-bold text-[var(--ink-0)] leading-tight line-clamp-2">{badge.label}</p>
                      </button>
                    );
                  })}
                </div>
              )
            ) : (
              /* All Badges catalog */
              <div className="grid grid-cols-4 gap-2">
                {BADGE_CATALOG.map(entry => {
                  const earned = earnedMap.get(entry.slug);
                  const isHovered = hoveredCatalogSlug === entry.slug;
                  return (
                    <div
                      key={entry.slug}
                      className="relative flex flex-col items-center text-center p-2 rounded-lg border transition-all"
                      style={earned ? {
                        borderColor: 'rgba(109,255,153,0.45)',
                        background: 'rgba(109,255,153,0.07)',
                        boxShadow: '0 0 14px rgba(109,255,153,0.12)',
                      } : {
                        borderColor: 'var(--line)',
                        background: 'var(--bg-2)',
                      }}
                      onMouseEnter={() => setHoveredCatalogSlug(entry.slug)}
                      onMouseLeave={() => setHoveredCatalogSlug(null)}
                    >
                      <div
                        className={['w-10 h-10 flex items-center justify-center mb-1', earned ? '' : 'badge-unearned'].join(' ')}
                      >
                        <BadgeIcon icon={entry.icon} size={36} />
                      </div>
                      <p
                        className="font-mono text-[7px] font-bold leading-tight line-clamp-2"
                        style={{ color: earned ? 'rgba(109,255,153,0.8)' : 'var(--ink-3)' }}
                      >
                        {entry.label}
                      </p>

                      {/* Tooltip */}
                      <AnimatePresence>
                        {isHovered && (
                          <motion.div
                            initial={{ opacity: 0, y: 4, scale: 0.94 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.94 }}
                            transition={{ duration: 0.12 }}
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-36 rounded-lg p-2.5 text-center pointer-events-none"
                            style={{
                              background: 'var(--bg-0)',
                              border: '1px solid var(--line-2)',
                              boxShadow: '0 6px 24px rgba(0,0,0,0.7)',
                            }}
                          >
                            {earned ? (
                              <>
                                <p className="font-mono text-[8px] font-bold" style={{ color: 'rgba(109,255,153,0.9)' }}>Earned</p>
                                <p className="font-mono text-[7px] text-[var(--ink-2)] mt-0.5 leading-snug">{fmtBadgeDate(earned.earnedAt)}</p>
                              </>
                            ) : (
                              <p className="font-mono text-[7px] text-[var(--ink-2)] leading-snug">{entry.howToGet}</p>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Sticky Save — persists both sections */}
        <div className="px-5 py-3 flex-shrink-0 border-t border-[var(--line)]">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="que-btn-primary w-full py-3 disabled:opacity-40"
          >
            {saving ? '…' : 'Save changes'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Badge detail modal (shown when a visitor clicks a showcase badge) ──────────

function BadgeDetailModal({ badge, onClose }: {
  badge:   BadgeInfo;
  onClose: () => void;
}) {
  const catalogEntry = BADGE_CATALOG.find(e => e.slug === badge.slug);

  const glowColor: Record<string, string> = {
    lift:      'rgba(79,195,247,0.18)',
    cardio:    'rgba(109,255,153,0.18)',
    nutrition: 'rgba(255,181,71,0.18)',
  };

  return (
    <motion.div
      className="fixed inset-0 z-[500] flex items-end md:items-center justify-center backdrop-blur-sm px-0 md:px-3"
      style={{ background: 'rgba(7,8,10,0.88)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="w-full md:max-w-[340px] rounded-t-2xl md:rounded-2xl bg-[var(--bg-1)] overflow-hidden"
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.6)' }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--line)]">
          <h3 className="font-display text-[16px] tracking-[2px] uppercase text-[var(--ink-0)] leading-tight">
            {badge.label}
          </h3>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 pt-5 pb-6 flex flex-col items-center gap-5">
          {/* Badge icon */}
          <div
            className="badge-slot w-28 h-28 flex items-center justify-center rounded-full"
            style={{
              boxShadow: `inset 0 2px 8px rgba(0,0,0,0.9), 0 0 32px ${glowColor[badge.category] ?? 'rgba(255,255,255,0.1)'}`,
            }}
          >
            <BadgeIcon icon={badge.icon} size={80} />
          </div>

          {/* Earned */}
          <div className="text-center">
            <p className="font-mono text-[8px] font-bold tracking-[2px] uppercase mb-1"
              style={{ color: 'rgba(109,255,153,0.6)' }}>
              Earned
            </p>
            <p className="font-mono text-[14px] font-bold text-[var(--ink-0)]">
              {fmtBadgeDate(badge.earnedAt)}
            </p>
          </div>

          {/* How to earn */}
          {catalogEntry && (
            <div
              className="w-full rounded-xl px-4 py-3 text-center"
              style={{ background: 'var(--bg-3)', border: '1px solid var(--line)' }}
            >
              <p className="font-mono text-[8px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)] mb-1.5">
                How to earn
              </p>
              <p className="font-mono text-[11px] text-[var(--ink-1)] leading-relaxed">
                {catalogEntry.howToGet}
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Badge case ─────────────────────────────────────────────────────────────────

function BadgeCase({ showcase, allBadges, isOwn, onEdit }: {
  showcase:  string[];
  allBadges: BadgeInfo[];
  isOwn:     boolean;
  onEdit?:   () => void;
}) {
  const [hoveredIdx,    setHoveredIdx]    = useState<number | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<BadgeInfo | null>(null);

  const slots = Array.from({ length: 8 }, (_, i) => {
    const slug = showcase[i] ?? null;
    return slug ? allBadges.find(b => b.slug === slug) ?? null : null;
  });

  const glowColors: Record<string, string> = {
    lift:      'rgba(79,195,247,0.5)',
    nutrition: 'rgba(255,181,71,0.5)',
    cardio:    'rgba(109,255,153,0.5)',
  };

  const hoveredBadge = hoveredIdx !== null ? slots[hoveredIdx] : null;

  return (
    <div className="mt-4">
      <div className="badge-case relative rounded-xl overflow-hidden px-4 py-3.5">
        {/* Red trim */}
        <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-xl"
          style={{ background: 'linear-gradient(90deg, #CC1100, #EE2200, #CC1100)' }} />

        {/* Label */}
        <p className="badge-case-label font-mono text-[8px] font-bold tracking-[2.5px] uppercase text-center mb-3 mt-1">
          Gym Badges
        </p>

        {/* 4 × 2 badge grid */}
        <div className="grid grid-cols-4 gap-3">
          {slots.map((badge, i) => (
            <motion.button
              key={i}
              type="button"
              onClick={isOwn ? onEdit : (badge ? () => setSelectedBadge(badge) : undefined)}
              disabled={isOwn ? false : !badge}
              whileTap={{ scale: 0.92 }}
              onMouseEnter={() => badge && setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="badge-slot aspect-square flex items-center justify-center relative"
              style={{
                borderRadius: '50%',
                boxShadow: badge
                  ? `inset 0 2px 6px rgba(0,0,0,0.9), inset 0 -1px 2px rgba(255,255,255,0.03), 0 0 12px ${glowColors[badge.category] ?? 'rgba(255,255,255,0.2)'}, 0 1px 0 rgba(255,255,255,0.04)`
                  : 'inset 0 2px 8px rgba(0,0,0,0.95), inset 0 -1px 2px rgba(255,255,255,0.02), 0 1px 0 rgba(255,255,255,0.02)',
                cursor: badge || isOwn ? 'pointer' : 'default',
              }}
            >
              {badge ? (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center select-none"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                >
                  {badge.icon.startsWith('/') ? (
                    <AutoCropImage src={badge.icon} alt={badge.label} />
                  ) : (
                    <span className="text-[22px] leading-none">{badge.icon}</span>
                  )}
                </motion.div>
              ) : (
                <span className="badge-slot-empty text-[16px] leading-none select-none">
                  {isOwn ? '+' : '·'}
                </span>
              )}
            </motion.button>
          ))}
        </div>

        {/* Hover tooltip — shows badge name + date inside the case */}
        <div className="mt-3 h-7 flex flex-col items-center justify-center">
          {hoveredBadge ? (
            <motion.div
              key={hoveredBadge.slug}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <p className="badge-case-text font-mono text-[9px] font-bold text-center leading-tight">
                {hoveredBadge.label}
              </p>
              <p className="badge-case-subtext font-mono text-[8px] text-center">
                {isOwn ? 'Assigned' : 'Tap for details ·'} {fmtBadgeDate(hoveredBadge.earnedAt)}
              </p>
            </motion.div>
          ) : isOwn ? (
            <p className="badge-case-hint font-mono text-[7px] text-center tracking-[1px] uppercase">
              Tap to edit · hover to inspect
            </p>
          ) : (
            <p className="badge-case-hint font-mono text-[7px] text-center tracking-[1px] uppercase">
              Tap a badge to learn more
            </p>
          )}
        </div>
      </div>

      {/* Badge detail modal */}
      <AnimatePresence>
        {selectedBadge && (
          <BadgeDetailModal
            badge={selectedBadge}
            onClose={() => setSelectedBadge(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main ProfileCard ───────────────────────────────────────────────────────────

export default function ProfileCard({
  profile,
  isOwn = false,
  onRefresh,
}: {
  profile:    PublicProfile;
  isOwn?:     boolean;
  onRefresh?: () => void;
}) {
  const [localProfile, setLocalProfile] = useState(profile);
  const [modal, setModal] = useState<'edit' | null>(null);
  const [showAll, setShowAll] = useState(false);   // Full Collection collapsed by default to keep the tab compact

  // Sync when parent refreshes
  useEffect(() => { setLocalProfile(profile); }, [profile]);

  const refresh = () => { onRefresh?.(); };

  const initials = (localProfile.name ?? localProfile.username ?? '?')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const hasStatus = !!localProfile.status;
  const isTemp    = !!localProfile.statusExpiresAt;

  return (
    <div className="que-card overflow-hidden">
      {/* ── Top: photo + name + status ── */}
      <div className="p-5 pb-3">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div
              className="w-16 h-16 rounded-full overflow-hidden border-2 flex items-center justify-center"
              style={{ borderColor: 'var(--accent)', background: 'var(--bg-3)' }}
            >
              {localProfile.profilePhoto ? (
                <img
                  src={localProfile.profilePhoto}
                  alt={localProfile.name ?? 'Profile'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="font-display text-[22px] text-[var(--ink-1)]">{initials}</span>
              )}
            </div>
            {/* Online/status dot */}
            {hasStatus && (
              <span
                className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--bg-1)]"
                style={{ background: isTemp ? '#FFB547' : '#6DFF99' }}
              />
            )}
          </div>

          {/* Name + username + status */}
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="font-display text-[20px] tracking-[1px] uppercase text-[var(--ink-0)] truncate leading-tight">
              {localProfile.name ?? localProfile.username ?? 'Unknown'}
            </p>
            {localProfile.username && (
              <p className="font-mono text-[10px] text-[var(--ink-3)] mt-0.5">@{localProfile.username}</p>
            )}
            {hasStatus && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: isTemp ? '#FFB547' : '#6DFF99' }} />
                <p className="font-mono text-[10px] text-[var(--ink-1)] truncate">{localProfile.status}</p>
                {isTemp && localProfile.statusExpiresAt && (
                  <span className="font-mono text-[8px] text-[var(--ink-3)] flex-shrink-0">
                    {timeRemaining(localProfile.statusExpiresAt)}
                  </span>
                )}
              </div>
            )}

            {/* Edit profile (own profile) — opens status + showcase in one window */}
            {isOwn && (
              <button
                type="button"
                onClick={() => setModal('edit')}
                className="flex items-center gap-1 mt-2 font-mono text-[9px] font-bold tracking-[0.5px] uppercase text-[var(--ink-3)] hover:text-[var(--accent)] transition-colors"
              >
                <Pencil size={10} /> Edit profile
              </button>
            )}
          </div>

          {/* Stats chip — badges + coins + battle W-L-T */}
          <div className="flex-shrink-0 flex flex-col items-end gap-1.5 pt-0.5">
            <div className="text-right">
              <p className="font-display text-[28px] leading-none" style={{ color: 'var(--accent)' }}>
                {localProfile.badgeCount}
              </p>
              <p className="font-mono text-[8px] text-[var(--ink-3)] tracking-[0.5px]">badges</p>
            </div>
            {(localProfile.coinBalance ?? 0) > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,181,71,0.12)', border: '1px solid rgba(255,181,71,0.25)' }}>
                <span className="text-[11px] leading-none">🪙</span>
                <span className="font-mono text-[10px] font-bold" style={{ color: '#FFB547' }}>
                  {(localProfile.coinBalance ?? 0).toLocaleString()}
                </span>
              </div>
            )}
            <BattleRecordChip record={localProfile.battleRecord} />
          </div>
        </div>

        {/* ── Badge case ── */}
        <BadgeCase
          showcase={localProfile.showcaseBadges}
          allBadges={localProfile.badges}
          isOwn={isOwn}
          onEdit={isOwn ? () => setModal('edit') : undefined}
        />

      </div>

      {/* ── Full badge collection — collapsed by default to keep the tab compact ── */}
      {localProfile.badges.length > 0 && (
        <div className="border-t border-[var(--line)] px-5 py-2.5">
          <button type="button" onClick={() => setShowAll(v => !v)} className="w-full flex items-center justify-between">
            <span className="font-mono text-[8px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)]">
              Full Collection · {localProfile.badgeCount}
            </span>
            <ChevronDown size={12} className="text-[var(--ink-3)] transition-transform" style={{ transform: showAll ? 'rotate(180deg)' : 'none' }} />
          </button>
          {showAll && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {localProfile.badges.slice(0, 12).map(b => (
              <div
                key={b.id}
                title={`${b.label} · Assigned ${fmtBadgeDate(b.earnedAt)}`}
                className="w-9 h-9 flex items-center justify-center"
                style={b.icon.startsWith('/') ? {} : {
                  borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 30%, #181828, #06060E)',
                  boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.9), 0 0 10px rgba(79,195,247,0.2)',
                }}
              >
                {b.icon.startsWith('/') ? (
                  <AutoCropImage src={b.icon} alt={b.label} />
                ) : (
                  <span className="text-[16px] leading-none">{b.icon}</span>
                )}
              </div>
            ))}
            {localProfile.badgeCount > 12 && (
              <span className="font-mono text-[9px] text-[var(--ink-3)] self-center">+{localProfile.badgeCount - 12} more</span>
            )}
          </div>
          )}
        </div>
      )}

      {/* ── Edit profile — status + showcase in one window ── */}
      <AnimatePresence>
        {modal === 'edit' && (
          <EditProfileModal
            status={localProfile.status}
            expiresAt={localProfile.statusExpiresAt}
            badges={localProfile.badges}
            currentShowcase={localProfile.showcaseBadges}
            onSaved={slugs => { setLocalProfile(p => ({ ...p, showcaseBadges: slugs })); refresh(); }}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
