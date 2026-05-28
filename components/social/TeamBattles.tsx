'use client';

import { useState, useEffect, useCallback } from 'react';
import { Swords, X, Check, Trophy } from 'lucide-react';
import { motion } from 'framer-motion';
import { BATTLE_CATEGORIES, windowLabel } from '@/lib/battle-categories';

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface MemberLite { id: string; name: string | null; username: string | null; photo: string | null }
interface GroupData  { id: string; name: string; ownerId: string; isOwner: boolean; members: MemberLite[] }
interface Participant { id: string; team: number; accepted: boolean; name: string | null; username: string | null; photo: string | null }
interface BattleData {
  id: string; groupName: string; creatorId: string; mode: 'teams' | 'ffa';
  wager: number; bestOf: number;
  windowKind: string; startDate: string; endDate: string; categories: string[];
  status: string; winningTeam: number | null;
  resolution: {
    summary?: { team0Wins: number; team1Wins: number; ties: number };
    winnerId?: string | null;
    perUser?: Array<{ userId: string; categoryWins: number }>;
  } | null;
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

/** Renders FFA participants in a single row with a trophy on the winner. */
function FFARow({ b }: { b: BattleData }) {
  const winnerId = b.resolution?.winnerId ?? null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="font-mono text-[9px] font-bold tracking-[1px] uppercase text-[var(--ink-3)]">FFA</span>
      {b.participants.map(p => {
        const won = b.status === 'resolved' && winnerId === p.id;
        return (
          <span key={p.id} className="flex items-center gap-1">
            {won && <Trophy size={11} style={{ color: '#FFB547' }} />}
            <Avatar m={p} size={20} />
            <span className="font-mono text-[9px] text-[var(--ink-3)] truncate max-w-[80px]">{NAME(p)}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Renders one or two rows depending on mode (FFA single line, teams A+B). */
function PlayersRows({ b }: { b: BattleData }) {
  if (b.mode === 'ffa') return <FFARow b={b} />;
  return (<><TeamRow b={b} team={0} /><TeamRow b={b} team={1} /></>);
}

// ── Live standings (active battles) ─────────────────────────────────────────

type StandingsData =
  | { mode: 'teams'; started: boolean; team0Wins: number; team1Wins: number;
      perCategory: Array<{ slug: string; label: string; unit: string; team0Score: number | null; team1Score: number | null; leader: 0 | 1 | null }> }
  | { mode: 'ffa'; started: boolean; leaderboard: Array<{ userId: string; categoryWins: number }>;
      perCategory: Array<{ slug: string; label: string; unit: string; scores: Array<{ userId: string; score: number | null }>; leaderId: string | null }> };

function StandingsView({ battleId, battle }: { battleId: string; battle: BattleData }) {
  const [data, setData] = useState<StandingsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/team-battles/${battleId}/standings`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then((d: StandingsData | null) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [battleId]);

  const nameOf   = (uid: string) => { const p = battle.participants.find(x => x.id === uid); return p ? NAME(p) : '—'; };
  const fmtScore = (s: number | null, unit: string) => (s === null ? '—' : `${Math.round(s * 10) / 10} ${unit}`);

  if (loading)        return <p className="font-mono text-[9px] text-[var(--ink-3)] mt-2">Loading standings…</p>;
  if (!data)          return <p className="font-mono text-[9px] text-[var(--ink-3)] mt-2">No standings yet.</p>;
  if (!data.started)  return <p className="font-mono text-[9px] text-[var(--ink-3)] mt-2">Hasn&apos;t started yet — standings update once the window begins.</p>;

  return (
    <div className="mt-2 pt-2 border-t border-[rgba(255,181,71,0.2)] space-y-2">
      {data.mode === 'teams' ? (
        <>
          <p className="font-mono text-[10px] font-bold text-[var(--ink-0)]">
            Team A <span style={{ color: '#FFB547' }}>{data.team0Wins}</span> – <span style={{ color: '#4FC3F7' }}>{data.team1Wins}</span> Team B
          </p>
          <div className="space-y-1">
            {data.perCategory.map(c => (
              <div key={c.slug} className="flex items-center justify-between font-mono text-[9px]">
                <span className="text-[var(--ink-3)] truncate mr-2">{c.label}</span>
                <span className="flex-shrink-0">
                  <span style={{ color: c.leader === 0 ? '#FFB547' : 'var(--ink-2)', fontWeight: c.leader === 0 ? 700 : 400 }}>{fmtScore(c.team0Score, c.unit)}</span>
                  <span className="text-[var(--ink-3)]"> · </span>
                  <span style={{ color: c.leader === 1 ? '#4FC3F7' : 'var(--ink-2)', fontWeight: c.leader === 1 ? 700 : 400 }}>{fmtScore(c.team1Score, c.unit)}</span>
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-1">
          {data.leaderboard.map((row, i) => (
            <div key={row.userId} className="flex items-center justify-between font-mono text-[9px]">
              <span className={i === 0 ? 'text-[var(--ink-0)] font-bold' : 'text-[var(--ink-1)]'}>
                {i + 1}. {nameOf(row.userId)}
              </span>
              <span style={{ color: i === 0 ? '#FFB547' : 'var(--ink-3)' }}>{row.categoryWins} {row.categoryWins === 1 ? 'win' : 'wins'}</span>
            </div>
          ))}
        </div>
      )}
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
  const [openStandings, setOpenStandings] = useState<string | null>(null);
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
                <div className="space-y-1 mb-2"><PlayersRows b={b} /></div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-[var(--ink-3)]">{b.wager} 🪙 · Bo{b.bestOf} · {windowLabel(b.windowKind)}</span>
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
                  <div className="space-y-1 mb-1.5"><PlayersRows b={b} /></div>
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
                <div className="space-y-1 mb-1"><PlayersRows b={b} /></div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] text-[var(--ink-3)]">{b.wager} 🪙 · Bo{b.bestOf} · ends {fmtMDY(b.endDate)}</span>
                  <button type="button" onClick={() => setOpenStandings(openStandings === b.id ? null : b.id)}
                    className="font-mono text-[9px] font-bold tracking-[0.5px] uppercase" style={{ color: '#FFB547' }}>
                    {openStandings === b.id ? 'Hide' : 'Standings'}
                  </button>
                </div>
                {openStandings === b.id && <StandingsView battleId={b.id} battle={b} />}
              </div>
            ))}

            {/* Resolved */}
            {feed.resolved.map(b => {
              const s        = b.resolution?.summary;
              const winnerId = b.resolution?.winnerId ?? null;
              const winnerP  = b.mode === 'ffa' ? b.participants.find(p => p.id === winnerId) ?? null : null;
              const label    = b.status === 'cancelled' ? 'cancelled'
                : b.mode === 'ffa'
                  ? (winnerP ? `${NAME(winnerP)} won FFA` : 'tie')
                  : (b.winningTeam === null
                      ? 'tie'
                      : `Team ${b.winningTeam === 0 ? 'A' : 'B'} won${s ? ` ${Math.max(s.team0Wins, s.team1Wins)}–${Math.min(s.team0Wins, s.team1Wins)}` : ''}`);
              const iWon = b.status === 'resolved' && (
                b.mode === 'ffa' ? winnerId === meId
                                 : (b.winningTeam !== null && b.myTeam === b.winningTeam)
              );
              const isTie = b.mode === 'ffa' ? winnerId === null : b.winningTeam === null;
              return (
                <div key={b.id} className="rounded-md border border-[var(--line)] bg-[var(--bg-2)]/50 px-3 py-2 opacity-90">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[var(--ink-1)] truncate">{b.groupName}</span>
                    <span className="font-mono text-[9px] font-bold tracking-[0.5px] uppercase"
                      style={{ color: b.status === 'cancelled' ? 'var(--ink-3)' : iWon ? 'var(--positive)' : isTie ? 'var(--ink-2)' : 'var(--danger)' }}>
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

const GROUP_COLOR: Record<string, string> = { cardio: '#6DFF99', lift: '#4FC3F7', diet: '#FFB547' };
const GROUP_LABEL: Record<string, string> = { cardio: 'Cardio',  lift: 'Lift',    diet: 'Diet'    };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[10px] font-bold tracking-[1.5px] uppercase text-[var(--ink-1)]">{children}</p>;
}
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function fmtMDY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}
function fmtRange(start: string, end: string): string {
  return start === end ? fmtMDY(start) : `${fmtMDY(start)} – ${fmtMDY(end)}`;
}

function CreateTeamBattle({ meId, groups, initialGroupId, busy, onClose, onCreated, setBusy }: {
  meId: string; groups: GroupData[]; initialGroupId: string | null; busy: boolean;
  onClose: () => void; onCreated: () => void; setBusy: (b: boolean) => void;
}) {
  const [groupId, setGroupId] = useState(initialGroupId ?? groups[0]?.id ?? '');
  const group = groups.find(g => g.id === groupId) ?? null;

  const [mode,   setMode]   = useState<'teams' | 'ffa'>('teams');
  const [assign, setAssign] = useState<Record<string, number>>({ [meId]: 0 });   // teams mode: 0|1 per uid
  const [picked, setPicked] = useState<Set<string>>(new Set([meId]));             // ffa mode: set of uids

  const [bestOf,     setBestOf]     = useState<1 | 3 | 5>(1);
  const [cats,       setCats]       = useState<string[]>([]);
  const [windowKind, setWindowKind] = useState<'day' | '3day' | 'week'>('day');
  const [startDate,  setStartDate]  = useState(localToday());
  const [wager,      setWager]      = useState(5);
  const [error,      setError]      = useState('');

  // Group change → reset player selections (creator included if a member).
  useEffect(() => {
    const meIsMember = group?.members.some(m => m.id === meId) ?? false;
    setAssign(meIsMember ? { [meId]: 0 } : {});
    setPicked(new Set(meIsMember ? [meId] : []));
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setCats(prev => prev.slice(0, bestOf)); }, [bestOf]);

  // Switching to teams drops any lower-is-better cats (only legal in FFA).
  useEffect(() => {
    if (mode === 'teams') {
      setCats(prev => prev.filter(slug => BATTLE_CATEGORIES.find(c => c.slug === slug)?.direction === 'higher'));
    }
  }, [mode]);

  const cycleTeam = (uid: string) =>
    setAssign(prev => {
      const cur = prev[uid];
      const next = { ...prev };
      if (cur === undefined) next[uid] = 0;
      else if (cur === 0)    next[uid] = 1;
      else                   delete next[uid];
      return next;
    });
  const togglePicked = (uid: string) =>
    setPicked(prev => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });

  const teamA  = Object.keys(assign).filter(u => assign[u] === 0);
  const teamB  = Object.keys(assign).filter(u => assign[u] === 1);
  const ffaIds = Array.from(picked);

  const visibleCats = mode === 'teams'
    ? BATTLE_CATEGORIES.filter(c => c.direction === 'higher')
    : BATTLE_CATEGORIES;
  const groupedCats = (['cardio', 'lift', 'diet'] as const)
    .map(g => ({ key: g, items: visibleCats.filter(c => c.group === g) }))
    .filter(g => g.items.length > 0);

  const toggleCat = (slug: string) =>
    setCats(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : prev.length >= bestOf ? prev : [...prev, slug]);

  const nPlayers = mode === 'teams' ? teamA.length + teamB.length : ffaIds.length;
  const pot      = wager * Math.max(0, nPlayers);
  const potDesc  = mode === 'teams' ? 'Winning team splits' : 'Winner takes all';

  const canSend = !busy && cats.length === bestOf && (mode === 'teams'
    ? teamA.length > 0 && teamB.length > 0 && teamA.length === teamB.length && assign[meId] !== undefined
    : ffaIds.length >= 2 && picked.has(meId));

  const submit = async () => {
    setError('');
    if (!group) { setError('Pick a group'); return; }
    if (mode === 'teams') {
      if (teamA.length === 0 || teamB.length === 0) { setError('Both teams need at least one player'); return; }
      if (teamA.length !== teamB.length)             { setError('Teams must be the same size');         return; }
      if (assign[meId] === undefined)                { setError('You have to be in the battle');        return; }
    } else {
      if (ffaIds.length < 2) { setError('FFA needs at least 2 players'); return; }
      if (!picked.has(meId)) { setError('You have to be in the battle'); return; }
    }
    if (cats.length !== bestOf) { setError(`Pick exactly ${bestOf} categor${bestOf === 1 ? 'y' : 'ies'}`); return; }
    if (wager < 0)              { setError('Invalid wager'); return; }

    const body = mode === 'teams'
      ? { mode, groupId, teamA, teamB, wager, bestOf, windowKind, startDate, categories: cats }
      : { mode, groupId, participants: ffaIds, wager, bestOf, windowKind, startDate, categories: cats };

    setBusy(true);
    try {
      const res = await fetch('/api/team-battles', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? 'Could not create battle'); return; }
      onCreated();
    } finally { setBusy(false); }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[450] flex items-end md:items-center justify-center backdrop-blur-sm px-0 md:px-3"
      style={{ background: 'rgba(7,8,10,0.92)' }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="w-full md:max-w-[460px] max-h-[92dvh] flex flex-col rounded-t-2xl md:rounded-2xl bg-[var(--bg-1)] overflow-hidden"
        initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{ boxShadow: '0 0 0 1px rgba(255,181,71,0.4), 0 -2px 0 0 #FFB547, 0 40px 80px rgba(0,0,0,0.7)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[var(--line)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Swords size={18} style={{ color: '#FFB547' }} />
            <h3 className="font-display text-[18px] tracking-[2px] uppercase text-[var(--ink-0)]">Group Battle</h3>
          </div>
          <button onClick={onClose} className="w-11 h-11 flex items-center justify-center text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Group */}
          <div>
            <SectionLabel>Group</SectionLabel>
            <select className="que-input mt-1.5 cursor-pointer" value={groupId} onChange={e => setGroupId(e.target.value)}>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.members.length})</option>)}
            </select>
          </div>

          {/* Mode */}
          <div>
            <SectionLabel>Mode</SectionLabel>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              {(['teams', 'ffa'] as const).map(m => {
                const active = mode === m;
                return (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className="text-left px-3 py-2.5 rounded-md border transition-all"
                    style={{ borderColor: active ? '#FFB547' : 'var(--line)', background: active ? 'rgba(255,181,71,0.10)' : 'var(--bg-2)' }}>
                    <p className="font-mono text-[10px] font-bold tracking-[0.5px]" style={{ color: active ? '#FFB547' : 'var(--ink-0)' }}>
                      {m === 'teams' ? 'Teams' : 'Free-for-all'}
                    </p>
                    <p className="font-mono text-[9px] text-[var(--ink-3)] mt-0.5">
                      {m === 'teams' ? 'A vs B · split pot' : 'Each player · winner takes pot'}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Players */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <SectionLabel>Players</SectionLabel>
              <span className="font-mono text-[9px] text-[var(--ink-3)]">
                {mode === 'teams' ? `A ${teamA.length} v ${teamB.length} B` : `${ffaIds.length} in`}
              </span>
            </div>
            <div className="space-y-1">
              {group?.members.map(m => {
                if (mode === 'teams') {
                  const t = assign[m.id];
                  return (
                    <button key={m.id} type="button" onClick={() => cycleTeam(m.id)}
                      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md border border-[var(--line)] bg-[var(--bg-2)] hover:border-[var(--line-3)] transition-all">
                      <Avatar m={m} size={26} />
                      <span className="font-mono text-[11px] text-[var(--ink-1)] flex-1 text-left truncate">{NAME(m)}{m.id === meId ? ' (you)' : ''}</span>
                      <span className={['w-8 h-7 rounded-sm flex items-center justify-center font-mono text-[10px] font-bold',
                        t === 0 ? 'bg-[#FFB547] text-black' : t === 1 ? 'bg-[#4FC3F7] text-black' : 'border border-[var(--line-2)] text-[var(--ink-3)]'].join(' ')}>
                        {t === 0 ? 'A' : t === 1 ? 'B' : '—'}
                      </span>
                    </button>
                  );
                }
                const on = picked.has(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => togglePicked(m.id)}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md border transition-all"
                    style={{ borderColor: on ? '#FFB547' : 'var(--line)', background: on ? 'rgba(255,181,71,0.10)' : 'var(--bg-2)' }}>
                    <Avatar m={m} size={26} />
                    <span className="font-mono text-[11px] flex-1 text-left truncate" style={{ color: on ? '#FFB547' : 'var(--ink-1)' }}>
                      {NAME(m)}{m.id === meId ? ' (you)' : ''}
                    </span>
                    <span className="w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0"
                      style={{ background: on ? '#FFB547' : 'transparent', border: `1px solid ${on ? '#FFB547' : 'var(--line-2)'}` }}>
                      {on && <Check size={11} style={{ color: '#000' }} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* When */}
          <div>
            <SectionLabel>When</SectionLabel>
            <div className="flex gap-2 mt-1.5">
              <div className="flex rounded-md border border-[var(--line)] overflow-hidden">
                {(['day', '3day', 'week'] as const).map(w => (
                  <button key={w} type="button" onClick={() => setWindowKind(w)}
                    className="px-3 py-2 font-mono text-[10px] font-bold tracking-[0.5px] uppercase transition-colors"
                    style={{ background: windowKind === w ? 'rgba(255,181,71,0.16)' : 'transparent', color: windowKind === w ? '#FFB547' : 'var(--ink-2)' }}>
                    {w === 'day' ? '1 day' : w === '3day' ? '3 days' : '7 days'}
                  </button>
                ))}
              </div>
              <input type="date" className="que-input flex-1 text-[11px]" value={startDate} min={localToday()} onChange={e => setStartDate(e.target.value)} />
            </div>
            <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1.5 tabular-nums">
              {fmtRange(startDate, addDaysISO(startDate, windowKind === 'week' ? 6 : windowKind === '3day' ? 2 : 0))}
            </p>
          </div>

          {/* Format */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <SectionLabel>Format</SectionLabel>
              <span className="font-mono text-[9px] text-[var(--ink-3)]">{bestOf === 1 ? 'one category' : `winner takes ${Math.ceil(bestOf/2)}+`}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {([1, 3, 5] as const).map(n => {
                const active = bestOf === n;
                return (
                  <button key={n} type="button" onClick={() => setBestOf(n)}
                    className="py-2.5 rounded-md border transition-all"
                    style={{ borderColor: active ? '#FFB547' : 'var(--line)', background: active ? 'rgba(255,181,71,0.10)' : 'var(--bg-2)' }}>
                    <span className="font-display text-[20px] leading-none block" style={{ color: active ? '#FFB547' : 'var(--ink-1)' }}>Bo{n}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Categories */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <SectionLabel>Categories</SectionLabel>
              <span className="font-mono text-[9px] tabular-nums font-bold" style={{ color: cats.length === bestOf ? 'var(--positive)' : 'var(--ink-3)' }}>
                {cats.length} / {bestOf}
              </span>
            </div>
            <div className="space-y-3">
              {groupedCats.map(g => (
                <div key={g.key}>
                  <p className="font-mono text-[9px] font-bold tracking-[1px] uppercase mb-1.5" style={{ color: GROUP_COLOR[g.key] }}>{GROUP_LABEL[g.key]}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.items.map(c => {
                      const sel   = cats.includes(c.slug);
                      const atCap = !sel && cats.length >= bestOf;
                      const color = GROUP_COLOR[c.group];
                      return (
                        <button key={c.slug} type="button" onClick={() => toggleCat(c.slug)} disabled={atCap}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-full border font-mono text-[10px] font-bold transition-all min-h-9 active:scale-95"
                          style={{
                            borderColor: sel ? color : 'var(--line)',
                            background:  sel ? `${color}22` : 'var(--bg-2)',
                            color:       sel ? color : atCap ? 'var(--ink-3)' : 'var(--ink-1)',
                            opacity:     atCap ? 0.4 : 1,
                          }}>
                          {sel && <Check size={11} strokeWidth={3} />}
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scoring summary */}
          {cats.length > 0 && (
            <div className="rounded-md border border-[var(--line)] bg-[var(--bg-2)] divide-y divide-[var(--line)]">
              {cats.map(slug => {
                const cat = BATTLE_CATEGORIES.find(c => c.slug === slug);
                if (!cat) return null;
                return (
                  <div key={slug} className="flex items-start gap-2 p-2.5">
                    <span className="block w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[5px]" style={{ background: GROUP_COLOR[cat.group] }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-[10px] font-bold text-[var(--ink-1)]">{cat.label}</p>
                      <p className="font-mono text-[9px] text-[var(--ink-3)] leading-relaxed mt-0.5">{cat.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Wager */}
          <div>
            <SectionLabel>Wager per player</SectionLabel>
            <div className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--bg-2)] p-1 mt-1.5">
              <button type="button" onClick={() => setWager(w => Math.max(0, w - 1))} disabled={wager <= 0}
                className="w-11 h-11 flex items-center justify-center rounded text-[var(--ink-1)] text-2xl hover:bg-[var(--bg-3)] transition-colors disabled:opacity-30">−</button>
              <div className="flex-1 flex items-baseline justify-center gap-1.5">
                <span className="font-display tabular-nums text-[32px] leading-none" style={{ color: '#FFB547' }}>{wager}</span>
                <span className="font-mono text-[11px] text-[var(--ink-3)]">🪙</span>
              </div>
              <button type="button" onClick={() => setWager(w => Math.min(100, w + 1))} disabled={wager >= 100}
                className="w-11 h-11 flex items-center justify-center rounded text-[var(--ink-1)] text-2xl hover:bg-[var(--bg-3)] transition-colors disabled:opacity-30">+</button>
            </div>
            <p className="font-mono text-[9px] text-[var(--ink-3)] text-center mt-1.5">
              Pot: <span className="text-[var(--ink-1)] font-bold tabular-nums">{pot}</span> 🪙 · {potDesc}
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-[rgba(248,113,113,0.3)] bg-[rgba(248,113,113,0.06)] px-3 py-2">
              <p className="font-mono text-[10px] text-[var(--danger)]">{error}</p>
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="flex gap-2 p-4 border-t border-[var(--line)] flex-shrink-0"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={onClose} className="flex-1 que-btn-ghost py-3.5">Cancel</button>
          <button type="button" onClick={submit} disabled={!canSend}
            className="flex-1 py-3.5 rounded-md font-mono text-[10px] font-bold tracking-[1px] uppercase transition-all disabled:opacity-40 active:scale-[0.98]"
            style={{ background: '#FFB547', color: '#07080A', boxShadow: canSend ? '0 0 0 1px #FFB547, 0 0 20px rgba(255,181,71,0.3)' : 'none' }}>
            {busy ? '…' : `Send · ${wager} 🪙`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
