'use client';

import { useState, useEffect, useCallback } from 'react';
import { Heart, MessageCircle, Trash2, X, Bookmark, Plus, Send, Dumbbell, Swords, Settings, UserPlus, LogOut } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import type { DayRecord, ExerciseEntry } from '@/lib/AppContext';
import { getWorkoutPresets, saveWorkoutPresets } from '@/lib/storage';

interface MemberLite { id: string; name: string | null; username: string | null; photo: string | null }
interface GroupLite  { id: string; name: string; ownerId: string; isOwner: boolean; members: MemberLite[] }

interface PostPayload { title?: string; lines?: string[]; items?: WorkoutItem[]; exercises?: string; liftCount?: number; setCount?: number }
interface Post {
  id: string; date: string; note: string | null; payload: PostPayload; createdAt: string;
  author: { id: string; name: string | null; username: string | null; photo: string | null };
  likeCount: number; commentCount: number; liked: boolean; mine: boolean;
}
interface Comment { id: string; text: string; createdAt: string; author: { id: string; name: string | null; username: string | null } }

const num = (v: unknown) => { const n = parseFloat(String(v ?? '0')); return Number.isFinite(n) ? n : 0; };
const mdy = (iso: string) => { const [y, m, d] = iso.split('-'); return `${m}/${d}/${y}`; };
const NM  = (p: { name: string | null; username: string | null }) => p.name ?? (p.username ? `@${p.username}` : 'Athlete');

function Avatar({ p, size = 30 }: { p: { name: string | null; username: string | null; photo?: string | null }; size?: number }) {
  if (p.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.photo} alt="" style={{ width: size, height: size }} className="rounded-full object-cover border border-[var(--line-2)]" />;
  }
  return (
    <span className="rounded-full inline-flex items-center justify-center font-mono font-bold text-[var(--accent)] bg-[var(--accent-12)] border border-[var(--accent-24)]"
      style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {NM(p).replace('@', '').charAt(0).toUpperCase()}
    </span>
  );
}

interface WorkoutItem { kind: 'lift' | 'run' | 'bike' | 'swim'; name: string; detail: string; group: string }
interface DaySummary { title: string; items: WorkoutItem[]; lines: string[]; exercises: string; liftCount: number; setCount: number; hasContent: boolean }

/** Build a structured, shareable summary + raw exercises from a day's record. */
function summarizeDay(rec: DayRecord | undefined): DaySummary {
  const empty: DaySummary = { title: '', items: [], lines: [], exercises: '[]', liftCount: 0, setCount: 0, hasContent: false };
  if (!rec) return empty;
  let exs: ExerciseEntry[] = [];
  try { exs = JSON.parse(rec.exercises ?? '[]'); } catch { /* corrupt */ }
  const lifts  = Array.isArray(exs) ? exs.filter(e => e.k === 'lift') : [];
  const groups = new Set<string>();
  const items: WorkoutItem[] = [];
  const lines: string[] = [];
  let setCount = 0;
  for (const ex of lifts) {
    if (ex.g) groups.add(ex.g);
    const sets = Array.isArray(ex.sets) && ex.sets.length
      ? ex.sets
      : (ex.s ? Array.from({ length: parseInt(ex.s) || 1 }, () => ({ r: ex.r ?? '', w: ex.w ?? '' })) : []);
    setCount += sets.length;
    const detail = sets.length ? sets.map(s => (s.w ? `${s.r}×${s.w}` : `${s.r}`)).filter(Boolean).join(', ') : '';
    const name = ex.n ?? 'Exercise';
    items.push({ kind: 'lift', name, detail, group: ex.g || 'Other' });
    lines.push(`${name}${detail ? ` — ${detail}` : ''}`);
  }
  const run = num(rec.runDist), runT = num(rec.runTime);
  if (run > 0) { items.push({ kind: 'run', name: 'Run', detail: `${run} mi${runT ? ` · ${runT} min` : ''}`, group: 'Cardio' }); lines.push(`Ran ${run} mi`); }
  const bike = num(rec.bikeDist), bikeT = num(rec.bikeTime);
  if (bike > 0) { items.push({ kind: 'bike', name: 'Bike', detail: `${bike} mi${bikeT ? ` · ${bikeT} min` : ''}`, group: 'Cardio' }); lines.push(`Biked ${bike} mi`); }
  const swim = num(rec.swimDist), swimT = num(rec.swimTime);
  if (swim > 0 || swimT > 0) { items.push({ kind: 'swim', name: 'Swim', detail: `${swim ? `${swim} mi` : ''}${swimT ? `${swim ? ' · ' : ''}${swimT} min` : ''}`, group: 'Cardio' }); lines.push('Swam'); }
  const title = groups.size ? Array.from(groups).slice(0, 3).join(' · ') : (items.length ? 'Workout' : '');
  return { title, items, lines, exercises: rec.exercises ?? '[]', liftCount: lifts.length, setCount, hasContent: items.length > 0 };
}

