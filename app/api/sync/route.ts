/**
 * app/api/sync/route.ts
 *
 * GET  /api/sync  — pull the user's cloud snapshot
 * POST /api/sync  — push a partial or full snapshot update
 *
 * Auth: JWT session via NextAuth (no DB sessions needed).
 * Data model: one WorkoutData row per AppUser, storing JSON blobs.
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

  const wd = await prisma.workoutData.findUnique({
    where: { userId: session.user.id },
  });

  if (!wd) return NextResponse.json({});

  return NextResponse.json({
    localDB:  wd.localDB,
    profile:  wd.profile,
    settings: wd.settings,
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

  // Read existing row so we can deep-merge settings (never discard keys like
  // queAthletePlan that might not be in every push payload).
  const existing = await prisma.workoutData.findUnique({ where: { userId } });
  const existingSettings = (existing?.settings ?? {}) as Record<string, unknown>;
  const mergedSettings   = body.settings !== undefined
    ? { ...existingSettings, ...body.settings }
    : existingSettings;

  const saved = await prisma.workoutData.upsert({
    where:  { userId },
    create: {
      userId,
      localDB:  (body.localDB  ?? {}) as never,
      profile:  (body.profile  ?? {}) as never,
      settings: mergedSettings as never,
      syncedAt: new Date(),
    },
    update: {
      ...(body.localDB !== undefined && { localDB: body.localDB as never }),
      ...(body.profile !== undefined && { profile: body.profile as never }),
      settings: mergedSettings as never,
      syncedAt: new Date(),
    },
  });

  // Award any newly earned badges — fire-and-forget, never blocks the sync response
  checkAndAwardBadges(userId, {
    localDB:  saved.localDB  as Record<string, unknown>,
    settings: mergedSettings as Record<string, unknown>,
  }).catch(() => { /* non-critical */ });

  return NextResponse.json({ ok: true });
}
