/**
 * GET /api/cron/sync-steps
 *
 * Scheduled at 02:00 UTC daily by Vercel Cron (vercel.json).
 * Pulls today's step count from Google Fit for every user that has a
 * connected HealthConnection, refreshing expired tokens as needed, and
 * writes the result into each user's localDB day record.
 *
 * Protected by CRON_SECRET — Vercel automatically sends
 *   Authorization: Bearer <CRON_SECRET>
 * when invoking cron routes.
 */

import { NextResponse } from 'next/server';
import { prisma }       from '@/lib/prisma';

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

// ─── Cron handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const connections = await prisma.healthConnection.findMany({
    where:   { googleAccessToken: { not: null } },
    include: { user: { include: { workoutData: true } } },
  });

  let synced = 0, skipped = 0, failed = 0;

  for (const conn of connections) {
    try {
      let token = conn.googleAccessToken!;

      if (conn.googleExpiresAt && conn.googleExpiresAt.getTime() < Date.now() + 60_000) {
        const refreshed = await refreshAccessToken(conn);
        if (!refreshed) { failed++; continue; }
        token = refreshed;
      }

      const steps = await fetchSteps(token, today);
      if (steps === null) { failed++; continue; }
      if (steps === 0)    { skipped++; continue; }

      const wd = conn.user.workoutData;

      if (!wd) {
        await prisma.workoutData.create({
          data: { userId: conn.userId, localDB: { [today]: { steps } } },
        });
      } else {
        const db  = (wd.localDB  ?? {}) as Record<string, unknown>;
        const day = (db[today]   ?? {}) as Record<string, unknown>;
        db[today] = { ...day, steps };

        await prisma.workoutData.update({
          where: { id: wd.id },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data:  { localDB: db as any, syncedAt: new Date() },
        });
      }

      synced++;
    } catch (err) {
      console.error(`[cron/sync-steps] user ${conn.userId}:`, err);
      failed++;
    }
  }

  console.log(`[cron/sync-steps] ${today} — synced:${synced} skipped:${skipped} failed:${failed}`);
  return NextResponse.json({ ok: true, date: today, synced, skipped, failed });
}
