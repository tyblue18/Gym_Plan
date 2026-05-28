'use client';

import { useState, useEffect, useCallback } from 'react';
import { Swords, X, Check, Trophy } from 'lucide-react';
import { BATTLE_CATEGORIES } from '@/lib/battle-categories';

const HIGHER_CATS = BATTLE_CATEGORIES.filter(c => c.direction === 'higher');

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface MemberLite { id: string; name: string | null; username: string | null; photo: string | null }
interface GroupData  { id: string; name: string; ownerId: string; isOwner: boolean; members: MemberLite[] }
interface Participant { id: string; team: number; accepted: boolean; name: string | null; username: string | null; photo: string | null }
interface BattleData {
  id: string; groupName: string; creatorId: string; wager: number; bestOf: number;
  windowKind: string; startDate: string; endDate: string; categories: string[];
  status: string; winningTeam: number | null;
  resolution: { summary?: { team0Wins: number; team1Wins: number; ties: number } } | null;
  myTeam: number | null; myAccepted: boolean; participants: Participant[];
}
interface FeedData { invites: BattleData[]; pending: BattleData[]; active: BattleData[]; resolved: BattleData[] }

const NAME = (p: { name: string | null; username: string | null }) => p.name ?? (p.username ? `@${p.username}` : 'Athlete');

function Avatar({ m, size = 22 }: { m: MemberLite | Participant; size?: number }) {
  if (m.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.photo} alt="" style={{ width: size, height: size }} className="rounded-full object-cover border border-[var(--line-2)]" />;
  }
  return (
    <span className="rounded-full inline-flex items-center justify-center font-mono font-bold text-[var(--accent)] bg-[var(--accent-12)] border border-[var(--accent-24)]"
      style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {NAME(m).replace('@', '').charAt(0).toUpperCase()}
    </span>
  );
}

function TeamRow({ b, team }: { b: BattleData; team: number }) {
  const members = b.participants.filter(p => p.team === team);
  const won = b.status === 'resolved' && b.winningTeam === team;
  return (
    <div className="flex items-center gap-1.5">
      {won && <Trophy size={12} style={{ color: '#FFB547' }} />}
      <span className="font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--ink-3)]">{team === 0 ? 'A' : 'B'}</span>
      <div className="flex -space-x-1.5">{members.map(m => <Avatar key={m.id} m={m} size={20} />)}</div>
      <span className="font-mono text-[9px] text-[var(--ink-3)] truncate">{members.map(NAME).join(', ')}</span>
    </div>
  );
}

/**
 * Team Battles section of the Social tab. Create 2v2…NvN battles from a group,
 * accept/decline invites, and see active + resolved battles. Uses the same typed
 * category engine as 1v1 battles (restricted to "most wins" categories).
 */
