/**
 * GET /api/cron/sync-steps
 *
 * Scheduled at 02:00 UTC daily by Vercel Cron (vercel.json).
 * For every user with a connected HealthConnection, pulls step counts from
 * Google Fit and writes them into the user's DayRecord rows — the authoritative
 * per-day store that /api/sync reads. (The old WorkoutData.localDB blob is no
 * longer authoritative; writing there got silently overridden by DayRecord rows
 * on the next pull, which is why nightly steps never reached other devices.)
 *
 * Syncs BOTH yesterday and today (UTC): at 02:00 UTC "today" has barely begun
 * for US users (≈0 steps), so we also backfill the just-completed day. Steps are
 * merged into each day (preserving calories/workouts) and stamped with a fresh
 * _editedAt so the client's newer-wins pull picks them up on every device.
 *
 * Protected by CRON_SECRET (Vercel sends Authorization: Bearer <CRON_SECRET>).
 */

import { NextResponse }       from 'next/server';
import { prisma }             from '@/lib/prisma';
import { mapWithConcurrency } from '@/lib/asyncBatch';

// ─── Token refresh ────────────────────────────────────────────────────────────

async function refreshAccessToken(conn: {
  userId:             string;
  googleRefreshToken: string | null;
}): Promise<string | null> {
  if (!conn.googleRefreshToken) return null;

  const clientId     = process.env.GOOGLE_FIT_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: conn.googleRefreshToken,
      client_id:     clientId!,
      client_secret: clientSecret!,
      grant_type:    'refresh_token',
    }),
  });

  if (!res.ok) return null;

  const data = await res.json() as { access_token: string; expires_in: number };
  await prisma.healthConnection.update({
    where: { userId: conn.userId },
    data:  {
      googleAccessToken: data.access_token,
      googleExpiresAt:   new Date(Date.now() + data.expires_in * 1_000),
    },
  });

  return data.access_token;
}

// ─── Google Fit step fetch ────────────────────────────────────────────────────

async function fetchSteps(token: string, dateStr: string): Promise<number | null> {
  const dayStart = new Date(`${dateStr}T00:00:00Z`).getTime();
  const dayEnd   = dayStart + 86_400_000;

  const res = await fetch(
    'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aggregateBy:     [{ dataTypeName: 'com.google.step_count.delta' }],
        bucketByTime:    { durationMillis: 86_400_000 },
        startTimeMillis: String(dayStart),
        endTimeMillis:   String(dayEnd),
      }),
    }
  );

  if (!res.ok) return null;

  const data = await res.json() as {
    bucket: Array<{ dataset: Array<{ point: Array<{ value: Array<{ intVal?: number }> }> }> }>;
  };

  return (
    data.bucket?.[0]?.dataset?.[0]?.point?.reduce(
      (s, pt) => s + (pt.value?.[0]?.intVal ?? 0),
      0
    ) ?? 0
  );
}

// ─── DayRecord access (untyped, same pattern as /api/sync) ──────────────────────

type DayClient = {
  findUnique: (args: unknown) => Promise<{ data: unknown } | null>;
  upsert:     (args: unknown) => Promise<unknown>;
};
const dr = () => (prisma as unknown as { dayRecord: DayClient }).dayRecord;

async function writeSteps(userId: string, date: string, steps: number): Promise<'synced' | 'skipped'> {
  const existing = await dr().findUnique({
    where:  { userId_date: { userId, date } },
    select: { data: true },
  });
  const prev = (existing?.data ?? {}) as Record<string, unknown>;
  // Don't churn the row (or bump _editedAt) when the count hasn't changed.
  if (Number(prev.steps ?? 0) === steps) return 'skipped';

  const data = { ...prev, steps, _editedAt: new Date().toISOString() };
  await dr().upsert({
    where:  { userId_date: { userId, date } },
    create: { userId, date, data },
    update: { data },
  });
  return 'synced';
}

// ─── Cron handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now       = new Date();
  const today     = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const dates     = [yesterday, today]; // yesterday = the just-completed day

  const connections = await prisma.healthConnection.findMany({
    where:  { googleAccessToken: { not: null } },
    select: { userId: true, googleAccessToken: true, googleRefreshToken: true, googleExpiresAt: true },
  });

  // Process connections with bounded concurrency: the slow part is per-user
  // Google Fit / token-refresh network calls, which overlap safely; DB writes
  // queue through Prisma's pool. 10 keeps us well under Google's API quota.
  const settled = await mapWithConcurrency(connections, 10, async (conn) => {
    const r = { synced: 0, skipped: 0, failed: 0 };
    let token = conn.googleAccessToken!;
    if (conn.googleExpiresAt && conn.googleExpiresAt.getTime() < Date.now() + 60_000) {
      const refreshed = await refreshAccessToken(conn);
      if (!refreshed) { r.failed += dates.length; return r; }
      token = refreshed;
    }
    for (const date of dates) {
      const steps = await fetchSteps(token, date);
      if (steps === null) { r.failed++; continue; }
      if (steps === 0)    { r.skipped++; continue; }
      const outcome = await writeSteps(conn.userId, date, steps);
      if (outcome === 'synced') r.synced++; else r.skipped++;
    }
    return r;
  });

  let synced = 0, skipped = 0, failed = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled') {
      synced  += s.value.synced;
      skipped += s.value.skipped;
      failed  += s.value.failed;
    } else {
      failed += dates.length; // worker threw unexpectedly — count its dates as failed
      console.error('[cron/sync-steps] worker error:', s.reason);
    }
  }

  console.log(`[cron/sync-steps] synced:${synced} skipped:${skipped} failed:${failed}`);
  return NextResponse.json({ ok: true, dates, synced, skipped, failed });
}
