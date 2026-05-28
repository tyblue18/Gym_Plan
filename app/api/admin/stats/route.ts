/**
 * GET /api/admin/stats — lightweight usage dashboard (owner-only).
 *
 * Real capacity/growth numbers pulled straight from Postgres (no schema
 * migration, no per-request write overhead): total / new / active users, data
 * volume, plus a Redis-backed push-syncs/day counter written by /api/sync.
 *
 * "Active" = users whose WorkoutData row was written within the window, i.e.
 * they PUSHED data (logged or changed something) — a meaningful engagement
 * signal for a fitness app, not just an app-open. WorkoutData.updatedAt is
 * bumped on every POST /api/sync, so this is free to read.
 *
 * Auth: Bearer token or ?key=, compared (constant-time) against STATS_SECRET,
 * falling back to CRON_SECRET so it works with no new config. If neither env
 * var is set the endpoint refuses to expose anything.
 *
 *   curl -H "Authorization: Bearer $SECRET" https://<app>/api/admin/stats
 *   …or just open  https://<app>/api/admin/stats?key=<SECRET>  in a browser.
 */

import crypto            from 'node:crypto';
import { NextResponse }  from 'next/server';
import { Redis }         from '@upstash/redis';
import { prisma }        from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const redis = new Redis({
  url:   process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

function expectedSecret(): string | undefined {
  return process.env.STATS_SECRET || process.env.CRON_SECRET || undefined;
}

function authorized(req: Request, expected: string): boolean {
  const url = new URL(req.url);
  const provided =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    url.searchParams.get('key') ||
    '';
  if (provided.length !== expected.length) return false;       // timingSafeEqual needs equal lengths
  try {
    return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch { return false; }
}

function utcDay(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export async function GET(req: Request): Promise<NextResponse> {
  const expected = expectedSecret();
  if (!expected) {
    return NextResponse.json(
      { error: 'Stats endpoint not configured — set STATS_SECRET (or CRON_SECRET) in your environment.' },
      { status: 503 },
    );
  }
  if (!authorized(req, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const since = (days: number) => new Date(now - days * 86_400_000);
  const d1 = since(1), d7 = since(7), d30 = since(30);

  // DayRecord isn't on the generated Prisma client's static types in this repo
  // (the rest of the codebase casts it the same way) — runtime access is fine.
  const dayRecord = (prisma as unknown as {
    dayRecord: { count: (args?: unknown) => Promise<number> };
  }).dayRecord;

  const [
    totalUsers, newUsers1d, newUsers7d, newUsers30d,
    active1d, active7d, active30d,
    drTotal, dr1d, dr7d,
    groups, activeBattles,
  ] = await Promise.all([
    prisma.appUser.count(),
    prisma.appUser.count({ where: { createdAt: { gte: d1  } } }),
    prisma.appUser.count({ where: { createdAt: { gte: d7  } } }),
    prisma.appUser.count({ where: { createdAt: { gte: d30 } } }),
    prisma.workoutData.count({ where: { updatedAt: { gte: d1  } } }),
    prisma.workoutData.count({ where: { updatedAt: { gte: d7  } } }),
    prisma.workoutData.count({ where: { updatedAt: { gte: d30 } } }),
    dayRecord.count(),
    dayRecord.count({ where: { updatedAt: { gte: d1 } } }),
    dayRecord.count({ where: { updatedAt: { gte: d7 } } }),
    prisma.group.count(),
    prisma.teamBattle.count({ where: { status: 'active' } }),
  ]);

  // Push-syncs/day from the Redis counters written by /api/sync (last 7 UTC days).
  const days = Array.from({ length: 7 }, (_, i) => utcDay(i));
  const byDay: Record<string, number> = {};
  let syncsToday = 0, syncs7d = 0;
  try {
    const vals = await redis.mget<(number | string | null)[]>(...days.map(d => `stats:syncs:${d}`));
    days.forEach((d, i) => {
      const n = Number(vals[i] ?? 0) || 0;
      byDay[d] = n;
      syncs7d += n;
      if (i === 0) syncsToday = n;
    });
  } catch { /* redis unavailable — leave zeros */ }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    users: {
      total: totalUsers,
      new: { last24h: newUsers1d, last7d: newUsers7d, last30d: newUsers30d },
    },
    // Users who pushed data (logged/changed something) within the window.
    activeUsers: { last24h: active1d, last7d: active7d, last30d: active30d },
    activity: {
      dayRecordsTotal:          drTotal,
      dayRecordsUpdatedLast24h: dr1d,
      dayRecordsUpdatedLast7d:  dr7d,
    },
    pushSyncs: { today: syncsToday, last7d: syncs7d, byDay },
    social: { groups, activeBattles },
  });
}