export function TeamBattles({ meId }: { meId: string }) {
  const [feed,    setFeed]    = useState<FeedData>({ invites: [], pending: [], active: [], resolved: [] });
  const [groups,  setGroups]  = useState<GroupData[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createGroupId, setCreateGroupId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [f, g] = await Promise.all([
        fetch('/api/team-battles', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch('/api/groups',       { credentials: 'include' }).then(r => r.ok ? r.json() : null),
      ]);
      if (f) setFeed(f as FeedData);
      if (g) setGroups((g as { groups: GroupData[] }).groups ?? []);
    } catch { /* keep prior */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // The Groups card fires this to start a battle for a specific group.
  useEffect(() => {
    const onStart = (e: Event) => {
      const id = (e as CustomEvent<{ groupId: string }>).detail?.groupId ?? null;
      void refresh();              // pull in any just-created group/members
      setCreateGroupId(id);
      setCreating(true);
    };
    window.addEventListener('que-start-team-battle', onStart);
    return () => window.removeEventListener('que-start-team-battle', onStart);
  }, [refresh]);

  const act = async (battleId: string, action: 'accept' | 'decline' | 'cancel') => {
    setBusy(true);
    try {
      await fetch(`/api/team-battles/${battleId}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      await refresh();
    } finally { setBusy(false); }
  };

  const eligibleGroups = groups.filter(g => g.members.length >= 2);
  const hasAny = feed.invites.length + feed.pending.length + feed.active.length + feed.resolved.length > 0;

  return (
    <div className="que-card mb-4">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="que-section-label"><span className="dot" style={{ background: '#FFB547' }} /> TEAM BATTLES</h2>
          <button type="button" disabled={eligibleGroups.length === 0}
            onClick={() => { setCreateGroupId(null); setCreating(true); }}
            className="font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--accent)] border border-[var(--accent)]/50 rounded-sm px-2.5 py-1.5 hover:bg-[var(--accent)] hover:text-[var(--accent-ink)] transition-all flex items-center gap-1 disabled:opacity-40">
            <Swords size={12} /> New
          </button>
        </div>
        <p className="font-mono text-[10px] text-[var(--ink-2)] leading-relaxed mb-3">
          {eligibleGroups.length === 0
            ? 'Create a group with at least 2 members to run team battles.'
            : 'Pick a group, split into teams, and wager coins. Each player antes; the winning team splits the pot.'}
        </p>

        {loading ? (
          <p className="font-mono text-[10px] text-[var(--ink-3)] py-2">Loading…</p>
        ) : !hasAny ? (
          <div className="text-center py-6 border border-dashed border-[var(--line-2)] rounded">
            <Swords size={20} className="text-[var(--ink-3)] mx-auto mb-2" />
            <p className="font-mono text-[10px] text-[var(--ink-2)] font-bold tracking-[1px] uppercase">No team battles yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Invites — need your call */}
            {feed.invites.map(b => (
              <div key={b.id} className="rounded-md border border-[rgba(255,181,71,0.35)] bg-[rgba(255,181,71,0.06)] px-3 py-3">
                <p className="font-mono text-[11px] font-bold text-[var(--ink-0)] mb-1.5">{b.groupName} · invite</p>
                <div className="space-y-1 mb-2"><TeamRow b={b} team={0} /><TeamRow b={b} team={1} /></div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-[var(--ink-3)]">{b.wager} 🪙 · Bo{b.bestOf} · {b.windowKind}</span>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => act(b.id, 'decline')}
                      className="font-mono text-[10px] text-[var(--danger)] px-2 py-1 disabled:opacity-40">Decline</button>
                    <button type="button" disabled={busy} onClick={() => act(b.id, 'accept')}
                      className="que-btn-primary px-3 py-1.5 text-[10px] disabled:opacity-40">Accept</button>
                  </div>
                </div>
              </div>
            ))}

            {/* Pending — you're in, waiting on others */}
            {feed.pending.map(b => {
              const waiting = b.participants.filter(p => !p.accepted).length;
              return (
                <div key={b.id} className="rounded-md border border-[var(--line)] bg-[var(--bg-2)] px-3 py-2.5">
                  <p className="font-mono text-[11px] font-bold text-[var(--ink-0)] mb-1">{b.groupName} · awaiting {waiting}</p>
                  <div className="space-y-1 mb-1.5"><TeamRow b={b} team={0} /><TeamRow b={b} team={1} /></div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] text-[var(--ink-3)]">{b.wager} 🪙 · Bo{b.bestOf}</span>
                    {b.creatorId === meId && (
                      <button type="button" disabled={busy} onClick={() => act(b.id, 'cancel')}
                        className="font-mono text-[9px] text-[var(--ink-3)] hover:text-[var(--danger)] px-1.5 py-1 disabled:opacity-40">Cancel</button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Active */}
            {feed.active.map(b => (
              <div key={b.id} className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent-12)] px-3 py-2.5">
                <p className="font-mono text-[11px] font-bold text-[var(--ink-0)] mb-1">{b.groupName} · live</p>
                <div className="space-y-1 mb-1"><TeamRow b={b} team={0} /><TeamRow b={b} team={1} /></div>
                <span className="font-mono text-[9px] text-[var(--ink-3)]">{b.wager} 🪙 · Bo{b.bestOf} · ends {b.endDate}</span>
              </div>
            ))}

            {/* Resolved */}
            {feed.resolved.map(b => {
              const s = b.resolution?.summary;
              const label = b.status === 'cancelled' ? 'cancelled'
                : b.winningTeam === null ? 'tie'
                : `Team ${b.winningTeam === 0 ? 'A' : 'B'} won${s ? ` ${Math.max(s.team0Wins, s.team1Wins)}–${Math.min(s.team0Wins, s.team1Wins)}` : ''}`;
              const iWon = b.status === 'resolved' && b.winningTeam !== null && b.myTeam === b.winningTeam;
              return (
                <div key={b.id} className="rounded-md border border-[var(--line)] bg-[var(--bg-2)]/50 px-3 py-2 opacity-90">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[var(--ink-1)] truncate">{b.groupName}</span>
                    <span className="font-mono text-[9px] font-bold tracking-[0.5px] uppercase"
                      style={{ color: b.status === 'cancelled' ? 'var(--ink-3)' : iWon ? 'var(--positive)' : b.winningTeam === null ? 'var(--ink-2)' : 'var(--danger)' }}>
                      {label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {creating && (
        <CreateTeamBattle
          meId={meId}
          groups={eligibleGroups}
          initialGroupId={createGroupId}
          busy={busy}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); void refresh(); }}
          setBusy={setBusy}
        />
      )}
    </div>
  );
}

// ── Create flow ─────────────────────────────────────────────────────────────

function CreateTeamBattle({ meId, groups, initialGroupId, busy, onClose, onCreated, setBusy }: {
  meId: string; groups: GroupData[]; initialGroupId: string | null; busy: boolean;
  onClose: () => void; onCreated: () => void; setBusy: (b: boolean) => void;
}) {
  const [groupId, setGroupId] = useState(initialGroupId ?? groups[0]?.id ?? '');
  const group = groups.find(g => g.id === groupId) ?? null;

  // team assignment: userId → 0 | 1 | undefined; default the creator to A.
  const [assign, setAssign] = useState<Record<string, number>>({ [meId]: 0 });
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(1);
  const [cats,   setCats]   = useState<string[]>([]);
  const [windowKind, setWindowKind] = useState<'day' | 'week'>('week');
  const [startDate,  setStartDate]  = useState(localToday());
  const [wager, setWager] = useState('5');
  const [error, setError] = useState('');

  // When the group changes, reset assignments (keep creator on A if a member).
  useEffect(() => {
    setAssign(group?.members.some(m => m.id === meId) ? { [meId]: 0 } : {});
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cycle = (uid: string) =>
    setAssign(prev => {
      const cur = prev[uid];
      const next = { ...prev };
      if (cur === undefined) next[uid] = 0;
      else if (cur === 0)    next[uid] = 1;
      else                   delete next[uid];
      return next;
    });

  const toggleCat = (slug: string) =>
    setCats(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : prev.length >= bestOf ? prev : [...prev, slug]);

  // Trim category selection if bestOf shrank.
  useEffect(() => { setCats(prev => prev.slice(0, bestOf)); }, [bestOf]);

  const teamA = Object.keys(assign).filter(u => assign[u] === 0);
  const teamB = Object.keys(assign).filter(u => assign[u] === 1);

  const submit = async () => {
    setError('');
    if (!group) { setError('Pick a group'); return; }
    if (teamA.length === 0 || teamB.length === 0) { setError('Both teams need at least one player'); return; }
    if (teamA.length !== teamB.length) { setError('Teams must be the same size'); return; }
    if (!assign[meId] && assign[meId] !== 0) { setError('You have to be in the battle'); return; }
    if (cats.length !== bestOf) { setError(`Pick exactly ${bestOf} categor${bestOf === 1 ? 'y' : 'ies'}`); return; }
    const wagerNum = parseInt(wager || '0', 10);
    if (!Number.isFinite(wagerNum) || wagerNum < 0) { setError('Invalid wager'); return; }

    setBusy(true);
    try {
      const res = await fetch('/api/team-battles', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, teamA, teamB, wager: wagerNum, bestOf, windowKind, startDate, categories: cats }),
      });
      if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? 'Could not create battle'); return; }
      onCreated();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[450] flex items-end sm:items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="w-full max-w-[420px] max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-[var(--bg-1)] border border-[var(--line-2)] p-5"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-[18px] tracking-[1.5px] uppercase text-[var(--ink-0)]">New Team Battle</h3>
          <button type="button" onClick={onClose} className="text-[var(--ink-3)] hover:text-[var(--ink-0)]"><X size={18} /></button>
        </div>

        {/* Group */}
        <label className="que-label">Group</label>
        <select className="que-input mb-4 cursor-pointer" value={groupId} onChange={e => setGroupId(e.target.value)}>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.members.length})</option>)}
        </select>

        {/* Team assignment */}
        <label className="que-label">Tap to assign · Team A {teamA.length} v {teamB.length} Team B</label>
        <div className="space-y-1 mb-4">
          {group?.members.map(m => {
            const t = assign[m.id];
            return (
              <button key={m.id} type="button" onClick={() => cycle(m.id)}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded border border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--line-3)] transition-all">
                <Avatar m={m} size={24} />
                <span className="font-mono text-[11px] text-[var(--ink-1)] flex-1 text-left truncate">{NAME(m)}{m.id === meId ? ' (you)' : ''}</span>
                <span className={['w-7 h-6 rounded-sm flex items-center justify-center font-mono text-[10px] font-bold',
                  t === 0 ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : t === 1 ? 'bg-[#FFB547] text-black' : 'border border-[var(--line-2)] text-[var(--ink-3)]'].join(' ')}>
                  {t === 0 ? 'A' : t === 1 ? 'B' : '—'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Format */}
        <label className="que-label">Best of</label>
        <div className="flex gap-2 mb-4">
          {([1, 3, 5] as const).map(n => (
            <button key={n} type="button" onClick={() => setBestOf(n)}
              className={['flex-1 py-2 rounded border font-mono text-[11px] font-bold transition-all',
                bestOf === n ? 'border-[var(--accent)] bg-[var(--accent-12)] text-[var(--accent)]' : 'border-[var(--line-2)] text-[var(--ink-2)]'].join(' ')}>
              Bo{n}
            </button>
          ))}
        </div>

        {/* Categories */}
        <label className="que-label">Categories · pick {bestOf} ({cats.length}/{bestOf})</label>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {HIGHER_CATS.map(c => {
            const on = cats.includes(c.slug);
            return (
              <button key={c.slug} type="button" onClick={() => toggleCat(c.slug)}
                className={['font-mono text-[9px] px-2 py-1 rounded-full border transition-all',
                  on ? 'border-[var(--accent)] bg-[var(--accent-12)] text-[var(--accent)]' : 'border-[var(--line-2)] text-[var(--ink-2)] hover:border-[var(--line-3)]'].join(' ')}>
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Window */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <label className="que-label">Window</label>
            <div className="flex gap-2">
              {(['day', 'week'] as const).map(w => (
                <button key={w} type="button" onClick={() => setWindowKind(w)}
                  className={['flex-1 py-2 rounded border font-mono text-[10px] font-bold uppercase transition-all',
                    windowKind === w ? 'border-[var(--accent)] bg-[var(--accent-12)] text-[var(--accent)]' : 'border-[var(--line-2)] text-[var(--ink-2)]'].join(' ')}>
                  {w}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <label className="que-label">Starts</label>
            <input type="date" className="que-input" value={startDate} min={localToday()} onChange={e => setStartDate(e.target.value)} />
          </div>
        </div>

        {/* Wager */}
        <label className="que-label">Wager per player · 🪙</label>
        <input type="text" inputMode="numeric" className="que-input mb-4" value={wager}
          onChange={e => setWager(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0 for a friendly" />

        {error && <p className="font-mono text-[9px] text-[var(--danger)] mb-2">{error}</p>}

        <button type="button" onClick={submit} disabled={busy} className="que-btn-primary w-full py-3 disabled:opacity-40">
          {busy ? 'Creating…' : 'Send team battle'}
        </button>
      </div>
    </div>
  );
}
