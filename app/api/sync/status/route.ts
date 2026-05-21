/**
 * GET /api/sync/status
 * Diagnostic endpoint — visit this URL in the browser to verify sync pipeline.
 * Returns: session state, DB connection, and a summary of stored data.
 * Remove or protect this route after debugging.
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';

export async function GET(): Promise<NextResponse> {
  // 1. Session
  let session = null;
  try { session = await getServerSession(authOptions); } catch { /* noop */ }

  if (!session?.user?.email) {
    return NextResponse.json({
      ok: false,
      step: 'auth',
      error: 'No session — not signed in',
    });
  }

  // 2. DB connection
  let user = null;
  let workoutData = null;
  try {
    user = await prisma.appUser.findUnique({
      where:   { email: session.user.email },
      include: { workoutData: true },
    });
    workoutData = user?.workoutData ?? null;
  } catch (e) {
    return NextResponse.json({
      ok: false,
      step: 'database',
      error: String(e),
      hint: 'DATABASE_URL may be missing or wrong in Vercel env vars',
    });
  }

  // 3. Summary
  const localDB  = (workoutData?.localDB  ?? {}) as Record<string, unknown>;
  const settings = (workoutData?.settings ?? {}) as Record<string, unknown>;
  const dayCount = Object.keys(localDB).length;

  return NextResponse.json({
    ok:    true,
    email: session.user.email,
    userInDB:       !!user,
    workoutDataInDB: !!workoutData,
    dayCount,
    hasProfilePhoto: !!settings['queProfilePhoto'],
    hasAthletePlan:  !!settings['queAthletePlan'],
    syncedAt: workoutData?.syncedAt ?? null,
    days: Object.keys(localDB).slice(-5), // last 5 synced dates
  });
}
