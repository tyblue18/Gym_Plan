'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, X, Check, ChevronRight, MessageCircle } from 'lucide-react';
import { GroupFeed } from '@/components/social/GroupFeed';

interface FriendLite { id: string; name: string | null; username: string | null; photo: string | null }
interface GroupMemberLite { id: string; name: string | null; username: string | null; photo: string | null }
interface GroupData {
  id: string; name: string; ownerId: string; isOwner: boolean; members: GroupMemberLite[];
  lastPost?: { author: string; text: string; at: string } | null;
  postCount?: number;
}

function Avatar({ m, size = 26 }: { m: { name: string | null; username: string | null; photo: string | null }; size?: number }) {
  const label = m.name ?? m.username ?? '?';
  if (m.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.photo} alt="" style={{ width: size, height: size }} className="rounded-full object-cover border border-[var(--line-2)]" />;
  }
  return (
    <span
      className="rounded-full inline-flex items-center justify-center font-mono font-bold text-[var(--accent)] bg-[var(--accent-12)] border border-[var(--accent-24)]"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {label.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * Groups section of the Social tab. Create a roster of friends (they don't need
 * to know each other) to run team battles in later. Phase 1: full CRUD only.
 */
export function Groups({ meId, friends }: { meId: string; friends: FriendLite[] }) {
  const [groups,  setGroups]  = useState<GroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName]       = useState('');
  const [picked, setPicked]   = useState<Set<string>>(new Set());
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/groups', { credentials: 'include' });
      const data = res.ok ? await res.json() as { groups: GroupData[] } : null;
      setGroups(data?.groups ?? []);
    } catch { /* leave as-is */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const togglePick = (id: string) =>
    setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const createGroup = async () => {
    if (!name.trim()) { setError('Give the group a name'); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/groups', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), memberIds: [...picked] }),
      });
      if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? 'Could not create group'); return; }
      setCreating(false); setName(''); setPicked(new Set());
      await refresh();
    } finally { setBusy(false); }
  };

  return (
    <div className="que-card mb-4">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="que-section-label"><span className="dot" style={{ background: 'var(--accent)' }} /> GROUPS</h2>
          <button
            type="button"
            onClick={() => { setCreating(true); setName(''); setPicked(new Set()); setError(''); }}
            className="font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--accent)] border border-[var(--accent)]/50 rounded-sm px-2.5 py-1.5 hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] transition-all flex items-center gap-1"
          >
            <Plus size={12} /> New group
          </button>
        </div>
        <div className="mb-3" />

        {loading ? (
          <p className="font-mono text-[10px] text-[var(--ink-3)] py-2">Loading…</p>
        ) : groups.length === 0 ? (
          <div className="text-center py-6 border border-dashed border-[var(--line-2)] rounded">
            <Users size={20} className="text-[var(--ink-3)] mx-auto mb-2" />
            <p className="font-mono text-[10px] text-[var(--ink-2)] font-bold tracking-[1px] uppercase">No groups yet</p>
            <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1">Create one to run team battles</p>
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map(g => (
              <button key={g.id} type="button" onClick={() => setOpenGroupId(g.id)}
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-2)] p-3 flex items-center gap-3 text-left hover:border-[var(--line-3)] transition-colors">
                  <div className="flex -space-x-2 flex-shrink-0">
                    {g.members.slice(0, 5).map(m => <Avatar key={m.id} m={m} size={28} />)}
                    {g.members.length > 5 && (
                      <span className="w-7 h-7 rounded-full inline-flex items-center justify-center font-mono text-[9px] font-bold text-[var(--ink-2)] bg-[var(--bg-3)] border border-[var(--line-2)]">
                        +{g.members.length - 5}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[12px] font-bold text-[var(--ink-0)] truncate">{g.name}</p>
                    {g.lastPost ? (
                      <p className="font-mono text-[9px] text-[var(--ink-2)] truncate">
                        <span className="font-bold" style={{ color: 'var(--accent)' }}>{g.lastPost.author}</span>
                        {' · '}{g.lastPost.text}
                      </p>
                    ) : (
                      <p className="font-mono text-[9px] text-[var(--ink-3)] truncate">
                        {g.members.length} member{g.members.length === 1 ? '' : 's'}{g.isOwner ? ' · owner' : ''} · tap to open
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {(g.postCount ?? 0) > 0 && (
                      <span className="flex items-center gap-1 font-mono text-[9px] font-bold text-[var(--ink-2)] bg-[var(--bg-3)] border border-[var(--line-2)] rounded-full px-2 py-0.5">
                        <MessageCircle size={10} /> {g.postCount}
                      </span>
                    )}
                    <ChevronRight size={16} className="text-[var(--ink-3)]" />
                  </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Group feed (full-screen) */}
      {openGroupId && (() => {
        const g = groups.find(x => x.id === openGroupId);
        return g ? <GroupFeed group={g} meId={meId} friends={friends} onChanged={refresh}
          onClose={() => setOpenGroupId(null)} /> : null;
      })()}

      {/* Create-group bottom sheet */}
      {creating && (
        <div className="fixed inset-0 z-[450] flex items-end sm:items-center justify-center bg-black/60 px-4" onClick={() => setCreating(false)}>
          <div className="w-full max-w-[400px] rounded-t-2xl sm:rounded-2xl bg-[var(--bg-1)] border border-[var(--line-2)] p-5 mb-0 sm:mb-0"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-[18px] tracking-[1.5px] uppercase text-[var(--ink-0)]">New Group</h3>
              <button type="button" onClick={() => setCreating(false)} className="text-[var(--ink-3)] hover:text-[var(--ink-0)]"><X size={18} /></button>
            </div>

            <p className="font-mono text-[10px] text-[var(--ink-2)] leading-relaxed mb-4">
              Build a group of friends or gym-mates to share progress, challenge each other, and grow together as a community.
            </p>

            <label className="que-label">Group name</label>
            <input type="text" className="que-input mb-4" placeholder="e.g. Gym Bros" value={name} maxLength={40}
              onChange={e => { setName(e.target.value); setError(''); }} />

            <p className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)] mb-2">
              Add friends {picked.size > 0 && `(${picked.size})`}
            </p>
            {friends.length === 0 ? (
              <p className="font-mono text-[10px] text-[var(--ink-3)] mb-4">Add some friends first — they show up here.</p>
            ) : (
              <div className="max-h-[40vh] overflow-y-auto space-y-1 mb-4">
                {friends.map(f => {
                  const on = picked.has(f.id);
                  return (
                    <button key={f.id} type="button" onClick={() => togglePick(f.id)}
                      className={['w-full flex items-center gap-2.5 px-2 py-2 rounded border transition-all',
                        on ? 'border-[var(--accent)] bg-[var(--accent-12)]' : 'border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--line-3)]'].join(' ')}>
                      <Avatar m={f} size={26} />
                      <span className="font-mono text-[11px] text-[var(--ink-1)] flex-1 text-left truncate">{f.name ?? f.username}</span>
                      <span className={['w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0',
                        on ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--line-2)]'].join(' ')}>
                        {on && <Check size={11} className="text-[var(--accent-ink)]" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {error && <p className="font-mono text-[9px] text-[var(--danger)] mb-2">{error}</p>}

            <button type="button" onClick={createGroup} disabled={busy || !name.trim()}
              className="que-btn-primary w-full py-3 disabled:opacity-40">
              {busy ? 'Creating…' : 'Create group'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
