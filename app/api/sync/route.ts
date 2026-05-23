/**
 * app/api/sync/route.ts
 *
 * GET  /api/sync  — pull the user's cloud snapshot
 * POST /api/sync  — push a partial or full snapshot update
 *
 * localDB is stored as individual DayRecord rows (one per YYYY-MM-DD).
 * GET falls back to WorkoutData.localDB blob for days not yet migrated.
 * Profile and settings remain in WorkoutData.
 */

import { getServerSession }        from 'next-auth/next';
import { NextResponse }            from 'next/server';
import { authOptions }             from '@/lib/auth';
import { prisma }                  from '@/lib/prisma';
import { checkAndAwardBadges }     from '@/lib/badgeEngine';
import { syncLimit }               from '@/lib/ratelimit';

// ─────────────────────────────────────────────────────────────────────────────
// GET — pull latest snapshot
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const userId = session.user.id;

  const dayRecordClient = (prisma as unknown as {
    dayRecord: { findMany: (args: unknown) => Promise<Array<{ date: string; data: unknown; updatedAt: Date }>> };
  }).dayRecord;

  const [wd, dayRows] = await Promise.all([
    prisma.workoutData.findUnique({ where: { userId } }),
    dayRecordClient.findMany({ where: { userId }, select: { date: true, data: true, updatedAt: true } }),
  ]);

  // Merge: legacy blob provides the base, DayRecord rows win for days already migrated.
  // Embed _syncedAt so the client can send it back and we can detect stale writes.
  const blobDB  = (wd?.localDB ?? {}) as Record<string, unknown>;
  const rowsMap = Object.fromEntries(
    dayRows.map((r: { date: string; data: unknown; updatedAt: Date }) => [
      r.date,
      { ...(r.data as object), _syncedAt: r.updatedAt.toISOString() },
    ])
  );
  const localDB = { ...blobDB, ...rowsMap };

  return NextResponse.json({
    localDB,
    profile:  wd?.profile  ?? {},
    settings: wd?.settings ?? {},
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — push partial or full snapshot
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const userId = session.user.id;

  const { success } = await syncLimit.limit(userId);
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: {
    localDB?:  Record<string, unknown>;
    profile?:  Record<string, unknown>;
    settings?: Record<string, unknown>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ── Profile + settings go to WorkoutData ────────────────────────────────────
  const existing = await prisma.workoutData.findUnique({ where: { userId } });
  const existingSettings = (existing?.settings ?? {}) as Record<string, unknown>;
  const mergedSettings   = body.settings !== undefined
    ? { ...existingSettings, ...body.settings }
    : existingSettings;

  await prisma.workoutData.upsert({
    where:  { userId },
    create: {
      userId,
      localDB:  {} as never,   // no longer written here
      profile:  (body.profile ?? {}) as never,
      settings: mergedSettings as never,
      syncedAt: new Date(),
    },
    update: {
      ...(body.profile !== undefined && { profile: body.profile as never }),
      settings: mergedSettings as never,
      syncedAt: new Date(),
    },
  });

  // ── Each day goes to its own DayRecord row (with conflict detection) ─────────
  const conflicts: Array<{ date: string; data: unknown }> = [];

  if (body.localDB && Object.keys(body.localDB).length > 0) {
    const dates = Object.keys(body.localDB);

    // Single query to fetch all existing rows for these dates
    const existingRows = await (prisma as unknown as {
      dayRecord: {
        findMany: (args: unknown) => Promise<Array<{ date: string; updatedAt: Date; data: unknown }>>;
      };
    }).dayRecord.findMany({
      where:  { userId, date: { in: dates } },
      select: { date: true, updatedAt: true, data: true },
    });
    const existingMap = new Map(existingRows.map((r: { date: string; updatedAt: Date; data: unknown }) => [r.date, r]));

    const toUpsert: Array<{ date: string; data: unknown }> = [];

    for (const [date, rawData] of Object.entries(body.localDB)) {
      const incoming   = rawData as Record<string, unknown>;
      const syncedAt   = incoming._syncedAt as string | undefined;
      // Strip _syncedAt before storing — it's a transport field, not persisted data
      const { _syncedAt: _, ...cleanData } = incoming;

      const stored = existingMap.get(date) as { date: string; updatedAt: Date; data: unknown } | undefined;
      if (stored && syncedAt && stored.updatedAt > new Date(syncedAt)) {
        // Server row is newer than what the client last saw — client data is stale
        conflicts.push({
          date,
          data: { ...(stored.data as object), _syncedAt: stored.updatedAt.toISOString() },
        });
        continue;
      }

      toUpsert.push({ date, data: cleanData });
    }

    const dr = (prisma as unknown as {
      dayRecord: { upsert: (args: unknown) => Promise<unknown> };
    }).dayRecord;

    await Promise.all(
      toUpsert.map(({ date, data }) =>
        dr.upsert({
          where:  { userId_date: { userId, date } },
          create: { userId, date, data },
          update: { data },
        })
      )
    );
  }

  // Award any newly earned badges — fire-and-forget, never blocks the sync response
  checkAndAwardBadges(userId, {
    localDB:  (body.localDB  ?? {}) as Record<string, unknown>,
    settings: mergedSettings,
  }).catch(() => { /* non-critical */ });

  return NextResponse.json({ ok: true, ...(conflicts.length > 0 && { conflicts }) });
}
