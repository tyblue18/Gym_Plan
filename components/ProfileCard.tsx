'use client';

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Pencil, Clock, Infinity } from 'lucide-react';

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
    return <img src={icon} alt="" style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />;
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

// ── Status modal ───────────────────────────────────────────────────────────────

function StatusModal({ current, expiresAt, onSave, onClose }: {
  current:   string | null;
  expiresAt: string | null;
  onSave:    () => void;
  onClose:   () => void;
}) {
  const [text,     setText]     = useState(current ?? '');
  const [duration, setDuration] = useState<'24h' | 'forever'>(expiresAt ? '24h' : 'forever');
  const [saving,   setSaving]   = useState(false);

  const save = async () => {
    setSaving(true);
    await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: text.trim(), statusDuration: duration }),
    });
    setSaving(false);
    onSave();
    onClose();
  };

  const clear = async () => {
    await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusDuration: 'clear' }),
    });
    onSave();
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-[500] flex items-end md:items-center justify-center backdrop-blur-sm px-0 md:px-3"
      style={{ background: 'rgba(7,8,10,0.9)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="w-full md:max-w-[420px] rounded-t-2xl md:rounded-2xl bg-[var(--bg-1)] overflow-hidden"
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.6)' }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--line)]">
          <h3 className="font-display text-[18px] tracking-[2px] uppercase text-[var(--ink-0)]">Set Status</h3>
          <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="que-label">What's your status?</label>
            <input
              type="text"
              className="que-input"
              placeholder="e.g. On a cut · Bulk szn 💪 · Rest day"
              value={text}
              maxLength={60}
              onChange={e => setText(e.target.value)}
              autoFocus
            />
            <p className="font-mono text-[8px] text-[var(--ink-3)] mt-1 text-right">{text.length}/60</p>
          </div>

          {/* Duration */}
          <div>
            <label className="que-label">Duration</label>
            <div className="flex gap-2">
              {([['24h', '24 Hours', Clock], ['forever', 'Indefinite', Infinity]] as const).map(([val, label, Icon]) => (
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

          <div className="flex gap-2">
            {current && (
              <button type="button" onClick={clear} className="flex-1 que-btn-ghost py-3.5 text-[var(--danger)]">
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving || !text.trim()}
              className="flex-1 que-btn-primary py-3.5 disabled:opacity-40"
            >
              {saving ? '…' : 'Save'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Showcase editor ────────────────────────────────────────────────────────────

function ShowcaseEditor({ badges, current, onSave, onClose }: {
  badges:  BadgeInfo[];
  current: string[];
  onSave:  (slugs: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(current.slice(0, 8));
  const [saving,   setSaving]   = useState(false);

  const toggle = (slug: string) => {
    setSelected(prev => {
      if (prev.includes(slug)) return prev.filter(s => s !== slug);
      if (prev.length >= 8) return prev; // max 8
      return [...prev, slug];
    });
  };

  const save = async () => {
    setSaving(true);
    await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showcaseBadges: selected }),
    });
    setSaving(false);
    onSave(selected);
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-[500] flex items-end md:items-center justify-center backdrop-blur-sm px-0 md:px-3"
      style={{ background: 'rgba(7,8,10,0.9)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="w-full md:max-w-[480px] h-[80dvh] flex flex-col rounded-t-2xl md:rounded-2xl bg-[var(--bg-1)] overflow-hidden"
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.6)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--line)] flex-shrink-0">
          <div>
            <h3 className="font-display text-[18px] tracking-[2px] uppercase text-[var(--ink-0)]">Edit Showcase</h3>
            <p className="font-mono text-[9px] text-[var(--ink-3)] mt-0.5">
              Select up to 8 badges · {selected.length}/8 chosen
            </p>
          </div>
          <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors"><X size={20} /></button>
        </div>

        {/* Preview strip */}
        <div className="px-5 py-3 border-b border-[var(--line)] flex-shrink-0 flex gap-2">
          {Array.from({ length: 8 }).map((_, i) => {
            const slug  = selected[i];
            const badge = slug ? badges.find(b => b.slug === slug) : null;
            return (
              <div key={i}
                className="flex-1 aspect-square flex items-center justify-center"
                style={badge?.icon.startsWith('/') ? {} : {
                  borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 35%, #14141F, #080810)',
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)',
                }}
              >
                {badge ? (
                  badge.icon.startsWith('/') ? (
                    <img src={badge.icon} alt={badge.label} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[11px] leading-none">{badge.icon}</span>
                  )
                ) : (
                  <span className="text-[var(--ink-4)] text-[10px]">·</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Badge list */}
        <div className="flex-1 overflow-y-auto p-4">
          {badges.length === 0 ? (
            <div className="text-center py-10">
              <p className="font-mono text-[10px] text-[var(--ink-3)]">Earn badges first by logging lifts and hitting calorie goals.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {badges.map(badge => {
                const idx = selected.indexOf(badge.slug);
                const inShowcase = idx !== -1;
                const atMax = selected.length >= 8 && !inShowcase;
                return (
                  <button
                    key={badge.id}
                    type="button"
                    onClick={() => !atMax && toggle(badge.slug)}
                    disabled={atMax}
                    className={[
                      'relative flex flex-col items-center text-center p-3 rounded border transition-all',
                      inShowcase
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                        : atMax
                          ? 'border-[var(--line)] bg-[var(--bg-2)] opacity-40 cursor-not-allowed'
                          : 'border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--accent)]/60 active:border-[var(--accent)]'
                    ].join(' ')}
                  >
                    {/* Slot number badge */}
                    {inShowcase && (
                      <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full text-[8px] font-bold font-mono flex items-center justify-center"
                        style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
                        {idx + 1}
                      </span>
                    )}
                    <BadgeIcon icon={badge.icon} size={36} />
                    <p className="font-mono text-[8px] font-bold text-[var(--ink-0)] leading-tight">{badge.label}</p>
                    <p className="font-mono text-[7px] text-[var(--ink-3)] capitalize mt-0.5">{badge.category}</p>
                    <p className="font-mono text-[6px] text-[var(--ink-3)] mt-0.5 opacity-70">{fmtBadgeDate(badge.earnedAt)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 pt-3 border-t border-[var(--line)] flex-shrink-0">
          <button type="button" onClick={save} disabled={saving}
            className="que-btn-primary w-full py-3.5 disabled:opacity-40">
            {saving ? '…' : 'Save Showcase'}
          </button>
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
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

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
      <div
        className="relative rounded-xl overflow-hidden px-4 py-5"
        style={{
          background: 'linear-gradient(160deg, #0C0C1C 0%, #070710 100%)',
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {/* Red trim */}
        <div className="absolute top-0 left-0 right-0 h-2 rounded-t-xl"
          style={{ background: 'linear-gradient(90deg, #CC1100, #EE2200, #CC1100)' }} />

        {/* Label */}
        <p className="font-mono text-[8px] font-bold tracking-[2.5px] uppercase text-center mb-4 mt-1"
          style={{ color: 'rgba(255,255,255,0.25)' }}>
          Gym Badges
        </p>

        {/* 4 × 2 badge grid */}
        <div className="grid grid-cols-4 gap-3">
          {slots.map((badge, i) => (
            <motion.button
              key={i}
              type="button"
              onClick={isOwn ? onEdit : undefined}
              disabled={!isOwn}
              whileTap={isOwn ? { scale: 0.92 } : undefined}
              onMouseEnter={() => badge && setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="aspect-square flex items-center justify-center relative"
              style={badge?.icon.startsWith('/') ? {} : {
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 30%, #181828, #06060E)',
                boxShadow: badge
                  ? `inset 0 2px 6px rgba(0,0,0,0.9), inset 0 -1px 2px rgba(255,255,255,0.03), 0 0 12px ${glowColors[badge.category] ?? 'rgba(255,255,255,0.2)'}, 0 1px 0 rgba(255,255,255,0.04)`
                  : 'inset 0 2px 8px rgba(0,0,0,0.95), inset 0 -1px 2px rgba(255,255,255,0.02), 0 1px 0 rgba(255,255,255,0.02)',
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
                    <img src={badge.icon} alt={badge.label} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[22px] leading-none">{badge.icon}</span>
                  )}
                </motion.div>
              ) : (
                <span className="text-[16px] leading-none select-none" style={{ color: 'rgba(255,255,255,0.08)' }}>
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
              <p className="font-mono text-[9px] font-bold text-center leading-tight" style={{ color: 'rgba(255,255,255,0.75)' }}>
                {hoveredBadge.label}
              </p>
              <p className="font-mono text-[8px] text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Assigned {fmtBadgeDate(hoveredBadge.earnedAt)}
              </p>
            </motion.div>
          ) : isOwn ? (
            <p className="font-mono text-[7px] text-center tracking-[1px] uppercase" style={{ color: 'rgba(255,255,255,0.18)' }}>
              Tap to edit · hover to inspect
            </p>
          ) : null}
        </div>
      </div>
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
  const [modal, setModal] = useState<'status' | 'showcase' | null>(null);

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

            {/* Edit status button (own profile) */}
            {isOwn && (
              <button
                type="button"
                onClick={() => setModal('status')}
                className="flex items-center gap-1 mt-2 font-mono text-[9px] font-bold tracking-[0.5px] uppercase text-[var(--ink-3)] hover:text-[var(--accent)] transition-colors"
              >
                <Pencil size={10} />
                {hasStatus ? 'Edit status' : 'Set status'}
              </button>
            )}
          </div>

          {/* Stats chip — badges + coins */}
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
          </div>
        </div>

        {/* ── Badge case ── */}
        <BadgeCase
          showcase={localProfile.showcaseBadges}
          allBadges={localProfile.badges}
          isOwn={isOwn}
          onEdit={isOwn ? () => setModal('showcase') : undefined}
        />

        {/* Edit showcase button */}
        {isOwn && (
          <button
            type="button"
            onClick={() => setModal('showcase')}
            className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--ink-3)] hover:text-[var(--accent)] border border-[var(--line)] hover:border-[var(--accent)]/40 rounded transition-all"
          >
            <Pencil size={10} /> Edit Badge Showcase
          </button>
        )}
      </div>

      {/* ── Full badge collection (if any beyond showcase) ── */}
      {localProfile.badges.length > 0 && (
        <div className="border-t border-[var(--line)] px-5 py-3">
          <p className="font-mono text-[8px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)] mb-2">
            Full Collection · {localProfile.badgeCount}
          </p>
          <div className="flex flex-wrap gap-1.5">
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
                  <img src={b.icon} alt={b.label} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-[16px] leading-none">{b.icon}</span>
                )}
              </div>
            ))}
            {localProfile.badgeCount > 12 && (
              <span className="font-mono text-[9px] text-[var(--ink-3)] self-center">+{localProfile.badgeCount - 12} more</span>
            )}
          </div>
        </div>
      )}

      {/* ── Modals — only one open at a time ── */}
      <AnimatePresence>
        {modal === 'status' && (
          <StatusModal
            current={localProfile.status}
            expiresAt={localProfile.statusExpiresAt}
            onSave={refresh}
            onClose={() => setModal(null)}
          />
        )}
        {modal === 'showcase' && (
          <ShowcaseEditor
            badges={localProfile.badges}
            current={localProfile.showcaseBadges}
            onSave={slugs => { setLocalProfile(p => ({ ...p, showcaseBadges: slugs })); refresh(); }}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
