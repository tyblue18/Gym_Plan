'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, X, Trash2, UserPlus, LogOut, Check } from 'lucide-react';

interface FriendLite { id: string; name: string | null; username: string | null; photo: string | null }
interface GroupMemberLite { id: string; name: string | null; username: string | null; photo: string | null }
interface GroupData {
  id: string; name: string; ownerId: string; isOwner: boolean; members: GroupMemberLite[];
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
  const [manageId, setManageId] = useState<string | null>(null);
  const [name, setName]       = useState('');
  const [picked, setPicked]   = useState<Set<string>>(new Set());
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');

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

  const mutate = async (url: string, method: string, body?: object) => {
    setBusy(true);
    try {
      await fetch(url, {
        method, credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      await refresh();
    } finally { setBusy(false); }
  };

  const managed = groups.find(g => g.id === manageId) ?? null;

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
        <p className="font-mono text-[10px] text-[var(--ink-2)] leading-relaxed mb-3">
          Build a roster of friends for team battles. Add anyone you&apos;re friends with — they don&apos;t need to know each other.
        </p>

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
              <div key={g.id} className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    {g.members.slice(0, 5).map(m => <Avatar key={m.id} m={m} />)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[12px] font-bold text-[var(--ink-0)] truncate">{g.name}</p>
                    <p className="font-mono text-[9px] text-[var(--ink-3)]">
                      {g.members.length} member{g.members.length === 1 ? '' : 's'}{g.isOwner ? ' · you own this' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setManageId(manageId === g.id ? null : g.id)}
                    className="font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--ink-2)] border border-[var(--line-2)] rounded-sm px-2.5 py-1.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all flex-shrink-0"
                  >
                    {manageId === g.id ? 'Close' : 'Manage'}
                  </button>
                </div>

                {manageId === g.id && managed && (
                  <div className="mt-3 pt-3 border-t border-[var(--line)] space-y-3">
                    {/* Member list */}
                    <div className="space-y-1.5">
                      {managed.members.map(m => (
                        <div key={m.id} className="flex items-center gap-2">
                          <Avatar m={m} size={22} />
                          <span className="font-mono text-[10px] text-[var(--ink-1)] flex-1 min-w-0 truncate">
                            {m.name ?? (m.username ? `@${m.username}` : 'Athlete')}
                            {m.id === managed.ownerId && <span className="text-[var(--ink-3)]"> · owner</span>}
                          </span>
                          {managed.isOwner && m.id !== managed.ownerId && (
                            <button type="button" disabled={busy}
                              onClick={() => mutate(`/api/groups/${managed.id}/members`, 'DELETE', { userId: m.id })}
                              aria-label={`Remove ${m.name ?? 'member'}`}
                              className="text-[var(--ink-3)] hover:text-[var(--danger)] transition-colors disabled:opacity-40">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Owner: add friends not already in the group */}
                    {managed.isOwner && (() => {
                      const inGroup = new Set(managed.members.map(m => m.id));
                      const addable = friends.filter(f => !inGroup.has(f.id));
                      return addable.length > 0 ? (
                        <div>
                          <p className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)] mb-1.5">Add friends</p>
                          <div className="flex flex-wrap gap-1.5">
                            {addable.map(f => (
                              <button key={f.id} type="button" disabled={busy}
                                onClick={() => mutate(`/api/groups/${managed.id}/members`, 'POST', { userId: f.id })}
                                className="flex items-center gap-1 font-mono text-[9px] text-[var(--ink-1)] border border-[var(--line-2)] rounded-full pl-1 pr-2 py-0.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all disabled:opacity-40">
                                <Avatar m={f} size={16} /> <UserPlus size={10} /> {f.name ?? f.username}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null;
                    })()}

                    {/* Owner deletes, member leaves */}
                    <div className="flex justify-end pt-1">
                      {managed.isOwner ? (
                        <button type="button" disabled={busy}
                          onClick={() => mutate(`/api/groups/${managed.id}`, 'DELETE')}
                          className="font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--danger)] border border-[var(--danger)]/40 rounded-sm px-2.5 py-1.5 hover:bg-[var(--danger)]/10 transition-all flex items-center gap-1 disabled:opacity-40">
                          <Trash2 size={12} /> Delete group
                        </button>
                      ) : (
                        <button type="button" disabled={busy}
                          onClick={() => mutate(`/api/groups/${managed.id}/members`, 'DELETE', { userId: meId })}
                          className="font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--ink-2)] border border-[var(--line-2)] rounded-sm px-2.5 py-1.5 hover:border-[var(--danger)] hover:text-[var(--danger)] transition-all flex items-center gap-1 disabled:opacity-40">
                          <LogOut size={12} /> Leave
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create-group bottom sheet */}
      {creating && (
        <div className="fixed inset-0 z-[450] flex items-end sm:items-center justify-center bg-black/60 px-4" onClick={() => setCreating(false)}>
          <div className="w-full max-w-[400px] rounded-t-2xl sm:rounded-2xl bg-[var(--bg-1)] border border-[var(--line-2)] p-5 mb-0 sm:mb-0"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-[18px] tracking-[1.5px] uppercase text-[var(--ink-0)]">New Group</h3>
              <button type="button" onClick={() => setCreating(false)} className="text-[var(--ink-3)] hover:text-[var(--ink-0)]"><X size={18} /></button>
            </div>

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
