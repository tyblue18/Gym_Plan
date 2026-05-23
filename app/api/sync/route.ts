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

  const [wd, dayRows] = await Promise.all([
    prisma.workoutData.findUnique({ where: { userId } }),
    prisma.dayRecord.findMany({ where: { userId }, select: { date: true, data: true } }),
  ]);

  // Merge: legacy blob provides the base, DayRecord rows win for days already migrated
  const blobDB  = (wd?.localDB ?? {}) as Record<string, unknown>;
  const rowsMap = Object.fromEntries(dayRows.map(r => [r.date, r.data]));
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

  // ── Each day goes to its own DayRecord row ───────────────────────────────────
  if (body.localDB && Object.keys(body.localDB).length > 0) {
    await Promise.all(
      Object.entries(body.localDB).map(([date, data]) =>
        prisma.dayRecord.upsert({
          where:  { userId_date: { userId, date } },
          create: { userId, date, data: data as never },
          update: { data: data as never },
        })
      )
    );
  }

  // Award any newly earned badges — fire-and-forget, never blocks the sync response
  checkAndAwardBadges(userId, {
    localDB:  (body.localDB  ?? {}) as Record<string, unknown>,
    settings: mergedSettings,
  }).catch(() => { /* non-critical */ });

  return NextResponse.json({ ok: true });
}
