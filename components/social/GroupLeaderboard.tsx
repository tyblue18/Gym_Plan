'use client';

import { useEffect, useState, useCallback } from 'react';
import { Swords } from 'lucide-react';

/**
 * Group leaderboard — ranks the members of a single group by a chosen metric
 * over a trailing window, read-only (no wagers). Backed by
 * GET /api/groups/[id]/leaderboard. Rendered inside the group hub's
 * Leaderboard modal (see GroupFeed).
 */

interface LbRow { userId: string; name: string | null; username: string | null; photo: string | null; value: number | null }
interface LbData { label: string; unit: string; direction: string; range: string; rows: LbRow[]; you: string }

const METRICS = [
  { slug: 'cardio.steps',   label: 'Steps' },
  { slug: 'diet.kcal_more', label: 'Calories' },
  { slug: 'lift.volume',    label: 'Volume' },
] as const;

const RANGES = [
  { id: 'day',  label: '1 day'  },
  { id: '3day', label: '3 days' },
  { id: 'week', label: '1 week' },
] as const;
type RangeId = typeof RANGES[number]['id'];

function fmtVal(n: number, unit: string): string {
  const r = unit === 'mi' ? Math.round(n * 10) / 10 : Math.round(n);
  return r.toLocaleString('en-US');
}

function name(r: LbRow): string {
  return r.name ?? (r.username ? `@${r.username}` : 'Athlete');
}

function Avatar({ r, lead }: { r: LbRow; lead: boolean }) {
  const ring = lead ? 'var(--warn)' : 'var(--bg-1)';
  if (r.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={r.photo} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" style={{ border: `2px solid ${ring}` }} />;
  }
  return (
    <span className="w-9 h-9 rounded-full flex items-center justify-center font-display text-[15px] text-[var(--ink-2)] bg-[var(--bg-3)] flex-shrink-0"
      style={{ border: `2px solid ${ring}` }} aria-hidden="true">
      {name(r).replace('@', '').charAt(0).toUpperCase()}
    </span>
  );
}

export function GroupLeaderboard({ groupId }: { groupId: string }) {
  const [metric,  setMetric]  = useState<string>('cardio.steps');
  const [range,   setRange]   = useState<RangeId>('week');
  const [data,    setData]    = useState<LbData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/groups/${groupId}/leaderboard?metric=${encodeURIComponent(metric)}&range=${range}`, { credentials: 'include' });
      setData(r.ok ? (await r.json()) as LbData : null);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [groupId, metric, range]);
  useEffect(() => { void load(); }, [load]);

  const rows = data?.rows ?? [];
  const max  = rows.reduce((m, r) => (r.value !== null && r.value > m ? r.value : m), 0);
  const unit = data?.unit ?? '';

  return (
    <div>
      {/* Metric tabs */}
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {METRICS.map(m => {
          const on = metric === m.slug;
          return (
            <button key={m.slug} type="button" onClick={() => setMetric(m.slug)}
              className="font-mono text-[10px] font-bold tracking-[0.5px] uppercase rounded-full px-3 py-1.5 border transition-all"
              style={{
                color:      on ? 'var(--warn)' : 'var(--ink-2)',
                background: on ? 'rgba(255,181,71,0.12)' : 'var(--bg-2)',
                borderColor: on ? 'rgba(255,181,71,0.4)' : 'var(--line-2)',
              }}>
              {m.label}
            </button>
          );
        })}
      </div>
      {/* Range tabs */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {RANGES.map(rg => {
          const on = range === rg.id;
          return (
            <button key={rg.id} type="button" onClick={() => setRange(rg.id)}
              className="font-mono text-[10px] font-bold tracking-[0.5px] uppercase rounded-full px-3 py-1.5 border transition-all"
              style={{
                color:      on ? 'var(--warn)' : 'var(--ink-3)',
                background: on ? 'rgba(255,181,71,0.12)' : 'var(--bg-2)',
                borderColor: on ? 'rgba(255,181,71,0.4)' : 'var(--line-2)',
              }}>
              {rg.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="font-mono text-[10px] text-[var(--ink-3)] py-2">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="font-mono text-[9px] text-[var(--ink-3)] py-1">No members to rank yet.</p>
      ) : (
        <div>
          {rows.map((r, i) => {
            const lead    = i === 0 && r.value !== null;
            const you     = r.userId === (data?.you ?? '');
            const noData  = r.value === null;
            const pct     = !noData && max > 0 ? (r.value! / max) * 100 : 0;
            return (
              <div key={r.userId} className="flex items-center gap-3 py-2.5"
                style={i > 0 ? { borderTop: '1px solid var(--line)' } : undefined}>
                <span className="font-display text-[17px] w-5 text-center flex-shrink-0"
                  style={{ color: lead ? 'var(--warn)' : 'var(--ink-2)' }}>{i + 1}</span>
                <Avatar r={r} lead={lead} />
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[12px] font-bold truncate"
                    style={you ? { color: 'var(--accent)' } : undefined}>
                    {name(r)}{you && ' · you'}
                  </p>
                  <div className="h-[7px] rounded mt-1.5 overflow-hidden bg-[var(--bg-3)]">
                    <div className="h-full rounded" style={{ width: `${pct}%`, background: lead ? 'var(--warn)' : 'var(--accent)' }} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-mono text-[13px] font-bold tabular-nums leading-none">
                    {noData ? '—' : fmtVal(r.value!, unit)}
                  </p>
                  <p className="font-mono text-[9px] text-[var(--ink-3)] mt-1">{unit}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="font-mono text-[9px] text-[var(--ink-3)] mt-3 flex items-center gap-1.5">
        <Swords size={11} /> Live ranking · whole group · updates as members log
      </p>
    </div>
  );
}
