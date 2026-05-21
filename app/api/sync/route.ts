/**
 * app/api/sync/route.ts
 *
 * GET  /api/sync  — pull the user's cloud snapshot
 * POST /api/sync  — push a partial or full snapshot update
 *
 * Auth: JWT session via NextAuth (no DB sessions needed).
 * Data model: one WorkoutData row per AppUser, storing JSON blobs.
 */

import { getServerSession }  from 'next-auth/next';
import { NextResponse }      from 'next/server';
import { authOptions }       from '@/lib/auth';
import { prisma }            from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// GET — pull latest snapshot
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json(null, { status: 401 });
  }

  const user = await prisma.appUser.findUnique({
    where:   { email: session.user.email },
    include: { workoutData: true },
  });

  if (!user?.workoutData) {
    return NextResponse.json({});
  }

  return NextResponse.json({
    localDB:  user.workoutData.localDB,
    profile:  user.workoutData.profile,
    settings: user.workoutData.settings,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — push partial or full snapshot
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json(null, { status: 401 });
  }

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

  // Upsert the user row (first sync creates it)
  const user = await prisma.appUser.upsert({
    where:  { email: session.user.email },
    create: { email: session.user.email, name: session.user.name ?? undefined },
    update: { name: session.user.name ?? undefined },
  });

  // Merge only the fields that were sent — a partial push (e.g. profile only)
  // will not overwrite fields that weren't included.
  await prisma.workoutData.upsert({
    where:  { userId: user.id },
    create: {
      userId:   user.id,
      localDB:  (body.localDB  ?? {}) as never,
      profile:  (body.profile  ?? {}) as never,
      settings: (body.settings ?? {}) as never,
      syncedAt: new Date(),
    },
    update: {
      ...(body.localDB  !== undefined && { localDB:  body.localDB  as never }),
      ...(body.profile  !== undefined && { profile:  body.profile  as never }),
      ...(body.settings !== undefined && { settings: body.settings as never }),
      syncedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
