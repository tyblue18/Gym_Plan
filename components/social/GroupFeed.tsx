'use client';

import { useState, useEffect, useCallback } from 'react';
import { Heart, MessageCircle, Trash2, X, Bookmark, Plus, Send } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import type { DayRecord, ExerciseEntry } from '@/lib/AppContext';
import { getWorkoutPresets, saveWorkoutPresets } from '@/lib/storage';

interface MemberLite { id: string; name: string | null; username: string | null; photo: string | null }
interface GroupLite  { id: string; name: string; ownerId: string; isOwner: boolean; members: MemberLite[] }

interface PostPayload { title?: string; lines?: string[]; exercises?: string }
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

/** Build a shareable summary + raw exercises from a day's record. */
function summarizeDay(rec: DayRecord | undefined): { title: string; lines: string[]; exercises: string; hasContent: boolean } {
  if (!rec) return { title: '', lines: [], exercises: '[]', hasContent: false };
  let exs: ExerciseEntry[] = [];
  try { exs = JSON.parse(rec.exercises ?? '[]'); } catch { /* corrupt */ }
  const lifts  = Array.isArray(exs) ? exs.filter(e => e.k === 'lift') : [];
  const groups = new Set<string>();
  const lines: string[] = [];
  for (const ex of lifts) {
    if (ex.g) groups.add(ex.g);
    const sets = Array.isArray(ex.sets) && ex.sets.length
      ? ex.sets
      : (ex.s ? Array.from({ length: parseInt(ex.s) || 1 }, () => ({ r: ex.r ?? '', w: ex.w ?? '' })) : []);
    const setStr = sets.length ? sets.map(s => (s.w ? `${s.r}×${s.w}` : `${s.r}`)).filter(Boolean).join(', ') : '';
    lines.push(`${ex.n ?? 'Exercise'}${setStr ? ` — ${setStr}` : ''}`);
  }
  const run = num(rec.runDist), runT = num(rec.runTime);
  if (run > 0) lines.push(`🏃 Ran ${run} mi${runT ? ` · ${runT} min` : ''}`);
  const bike = num(rec.bikeDist), bikeT = num(rec.bikeTime);
  if (bike > 0) lines.push(`🚴 Biked ${bike} mi${bikeT ? ` · ${bikeT} min` : ''}`);
  const swim = num(rec.swimDist), swimT = num(rec.swimTime);
  if (swim > 0 || swimT > 0) lines.push(`🏊 Swam${swim ? ` ${swim} mi` : ''}${swimT ? ` · ${swimT} min` : ''}`);
  const title = groups.size ? Array.from(groups).slice(0, 3).join(' · ') : (lines.length ? 'Workout' : '');
  return { title, lines, exercises: rec.exercises ?? '[]', hasContent: lines.length > 0 };
}

export function GroupFeed({ group, onClose }: { group: GroupLite; meId: string; onClose: () => void }) {
  const { localDB } = useApp();
  const [posts, setPosts]     = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);

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

  return (
    <div className="fixed inset-0 z-[470] flex flex-col bg-[var(--bg-0)]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--line)] flex-shrink-0"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="min-w-0">
          <h2 className="font-display text-[18px] tracking-[1.5px] uppercase text-[var(--ink-0)] truncate">{group.name}</h2>
          <p className="font-mono text-[9px] text-[var(--ink-3)]">{group.members.length} members</p>
        </div>
        <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--accent)]"><X size={20} /></button>
      </div>

      {/* Share bar */}
      <div className="px-4 py-3 border-b border-[var(--line)] flex-shrink-0">
        <button type="button" onClick={() => setSharing(true)} className="que-btn-primary w-full py-2.5 text-[11px] flex items-center justify-center gap-1.5">
          <Plus size={14} /> Share a workout
        </button>
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

  const lines = post.payload.lines ?? [];
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

      {/* Workout */}
      {post.payload.title && <p className="font-mono text-[12px] font-bold text-[var(--accent)] mb-1">{post.payload.title}</p>}
      <div className="space-y-0.5 mb-2">
        {lines.map((l, i) => <p key={i} className="font-mono text-[10px] text-[var(--ink-1)] leading-relaxed">{l}</p>)}
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
          payload: { title: selected.title, lines: selected.lines, exercises: selected.exercises },
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