const KIND_ICON: Record<string, string> = { lift: '🏋️', run: '🏃', bike: '🚴', swim: '🏊' };

/** Pretty muscle-group label (stored lowercase: "chest" → "Chest"). */
function groupLabel(g: string): string {
  return g.charAt(0).toUpperCase() + g.slice(1);
}

/** Bucket workout items by muscle group, preserving first-seen order. */
function groupItems(items: WorkoutItem[]): Array<[string, WorkoutItem[]]> {
  const order: string[] = [];
  const buckets = new Map<string, WorkoutItem[]>();
  for (const it of items) {
    if (!buckets.has(it.group)) { buckets.set(it.group, []); order.push(it.group); }
    buckets.get(it.group)!.push(it);
  }
  return order.map(g => [g, buckets.get(g)!] as [string, WorkoutItem[]]);
}

export function GroupFeed({ group, meId, friends, onChanged, onClose }: {
  group: GroupLite; meId: string; friends: MemberLite[]; onChanged: () => void; onClose: () => void;
}) {
  const { localDB } = useApp();
  const [posts, setPosts]     = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [manageError, setManageError] = useState('');

  // Member CRUD — hits the API, then asks the parent to refresh the groups list
  // (the updated `group` prop flows back down). closeAfter is for delete/leave,
  // where this group ceases to exist for the user.
  const manage = async (url: string, method: string, body?: object, closeAfter = false) => {
    setBusy(true); setManageError('');
    try {
      const res = await fetch(url, {
        method, credentials: 'include',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) { setManageError((await res.json().catch(() => null))?.error ?? 'Something went wrong'); return; }
      onChanged();
      if (closeAfter) { setShowManage(false); onClose(); }
    } finally { setBusy(false); }
  };

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/groups/${group.id}/posts`, { credentials: 'include' });
      const d = r.ok ? await r.json() as { posts: Post[] } : null;
      setPosts(d?.posts ?? []);
    } catch { /* keep */ } finally { setLoading(false); }
  }, [group.id]);
  useEffect(() => { void refresh(); }, [refresh]);

  const toggleLike = async (p: Post) => {
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, liked: !x.liked, likeCount: x.likeCount + (x.liked ? -1 : 1) } : x));
    try {
      const r = await fetch(`/api/posts/${p.id}/like`, { method: 'POST', credentials: 'include' });
      if (r.ok) { const d = await r.json() as { liked: boolean; count: number }; setPosts(prev => prev.map(x => x.id === p.id ? { ...x, liked: d.liked, likeCount: d.count } : x)); }
    } catch { /* revert handled on next refresh */ }
  };

  const del = async (p: Post) => {
    setPosts(prev => prev.filter(x => x.id !== p.id));
    try { await fetch(`/api/posts/${p.id}`, { method: 'DELETE', credentials: 'include' }); } catch { /* noop */ }
  };

  // Open the team-battle creator for this group (TeamBattles listens), then close
  // the feed so the create modal — which sits below this overlay — is visible.
  const startBattle = () => {
    window.dispatchEvent(new CustomEvent('que-start-team-battle', { detail: { groupId: group.id } }));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[470] flex flex-col bg-[var(--bg-0)]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)] flex-shrink-0"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="min-w-0">
          <h2 className="font-display text-[18px] tracking-[1.5px] uppercase text-[var(--ink-0)] truncate">{group.name}</h2>
          <p className="font-mono text-[9px] text-[var(--ink-3)]">{group.members.length} members</p>
        </div>
        <div className="flex items-center flex-shrink-0">
          <button onClick={() => { setManageError(''); setShowManage(true); }} aria-label="Group settings"
            className="w-11 h-11 flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--accent)]"><Settings size={18} /></button>
          <button onClick={onClose} aria-label="Close" className="w-11 h-11 flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--accent)]"><X size={20} /></button>
        </div>
      </div>

      {/* Top actions */}
      <div className="px-4 py-3 border-b border-[var(--line)] flex-shrink-0 flex gap-2">
        <button type="button" onClick={() => setSharing(true)} className="que-btn-primary flex-1 py-2.5 text-[11px] flex items-center justify-center gap-1.5">
          <Plus size={14} /> Share workout
        </button>
        {group.members.length >= 2 && (
          <button type="button" onClick={startBattle}
            className="flex-1 py-2.5 text-[11px] font-mono font-bold tracking-[0.5px] uppercase rounded-md border flex items-center justify-center gap-1.5 transition-all"
            style={{ borderColor: '#FFB547', color: '#FFB547' }}>
            <Swords size={14} /> Start battle
          </button>
        )}
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
        {loading ? (
          <p className="font-mono text-[10px] text-[var(--ink-3)] text-center py-6">Loading feed…</p>
        ) : posts.length === 0 ? (
          <div className="text-center py-10">
            <p className="font-mono text-[11px] text-[var(--ink-2)] font-bold tracking-[1px] uppercase">No posts yet</p>
            <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1">Be the first — share a workout above.</p>
          </div>
        ) : (
          posts.map(p => <PostCard key={p.id} post={p} onLike={() => toggleLike(p)} onDelete={() => del(p)} />)
        )}
      </div>

      {sharing && (
        <ShareSheet
          localDB={localDB}
          groupName={group.name}
          onClose={() => setSharing(false)}
          onShared={() => { setSharing(false); void refresh(); }}
          groupId={group.id}
        />
      )}

      {/* Manage group — members, add friends, delete/leave */}
      {showManage && (
        <div className="fixed inset-0 z-[480] flex items-end sm:items-center justify-center bg-black/60 px-4" onClick={() => setShowManage(false)}>
          <div className="w-full max-w-[400px] rounded-t-2xl sm:rounded-2xl bg-[var(--bg-1)] border border-[var(--line-2)] p-5"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-[18px] tracking-[1.5px] uppercase text-[var(--ink-0)]">Manage Group</h3>
              <button type="button" onClick={() => setShowManage(false)} className="text-[var(--ink-3)] hover:text-[var(--ink-0)]"><X size={18} /></button>
            </div>

            {/* Member list */}
            <div className="space-y-1.5 mb-4">
              {group.members.map(m => (
                <div key={m.id} className="flex items-center gap-2">
                  <Avatar p={m} size={22} />
                  <span className="font-mono text-[10px] text-[var(--ink-1)] flex-1 min-w-0 truncate">
                    {NM(m)}{m.id === group.ownerId && <span className="text-[var(--ink-3)]"> · owner</span>}
                  </span>
                  {group.isOwner && m.id !== group.ownerId && (
                    <button type="button" disabled={busy}
                      onClick={() => manage(`/api/groups/${group.id}/members`, 'DELETE', { userId: m.id })}
                      aria-label="Remove member"
                      className="text-[var(--ink-3)] hover:text-[var(--danger)] transition-colors disabled:opacity-40">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Owner: add friends not already in the group */}
            {group.isOwner && (() => {
              const inGroup = new Set(group.members.map(m => m.id));
              const addable = friends.filter(f => !inGroup.has(f.id));
              return addable.length > 0 ? (
                <div className="mb-4">
                  <p className="font-mono text-[9px] font-bold tracking-[1.5px] uppercase text-[var(--ink-3)] mb-1.5">Add friends</p>
                  <div className="flex flex-wrap gap-1.5">
                    {addable.map(f => (
                      <button key={f.id} type="button" disabled={busy}
                        onClick={() => manage(`/api/groups/${group.id}/members`, 'POST', { userId: f.id })}
                        className="flex items-center gap-1 font-mono text-[9px] text-[var(--ink-1)] border border-[var(--line-2)] rounded-full pl-1 pr-2 py-0.5 hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all disabled:opacity-40">
                        <Avatar p={f} size={16} /> <UserPlus size={10} /> {f.name ?? f.username}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {manageError && <p className="font-mono text-[9px] text-[var(--danger)] mb-2">{manageError}</p>}

            {/* Owner deletes, member leaves */}
            <div className="flex justify-end pt-1">
              {group.isOwner ? (
                <button type="button" disabled={busy}
                  onClick={() => manage(`/api/groups/${group.id}`, 'DELETE', undefined, true)}
                  className="font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--danger)] border border-[var(--danger)]/40 rounded-sm px-2.5 py-1.5 hover:bg-[var(--danger)]/10 transition-all flex items-center gap-1 disabled:opacity-40">
                  <Trash2 size={12} /> Delete group
                </button>
              ) : (
                <button type="button" disabled={busy}
                  onClick={() => manage(`/api/groups/${group.id}/members`, 'DELETE', { userId: meId }, true)}
                  className="font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--ink-2)] border border-[var(--line-2)] rounded-sm px-2.5 py-1.5 hover:border-[var(--danger)] hover:text-[var(--danger)] transition-all flex items-center gap-1 disabled:opacity-40">
                  <LogOut size={12} /> Leave
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Single post ──────────────────────────────────────────────────────────────

function PostCard({ post, onLike, onDelete }: { post: Post; onLike: () => void; onDelete: () => void }) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingC, setLoadingC] = useState(false);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const loadComments = useCallback(async () => {
    setLoadingC(true);
    try {
      const r = await fetch(`/api/posts/${post.id}/comments`, { credentials: 'include' });
      const d = r.ok ? await r.json() as { comments: Comment[] } : null;
      setComments(d?.comments ?? []);
    } catch { /* noop */ } finally { setLoadingC(false); }
  }, [post.id]);

  const openComments = () => { const next = !showComments; setShowComments(next); if (next && comments.length === 0) void loadComments(); };

  const addComment = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      const r = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
      });
      if (r.ok) { const d = await r.json() as { comment: Comment }; setComments(prev => [...prev, d.comment]); }
    } catch { /* noop */ }
  };

  const saveAsPreset = () => {
    try {
      const ps = getWorkoutPresets();
      const name = post.payload.title ? `${post.payload.title}` : 'Shared workout';
      saveWorkoutPresets([...ps, {
        id: `preset_${Date.now()}`, name, exercises: post.payload.exercises ?? '[]',
        isRecurring: false, daysOfWeek: [], everyNWeeks: 1, createdAt: new Date().toISOString().slice(0, 10),
      }]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* noop */ }
  };

  const items = post.payload.items ?? [];
  const grouped = groupItems(items);
  const lines = post.payload.lines ?? [];
  const liftCount = post.payload.liftCount ?? items.filter(i => i.kind === 'lift').length;
  const setCount  = post.payload.setCount ?? 0;
  const statText  = liftCount > 0 ? `${liftCount} exercise${liftCount === 1 ? '' : 's'}${setCount ? ` · ${setCount} sets` : ''}` : '';
  const hasExercises = !!post.payload.exercises && post.payload.exercises !== '[]';

  return (
    <div className="que-card p-4">
      {/* Author row */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <Avatar p={post.author} size={32} />
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[11px] font-bold text-[var(--ink-0)] truncate">{NM(post.author)}</p>
          <p className="font-mono text-[9px] text-[var(--ink-3)]">{mdy(post.date)}</p>
        </div>
        {post.mine && (
          confirmDel ? (
            <div className="flex items-center gap-1">
              <button onClick={() => setConfirmDel(false)} className="font-mono text-[9px] text-[var(--ink-3)] px-1">Keep</button>
              <button onClick={onDelete} className="font-mono text-[9px] font-bold text-[var(--danger)] px-1">Delete</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} aria-label="Delete post" className="text-[var(--ink-3)] hover:text-[var(--danger)]"><Trash2 size={13} /></button>
          )
        )}
      </div>

      {/* Workout card */}
      <div className="rounded-lg border border-[var(--line)] bg-[var(--bg-2)] overflow-hidden mb-2">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--line)]" style={{ background: 'var(--accent-12)' }}>
          <Dumbbell size={13} style={{ color: 'var(--accent)' }} />
          <p className="font-mono text-[11px] font-bold text-[var(--ink-0)] flex-1 truncate">{post.payload.title || 'Workout'}</p>
          {statText && <span className="font-mono text-[8px] text-[var(--ink-3)] flex-shrink-0">{statText}</span>}
        </div>
        {items.length > 0 ? (
          <div className="py-1">
            {grouped.map(([grp, grpItems], gi) => (
              <div key={gi} className="px-3 py-1">
                {/* Muscle-group header with trailing divider */}
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[1.5px] flex-shrink-0" style={{ color: 'var(--accent)' }}>
                    {grp === 'Cardio' ? '🏃' : '💪'} {groupLabel(grp)}
                  </span>
                  <span className="flex-1 h-px" style={{ background: 'var(--line)' }} />
                  <span className="font-mono text-[8px] text-[var(--ink-3)] tabular-nums flex-shrink-0">{grpItems.length}</span>
                </div>
                {/* Exercise rows */}
                {grpItems.map((it, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 pl-3 py-0.5">
                    <span className="font-mono text-[10px] text-[var(--ink-1)] truncate">{grp === 'Cardio' ? `${KIND_ICON[it.kind]} ` : ''}{it.name}</span>
                    {it.detail && <span className="font-mono text-[9px] text-[var(--ink-3)] tabular-nums flex-shrink-0">{it.detail}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {lines.map((l, i) => (
              <p key={i} className="px-3 py-1.5 font-mono text-[10px] text-[var(--ink-1)]">{l}</p>
            ))}
          </div>
        )}
      </div>
      {post.note && <p className="font-mono text-[10px] text-[var(--ink-2)] italic mb-2">“{post.note}”</p>}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-2 border-t border-[var(--line)]">
        <button onClick={onLike} className="flex items-center gap-1.5 font-mono text-[10px] transition-colors"
          style={{ color: post.liked ? 'var(--danger)' : 'var(--ink-3)' }}>
          <Heart size={14} fill={post.liked ? 'var(--danger)' : 'none'} /> {post.likeCount > 0 && post.likeCount}
        </button>
        <button onClick={openComments} className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--ink-3)] hover:text-[var(--ink-1)] transition-colors">
          <MessageCircle size={14} /> {post.commentCount > 0 && post.commentCount}
        </button>
        {hasExercises && (
          <button onClick={saveAsPreset} className="flex items-center gap-1.5 font-mono text-[10px] ml-auto transition-colors"
            style={{ color: saved ? 'var(--positive)' : 'var(--ink-3)' }}>
            <Bookmark size={14} fill={saved ? 'var(--positive)' : 'none'} /> {saved ? 'Saved' : 'Save'}
          </button>
        )}
      </div>

      {/* Comments */}
      {showComments && (
        <div className="mt-3 pt-3 border-t border-[var(--line)] space-y-2">
          {loadingC ? (
            <p className="font-mono text-[9px] text-[var(--ink-3)]">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="font-mono text-[9px] text-[var(--ink-3)]">No comments yet.</p>
          ) : (
            comments.map(c => (
              <div key={c.id} className="font-mono text-[10px]">
                <span className="font-bold text-[var(--ink-1)]">{NM(c.author)}</span>{' '}
                <span className="text-[var(--ink-2)]">{c.text}</span>
              </div>
            ))
          )}
          <div className="flex gap-2 pt-1">
            <input type="text" className="que-input flex-1 text-[10px] py-2" placeholder="Add a comment…" value={text} maxLength={280}
              onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addComment(); }} />
            <button onClick={addComment} disabled={!text.trim()} aria-label="Send"
              className="px-3 rounded border border-[var(--line-2)] text-[var(--accent)] disabled:opacity-30 flex items-center"><Send size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Share sheet ────────────────────────────────────────────────────────────

function ShareSheet({ localDB, groupId, groupName, onClose, onShared }: {
  localDB: Record<string, DayRecord>; groupId: string; groupName: string;
  onClose: () => void; onShared: () => void;
}) {
  const [date, setDate] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Recent days (last 21) that actually have a workout/cardio to share.
  const days = Object.keys(localDB).sort().reverse()
    .map(d => ({ date: d, ...summarizeDay(localDB[d]) }))
    .filter(d => d.hasContent)
    .slice(0, 21);

  const selected = date ? summarizeDay(localDB[date]) : null;

  const share = async () => {
    if (!date || !selected) { setError('Pick a workout'); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/posts', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupIds: [groupId], date,
          payload: {
            title: selected.title, items: selected.items, lines: selected.lines,
            exercises: selected.exercises, liftCount: selected.liftCount, setCount: selected.setCount,
          },
          note: note.trim() || undefined,
        }),
      });
      if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? 'Could not share'); return; }
      onShared();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[480] flex items-end sm:items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-[420px] max-h-[86vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[var(--bg-1)] border border-[var(--line-2)] p-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-[18px] tracking-[1.5px] uppercase text-[var(--ink-0)]">Share to {groupName}</h3>
          <button onClick={onClose} className="text-[var(--ink-3)] hover:text-[var(--ink-0)]"><X size={18} /></button>
        </div>
        <p className="font-mono text-[10px] text-[var(--ink-2)] mb-4">Pick a recent workout to post to the group.</p>

        {days.length === 0 ? (
          <p className="font-mono text-[10px] text-[var(--ink-3)] mb-4">No logged workouts yet — log a lift or cardio first.</p>
        ) : (
          <div className="space-y-1.5 max-h-[34vh] overflow-y-auto mb-4">
            {days.map(d => {
              const on = date === d.date;
              return (
                <button key={d.date} type="button" onClick={() => setDate(d.date)}
                  className="w-full text-left px-3 py-2 rounded-md border transition-all"
                  style={{ borderColor: on ? 'var(--accent)' : 'var(--line)', background: on ? 'var(--accent-12)' : 'var(--bg-2)' }}>
                  <p className="font-mono text-[10px] font-bold" style={{ color: on ? 'var(--accent)' : 'var(--ink-0)' }}>{mdy(d.date)} · {d.title || 'Workout'}</p>
                  <p className="font-mono text-[8px] text-[var(--ink-3)] truncate">{d.lines.slice(0, 2).join(' · ')}</p>
                </button>
              );
            })}
          </div>
        )}

        {selected && (
          <div className="rounded-md border border-[var(--line)] bg-[var(--bg-2)] p-3 mb-3 space-y-0.5">
            {selected.lines.map((l, i) => <p key={i} className="font-mono text-[9px] text-[var(--ink-1)]">{l}</p>)}
          </div>
        )}

        <label className="que-label">Caption (optional)</label>
        <input type="text" className="que-input mb-4" placeholder="How'd it go?" value={note} maxLength={280} onChange={e => setNote(e.target.value)} />

        {error && <p className="font-mono text-[9px] text-[var(--danger)] mb-2">{error}</p>}

        <button type="button" onClick={share} disabled={busy || !date} className="que-btn-primary w-full py-3 disabled:opacity-40">
          {busy ? 'Sharing…' : 'Share'}
        </button>
      </div>
    </div>
  );
}
