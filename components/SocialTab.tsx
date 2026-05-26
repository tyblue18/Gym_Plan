'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion }                   from 'framer-motion';
import { Users, UserPlus, X, Check, Swords }         from 'lucide-react';
import Lottie                                        from 'lottie-react';
import ProfileCard, { type PublicProfile }           from '@/components/ProfileCard';
import anim1 from '@/public/loading1_animation.json';
import anim2 from '@/public/loading2_animation.json';
import anim3 from '@/public/loading3_animation.json';

const LOADING_ANIMS = [anim1, anim2, anim3];

// ── Types ──────────────────────────────────────────────────────────────────────

interface FriendData {
  id:           string;
  friendshipId: string;
  name:         string | null;
  username:     string | null;
  badgeCount:   number;
  photo:        string | null;
  status:       string | null;
}

interface PendingData {
  id:           string;
  friendshipId: string;
  name:         string | null;
  username:     string | null;
}

interface ChallengeData {
  id:         string;
  wager:      number;
  status:     string;
  winnerId:   string | null;
  resolvedAt: string | null;
  createdAt:  string;
  challenger: { id: string; name: string | null; username: string | null };
  challengee: { id: string; name: string | null; username: string | null };
}

// ── Challenge modal ────────────────────────────────────────────────────────────

