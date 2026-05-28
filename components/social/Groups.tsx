'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Check, ChevronRight, MessageCircle, Zap } from 'lucide-react';
import { GroupFeed } from '@/components/social/GroupFeed';

interface FriendLite { id: string; name: string | null; username: string | null; photo: string | null }
interface GroupMemberLite { id: string; name: string | null; username: string | null; photo: string | null }
interface GroupData {
  id: string; name: string; ownerId: string; isOwner: boolean; members: GroupMemberLite[];
  description?: string | null;
  createdAt?: string;
  lastPost?: { author: string; text: string; at: string } | null;
  postCount?: number;
}

function Avatar({ m, size = 26, ring = false }: { m: { name: string | null; username: string | null; photo: string | null }; size?: number; ring?: boolean }) {
  const label = m.name ?? m.username ?? '?';
  // `ring` = thick bg-colored border for the overlapping group stack.
  const border = ring ? 'border-2 border-[var(--bg-2)]' : 'border border-[var(--line-2)]';
  if (m.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.photo} alt="" style={{ width: size, height: size }} className={`rounded-full object-cover ${border}`} />;
  }
  return (
    <span
      className={`rounded-full inline-flex items-center justify-center font-mono font-bold text-[var(--accent)] bg-[var(--accent-12)] ${ring ? 'border-2 border-[var(--bg-2)]' : 'border border-[var(--accent-24)]'}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {label.charAt(0).toUpperCase()}
    </span>
  );
}

/** Compact relative-time label for the group activity line ("2h", "1d", "3w"). */
function ago(iso: string | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60)       return 'now';
  const m = s / 60; if (m < 60) return `${Math.floor(m)}m`;
  const h = m / 60; if (h < 24) return `${Math.floor(h)}h`;
  const d = h / 24; if (d < 7)  return `${Math.floor(d)}d`;
  return `${Math.floor(d / 7)}w`;
}

/** Dashed "Start a group" call-to-action (Activity-forward layout). */
function NewGroupCTA({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3.5 rounded-2xl border border-dashed border-[var(--line-3)] p-4 text-left hover:border-[var(--accent)] hover:bg-[var(--accent-12)] transition-all"
    >
      <span className="w-11 h-11 rounded-xl bg-[var(--accent-12)] text-[var(--accent)] flex items-center justify-center flex-shrink-0">
        <Plus size={20} />
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-[13px] font-bold tracking-[0.5px] text-[var(--ink-0)]">Start a group</span>
        <span className="block font-mono text-[11px] text-[var(--ink-2)] mt-0.5">Train with friends · share daily · run battles</span>
      </span>
    </button>
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
  const [desc, setDesc]       = useState('');
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
        body: JSON.stringify({ name: name.trim(), description: desc.trim() || undefined, memberIds: [...picked] }),
      });
      if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? 'Could not create group'); return; }
      setCreating(false); setName(''); setDesc(''); setPicked(new Set());
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
          <NewGroupCTA onClick={() => { setCreating(true); setName(''); setPicked(new Set()); setError(''); }} />
        ) : (
          <div className="space-y-3">
            {groups.map(g => {
              const note = g.description?.trim() || `${g.members.length} member${g.members.length === 1 ? '' : 's'}`;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setOpenGroupId(g.id)}
                  className="w-full text-left rounded-2xl border border-[var(--line-2)] bg-[var(--bg-2)] p-4 transition-all hover:border-[var(--accent)]/40 active:scale-[0.995]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2.5 flex-shrink-0">
                      {g.members.slice(0, 4).map(m => <Avatar key={m.id} m={m} size={36} ring />)}
                      {g.members.length > 4 && (
                        <span className="w-9 h-9 rounded-full inline-flex items-center justify-center font-mono text-[10px] font-bold text-[var(--ink-2)] bg-[var(--bg-3)] border-2 border-[var(--bg-2)]">
                          +{g.members.length - 4}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-[19px] tracking-[0.5px] leading-none text-[var(--ink-0)] truncate">{g.name}</p>
                      <p className="font-mono text-[11px] text-[var(--ink-2)] mt-1.5 truncate">
                        {g.members.length} member{g.members.length === 1 ? '' : 's'} · {note}
                      </p>
                    </div>
                    {(g.postCount ?? 0) > 0 && (
                      <span className="flex items-center gap-1 font-mono text-[11px] text-[var(--ink-1)] border border-[var(--line-2)] rounded-full px-2.5 py-1 flex-shrink-0">
                        <MessageCircle size={12} /> {g.postCount}
                      </span>
                    )}
                    <ChevronRight size={18} className="text-[var(--ink-2)] flex-shrink-0" />
                  </div>

                  {g.lastPost && (
                    <div className="flex items-center gap-2 mt-3.5 font-mono text-[12px] text-[var(--ink-1)]">
                      <Zap size={13} className="text-[var(--ink-2)] flex-shrink-0" />
                      <span className="truncate min-w-0">
                        <span className="font-medium" style={{ color: 'var(--accent)' }}>{g.lastPost.author}</span>
                        {' '}{g.lastPost.text}
                      </span>
                      <span className="text-[var(--ink-3)] flex-shrink-0 whitespace-nowrap">· {ago(g.lastPost.at)}</span>
                    </div>
                  )}
                </button>
              );
            })}
            <NewGroupCTA onClick={() => { setCreating(true); setName(''); setPicked(new Set()); setError(''); }} />
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

            <label className="que-label">Description <span className="text-[var(--ink-3)] font-normal">(optional)</span></label>
            <textarea className="que-input mb-4 resize-none" placeholder="What's this group about?" value={desc} maxLength={200} rows={2}
              onChange={e => setDesc(e.target.value)} />

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