function ChallengeModal({ friend, myBalance, onClose, onSent }: {
  friend:    FriendData;
  myBalance: number;
  onClose:   () => void;
  onSent:    () => void;
}) {
  const [wager,   setWager]   = useState(Math.min(3, Math.max(1, myBalance)));
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState('');
  const max = Math.max(0, myBalance);
  const canSend = wager >= 1 && wager <= max;

  const send = async () => {
    setSending(true); setError('');
    const res  = await fetch('/api/challenges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId: friend.id, wager }),
    });
    const data = await res.json();
    setSending(false);
    if (res.ok) { onSent(); onClose(); }
    else        { setError(data.error ?? 'Failed to send challenge'); }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[400] flex items-end md:items-center justify-center backdrop-blur-sm px-0 md:px-3"
      style={{ background: 'rgba(7,8,10,0.92)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="w-full md:max-w-[400px] rounded-t-2xl md:rounded-2xl bg-[var(--bg-1)] overflow-hidden"
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{ boxShadow: '0 0 0 1px rgba(255,181,71,0.4), 0 -2px 0 0 #FFB547, 0 40px 80px rgba(0,0,0,0.7)' }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-2">
            <Swords size={18} style={{ color: '#FFB547' }} />
            <h3 className="font-display text-[18px] tracking-[2px] uppercase text-[var(--ink-0)]">Challenge</h3>
          </div>
          <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Opponent */}
          <div className="flex items-center gap-3 rounded border border-[var(--line)] bg-[var(--bg-2)] px-4 py-3">
            <div className="w-9 h-9 rounded-full bg-[var(--bg-3)] border border-[var(--line-2)] flex items-center justify-center flex-shrink-0 overflow-hidden">
              {friend.photo ? (
                <img src={friend.photo} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="font-display text-[14px] text-[var(--ink-2)]">
                  {(friend.name ?? friend.username ?? '?')[0].toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <p className="font-mono text-[12px] font-bold text-[var(--ink-0)]">{friend.name ?? friend.username}</p>
              {friend.username && <p className="font-mono text-[9px] text-[var(--ink-3)]">@{friend.username} · {friend.badgeCount} badges</p>}
            </div>
          </div>

          <div className="rounded border border-[var(--line-2)] bg-[var(--bg-2)] p-3">
            <p className="font-mono text-[9px] text-[var(--ink-2)] leading-relaxed">
              🏅 Whoever has <strong className="text-[var(--ink-0)]">more total badges</strong> wins.<br />
              Winner takes both wagers. Tie = refund.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)]">Your Wager</label>
              <span className="font-mono text-[9px] text-[var(--ink-3)]">Balance: {myBalance} 🪙</span>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setWager(w => Math.max(1, w - 1))}
                className="w-11 h-11 flex items-center justify-center rounded-sm border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-0)] text-xl hover:border-[var(--accent)] transition-all">−</button>
              <div className="flex-1 text-center">
                <span className="font-display tabular text-[36px] leading-none" style={{ color: '#FFB547' }}>{wager}</span>
                <span className="font-mono text-[11px] text-[var(--ink-3)] ml-1.5">🪙</span>
              </div>
              <button type="button" onClick={() => setWager(w => Math.min(max, w + 1))}
                className="w-11 h-11 flex items-center justify-center rounded-sm border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-0)] text-xl hover:border-[var(--accent)] transition-all">+</button>
            </div>
            {myBalance === 0 && (
              <p className="font-mono text-[9px] text-[var(--warn)] mt-2 text-center">No coins — hit your calorie goal to earn some!</p>
            )}
          </div>

          {error && <p className="font-mono text-[9px] text-[var(--danger)]">{error}</p>}

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 que-btn-ghost py-3.5">Cancel</button>
            <button type="button" onClick={send} disabled={!canSend || sending}
              className="flex-1 py-3.5 rounded font-mono text-[10px] font-bold tracking-[1px] uppercase transition-all disabled:opacity-40"
              style={{ background: '#FFB547', color: '#07080A', boxShadow: canSend ? '0 0 0 1px #FFB547, 0 0 20px rgba(255,181,71,0.3)' : 'none' }}>
              {sending ? '…' : `Challenge for ${wager} 🪙`}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Username setup ────────────────────────────────────────────────────────────

function UsernameSetup({ onSaved }: { onSaved: () => void }) {
  const [val,    setVal]    = useState('');
  const [error,  setError]  = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const username = val.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) { setError('3–20 chars · letters, numbers, underscores only'); return; }
    setSaving(true); setError('');
    const res  = await fetch('/api/user', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) { onSaved(); }
    else        { setError(data.error ?? 'Username taken'); }
  };

  return (
    <div className="que-card p-5 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="block w-2 h-2 rounded-full bg-[var(--accent)]" />
        <p className="font-mono text-[10px] font-bold tracking-[2px] uppercase text-[var(--ink-1)]">Set Your Username</p>
      </div>
      <p className="font-mono text-[10px] text-[var(--ink-3)] mb-3">Choose a unique handle so friends can find and challenge you.</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-[var(--ink-3)]">@</span>
          <input type="text" className="que-input pl-7" placeholder="your_username" value={val} maxLength={20}
            onChange={e => { setVal(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && save()} />
        </div>
        <button type="button" onClick={save} disabled={saving || !val.trim()}
          className="que-btn-primary px-5 disabled:opacity-40 flex-shrink-0">
          {saving ? '…' : 'Save'}
        </button>
      </div>
      {error && <p className="font-mono text-[9px] text-[var(--danger)] mt-2">{error}</p>}
    </div>
  );
}

// ── Challenge result ──────────────────────────────────────────────────────────

function ChallengeResult({ challenge, myId }: { challenge: ChallengeData; myId: string }) {
  if (challenge.status === 'cancelled') return <span className="font-mono text-[9px] text-[var(--ink-3)]">Declined</span>;
  if (!challenge.winnerId) return <span className="font-mono text-[9px] text-[var(--ink-3)]">Tie · refunded</span>;
  const won = challenge.winnerId === myId;
  return (
    <span className="font-mono text-[9px] font-bold" style={{ color: won ? 'var(--positive)' : 'var(--danger)' }}>
      {won ? `+${challenge.wager} 🪙 Won` : `-${challenge.wager} 🪙 Lost`}
    </span>
  );
}

// ── Friend profile sheet ──────────────────────────────────────────────────────

function FriendProfileSheet({ userId, onClose, onChallenge }: {
  userId:      string;
  onClose:     () => void;
  onChallenge: () => void;
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    fetch(`/api/user/${userId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setProfile(d));
  }, [userId]);

  return (
    <motion.div
      className="fixed inset-0 z-[300] flex items-end md:items-center justify-center backdrop-blur-sm px-0 md:px-3"
      style={{ background: 'rgba(7,8,10,0.88)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="w-full md:max-w-[480px] max-h-[88dvh] flex flex-col rounded-t-2xl md:rounded-2xl bg-[var(--bg-1)] overflow-hidden"
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{ boxShadow: '0 0 0 1px var(--line-2), 0 -2px 0 0 var(--accent), 0 40px 80px rgba(0,0,0,0.6)' }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[var(--line)] flex-shrink-0">
          <p className="font-mono text-[9px] font-bold tracking-[2px] uppercase text-[var(--ink-3)]">Profile</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onChallenge}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border font-mono text-[9px] font-bold uppercase transition-all"
              style={{ borderColor: 'rgba(255,181,71,0.4)', color: '#FFB547' }}>
              <Swords size={11} /> Battle
            </button>
            <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {profile ? (
            <ProfileCard profile={profile} isOwn={false} />
          ) : (
            <div className="py-10 text-center">
              <p className="font-mono text-[10px] text-[var(--ink-3)] animate-pulse tracking-[1px] uppercase">Loading…</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main SocialTab ────────────────────────────────────────────────────────────

export default function SocialTab() {
  const [ownProfile,    setOwnProfile]    = useState<PublicProfile | null>(null);
  const [friends,       setFriends]       = useState<FriendData[]>([]);
  const [incoming,      setIncoming]      = useState<PendingData[]>([]);
  const [outgoing,      setOutgoing]      = useState<PendingData[]>([]);
  const [inChallenge,   setInChallenge]   = useState<ChallengeData[]>([]);
  const [sentChallenge, setSentChallenge] = useState<ChallengeData[]>([]);
  const [resolved,      setResolved]      = useState<ChallengeData[]>([]);
  const [balance,       setBalance]       = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    try { return (JSON.parse(localStorage.getItem('queCalorieCoins') ?? 'null') as { total?: number } | null)?.total ?? 0; }
    catch { return 0; }
  });
  const [addQuery,      setAddQuery]      = useState('');
  const [addStatus,     setAddStatus]     = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading,       setLoading]       = useState(true);
  const loadingAnim = useRef((() => {
    try {
      const idx = parseInt(localStorage.getItem('queSocialAnimIdx') ?? '0', 10) % LOADING_ANIMS.length;
      localStorage.setItem('queSocialAnimIdx', String((idx + 1) % LOADING_ANIMS.length));
      return LOADING_ANIMS[idx];
    } catch { return LOADING_ANIMS[0]; }
  })());
  const [viewFriendId,  setViewFriendId]  = useState<string | null>(null);
  const [challenging,   setChallenging]   = useState<FriendData | null>(null);
  const [responding,    setResponding]    = useState<string | null>(null);
  const [resolving,     setResolving]     = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [userRes, friendRes, challengeRes] = await Promise.all([
      fetch('/api/user'),
      fetch('/api/friends'),
      fetch('/api/challenges'),
    ]);

    if (userRes.ok) {
      const data = await userRes.json() as PublicProfile;
      // Client coin ledger may be ahead of the DB (coins are awarded locally
      // on each calorie goal hit; the DB only syncs via the one-time migration).
      // Show whichever balance is higher so the card matches the header counter.
      try {
        const localCoins = JSON.parse(localStorage.getItem('queCalorieCoins') ?? 'null') as { total?: number } | null;
        const localTotal = localCoins?.total ?? 0;
        const dbTotal    = data.coinBalance ?? 0;
        setOwnProfile({ ...data, coinBalance: Math.max(dbTotal, localTotal) });
      } catch {
        setOwnProfile(data);
      }
    }
    try { setBalance((JSON.parse(localStorage.getItem('queCalorieCoins') ?? 'null') as { total?: number } | null)?.total ?? 0); } catch { /* ignore */ }
    if (friendRes.ok) {
      const d = await friendRes.json();
      setFriends(d.friends   ?? []);
      setIncoming(d.incoming ?? []);
      setOutgoing(d.outgoing ?? []);
    }
    if (challengeRes.ok) {
      const d = await challengeRes.json();
      setInChallenge(d.incoming  ?? []);
      setSentChallenge(d.sent    ?? []);
      setResolved(d.resolved     ?? []);
    }
    setLoading(false);
  }, []);

  // Refresh badge collection whenever the sync engine reports a revocation.
  useEffect(() => {
    const onRevoked = () => void refresh();
    window.addEventListener('que-badges-revoked', onRevoked);
    return () => window.removeEventListener('que-badges-revoked', onRevoked);
  }, [refresh]);

  // Also refresh when new badges are earned so the collection shows them immediately.
  useEffect(() => {
    const onEarned = () => void refresh();
    window.addEventListener('que-badge-earned', onEarned);
    return () => window.removeEventListener('que-badge-earned', onEarned);
  }, [refresh]);

  useEffect(() => {
    const importCoins = async () => {
      if (typeof window === 'undefined' || localStorage.getItem('queCoinsMigrated')) return;
      try {
        const stored = JSON.parse(localStorage.getItem('queCalorieCoins') ?? 'null');
        const total  = (stored?.total ?? 0) as number;
        if (total === 0) { localStorage.setItem('queCoinsMigrated', '1'); return; }
        const res = await fetch('/api/wallet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ balance: total }),
        });
        if (res.ok) localStorage.setItem('queCoinsMigrated', '1');
      } catch { /* retry next visit */ }
    };
    // Run coin migration and data fetch in parallel — migration doesn't affect fetch results
    void importCoins();
    void refresh();
  }, [refresh]);

  const sendRequest = async () => {
    const q = addQuery.trim().toLowerCase();
    if (!q) return;
    setAddStatus(null);
    const res  = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: q }),
    });
    const data = await res.json();
    setAddStatus({ ok: res.ok, msg: res.ok ? 'Request sent!' : (data.error ?? 'Error') });
    if (res.ok) { setAddQuery(''); void refresh(); }
  };

  const respondFriend = async (friendshipId: string, accept: boolean) => {
    setResponding(friendshipId);
    await fetch('/api/friends/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendshipId, accept }),
    });
    setResponding(null);
    void refresh();
  };

  const removeFriend = async (friendshipId: string) => {
    await fetch('/api/friends', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendshipId }),
    });
    void refresh();
  };

  const respondChallenge = async (challengeId: string, action: 'accept' | 'decline') => {
    setResolving(challengeId);
    await fetch(`/api/challenges/${challengeId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setResolving(null);
    void refresh();
  };

  const today   = new Date();
  const dateTag = `${today.getMonth() + 1}/${today.getDate()}`;
  const totalNotifs = incoming.length + inChallenge.length;
  const hasUsername = !!ownProfile?.username;

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 pb-28 lg:py-8">

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <span className="block w-2 h-2 rounded-full bg-[var(--accent)]" style={{ boxShadow: '0 0 8px var(--accent-40)' }} />
        <span className="font-mono text-[11px] font-bold tabular tracking-[2px] uppercase text-[var(--ink-1)]">
          Social · {dateTag}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {totalNotifs > 0 && (
            <span className="w-5 h-5 rounded-full text-[9px] font-bold font-mono flex items-center justify-center"
              style={{ background: 'var(--danger)', color: '#fff' }}>{totalNotifs}</span>
          )}
          <span className="font-mono text-[10px] font-bold flex items-center gap-1" style={{ color: '#FFB547' }}>
            🪙 {balance}
          </span>
          {hasUsername && <span className="font-mono text-[10px] text-[var(--ink-3)]">@{ownProfile?.username}</span>}
        </div>
      </div>

      {/* Username setup */}
      {!loading && !hasUsername && <UsernameSetup onSaved={refresh} />}

      {/* ── Loading animation ── */}
      <AnimatePresence>
        {loading && (
          <motion.div
            className="flex items-center justify-center py-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          >
            <Lottie animationData={loadingAnim.current} loop autoplay className="w-44 h-44" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content — fades up as loader fades out (overlapping crossfade) ── */}
      <AnimatePresence>
        {!loading && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >

      {/* ── YOUR PROFILE CARD ─────────────────────────────────────────────── */}
      {ownProfile && (
        <div className="mb-4">
          <ProfileCard profile={ownProfile} isOwn onRefresh={refresh} />
        </div>
      )}

      {/* ── BATTLES ──────────────────────────────────────────────────────── */}
      {(inChallenge.length > 0 || sentChallenge.length > 0 || resolved.length > 0) && (
        <div className="que-card mb-4">
          <div className="px-5 pt-5 pb-3">
            <h2 className="que-section-label">
              <span className="dot" style={{ background: '#FFB547' }} />
              BATTLES
            </h2>

            {inChallenge.map(c => (
              <div key={c.id} className="flex items-center gap-3 rounded border border-[rgba(255,181,71,0.35)] bg-[rgba(255,181,71,0.06)] px-3 py-3 mb-2">
                <Swords size={16} style={{ color: '#FFB547', flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[11px] font-bold text-[var(--ink-0)] truncate">
                    {c.challenger.name ?? c.challenger.username ?? 'Unknown'}
                  </p>
                  <p className="font-mono text-[9px] text-[var(--ink-3)]">Wagering {c.wager} 🪙</p>
                </div>
                <button type="button" onClick={() => respondChallenge(c.id, 'accept')} disabled={resolving === c.id}
                  className="w-9 h-9 flex items-center justify-center rounded border border-[var(--positive)]/50 text-[var(--positive)] hover:bg-[var(--positive)]/15 transition-all disabled:opacity-40">
                  {resolving === c.id ? '…' : <Check size={15} />}
                </button>
                <button type="button" onClick={() => respondChallenge(c.id, 'decline')} disabled={resolving === c.id}
                  className="w-9 h-9 flex items-center justify-center rounded border border-[var(--line-2)] text-[var(--ink-3)] hover:text-[var(--danger)] transition-all disabled:opacity-40">
                  <X size={15} />
                </button>
              </div>
            ))}

            {sentChallenge.map(c => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded border border-[var(--line)] bg-[var(--bg-2)] mb-2">
                <Swords size={14} className="text-[var(--ink-3)] flex-shrink-0" />
                <p className="flex-1 font-mono text-[10px] text-[var(--ink-2)] truncate">
                  vs @{c.challengee.username ?? 'unknown'} · {c.wager} 🪙 <span className="text-[var(--ink-3)]">· pending</span>
                </p>
              </div>
            ))}

            {resolved.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <p className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)] mb-2">Recent Results</p>
                {resolved.map(c => {
                  const myId     = ownProfile?.id ?? '';
                  const isSender = c.challenger.id === myId;
                  const opponent = isSender ? c.challengee : c.challenger;
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded border border-[var(--line)] bg-[var(--bg-2)]">
                      <span className="font-mono text-[12px]">
                        {!c.winnerId ? '🤝' : c.winnerId === myId ? '🏆' : '💀'}
                      </span>
                      <p className="flex-1 font-mono text-[10px] text-[var(--ink-2)] truncate">
                        vs @{opponent.username ?? opponent.name ?? 'unknown'}
                      </p>
                      <ChallengeResult challenge={c} myId={myId} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── FRIENDS ──────────────────────────────────────────────────────── */}
      <div className="que-card">
        <div className="px-5 pt-5 pb-2">
          <h2 className="que-section-label">
            <span className="dot" />
            FRIENDS
          </h2>

          <div className="mb-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-[var(--ink-3)]">@</span>
                <input type="text" className="que-input pl-7" placeholder="username" value={addQuery} disabled={!hasUsername}
                  onChange={e => { setAddQuery(e.target.value); setAddStatus(null); }}
                  onKeyDown={e => e.key === 'Enter' && sendRequest()} />
              </div>
              <button type="button" onClick={sendRequest} disabled={!addQuery.trim() || !hasUsername}
                className="que-btn-primary px-4 flex-shrink-0 disabled:opacity-40 flex items-center gap-1.5">
                <UserPlus size={14} /> Add
              </button>
            </div>
            {addStatus && (
              <p className={['font-mono text-[9px] mt-1.5', addStatus.ok ? 'text-[var(--positive)]' : 'text-[var(--danger)]'].join(' ')}>
                {addStatus.msg}
              </p>
            )}
            {!hasUsername && <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1.5">Set your username above to add friends.</p>}
          </div>

          {/* Incoming friend requests */}
          {incoming.length > 0 && (
            <div className="mb-4">
              <p className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)] mb-2">Requests ({incoming.length})</p>
              <div className="space-y-2">
                {incoming.map(req => (
                  <div key={req.friendshipId} className="flex items-center gap-3 rounded border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-[11px] font-bold text-[var(--ink-0)] truncate">{req.name ?? req.username ?? 'Unknown'}</p>
                      {req.username && <p className="font-mono text-[9px] text-[var(--ink-3)]">@{req.username}</p>}
                    </div>
                    <button type="button" onClick={() => respondFriend(req.friendshipId, true)} disabled={responding === req.friendshipId}
                      className="w-9 h-9 flex items-center justify-center rounded border border-[var(--positive)]/50 text-[var(--positive)] hover:bg-[var(--positive)]/15 transition-all disabled:opacity-40">
                      {responding === req.friendshipId ? '…' : <Check size={15} />}
                    </button>
                    <button type="button" onClick={() => respondFriend(req.friendshipId, false)} disabled={responding === req.friendshipId}
                      className="w-9 h-9 flex items-center justify-center rounded border border-[var(--line-2)] text-[var(--ink-3)] hover:text-[var(--danger)] transition-all disabled:opacity-40">
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outgoing */}
          {outgoing.length > 0 && (
            <div className="mb-4">
              <p className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)] mb-2">Sent ({outgoing.length})</p>
              {outgoing.map(req => (
                <div key={req.friendshipId} className="flex items-center gap-3 px-3 py-2 rounded border border-[var(--line)] bg-[var(--bg-2)] mb-1.5">
                  <p className="flex-1 font-mono text-[10px] text-[var(--ink-2)] truncate">
                    @{req.username ?? 'unknown'} <span className="text-[var(--ink-3)]">· pending</span>
                  </p>
                  <button type="button" onClick={() => removeFriend(req.friendshipId)}
                    className="text-[var(--ink-3)] hover:text-[var(--danger)] transition-colors p-1"><X size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {friends.length === 0 && !loading ? (
          <div className="px-5 pb-5">
            <div className="text-center py-8 border border-dashed border-[var(--line-2)] rounded">
              <Users size={24} className="text-[var(--ink-3)] mx-auto mb-2" />
              <p className="font-mono text-[10px] text-[var(--ink-2)] font-bold tracking-[1px] uppercase">No friends yet</p>
              <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1">Add a friend by username above</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {friends.map(friend => (
              <div key={friend.friendshipId} className="flex items-center gap-3 px-5 py-3.5">
                <button type="button" onClick={() => setViewFriendId(friend.id)}
                  className="w-10 h-10 rounded-full bg-[var(--bg-3)] border border-[var(--line-2)] flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {friend.photo ? (
                    <img src={friend.photo} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-display text-[15px] text-[var(--ink-2)]">
                      {(friend.name ?? friend.username ?? '?')[0].toUpperCase()}
                    </span>
                  )}
                </button>
                <button type="button" onClick={() => setViewFriendId(friend.id)} className="flex-1 min-w-0 text-left">
                  <p className="font-mono text-[12px] font-bold text-[var(--ink-0)] truncate">{friend.name ?? friend.username ?? 'Unknown'}</p>
                  {friend.status ? (
                    <p className="font-mono text-[9px] text-[var(--accent)] truncate">{friend.status}</p>
                  ) : (
                    <p className="font-mono text-[9px] text-[var(--ink-3)]">
                      {friend.username ? `@${friend.username} · ` : ''}{friend.badgeCount} badge{friend.badgeCount !== 1 ? 's' : ''}
                    </p>
                  )}
                  {friend.status && friend.username && (
                    <p className="font-mono text-[8px] text-[var(--ink-3)]">
                      @{friend.username} · {friend.badgeCount} badge{friend.badgeCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </button>
                <button type="button" onClick={() => setChallenging(friend)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-sm border font-mono text-[9px] font-bold tracking-[0.5px] uppercase transition-all"
                  style={{ borderColor: 'rgba(255,181,71,0.4)', color: '#FFB547' }}>
                  <Swords size={12} /> Battle
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modals ── */}
      <AnimatePresence>
        {viewFriendId && (() => {
          const friend = friends.find(f => f.id === viewFriendId);
          return (
            <FriendProfileSheet
              key={viewFriendId}
              userId={viewFriendId}
              onClose={() => setViewFriendId(null)}
              onChallenge={() => {
                setViewFriendId(null);
                if (friend) setChallenging(friend);
              }}
            />
          );
        })()}
        {challenging && (
          <ChallengeModal
            friend={challenging}
            myBalance={balance}
            onClose={() => setChallenging(null)}
            onSent={refresh}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
