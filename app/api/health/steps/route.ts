/**
 * POST /api/health/steps
 *
 * Accepts a step count from any authenticated client (iOS Shortcut,
 * Tasker, curl, etc.) using a personal bearer token.
 *
 * Headers:
 *   Authorization: Bearer <token>
 *   Content-Type:  application/json
 *
 * Body:
 *   { "steps": 8432, "date": "2025-05-21" }   ← date defaults to today
 *
 * Response:
 *   { "ok": true, "steps": 8432, "date": "2025-05-21" }
 */

import { NextResponse } from 'next/server';
import { prisma }       from '@/lib/prisma';

export async function POST(req: Request): Promise<NextResponse> {
  const auth  = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';

  if (!token) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  let body: { steps?: unknown; date?: unknown };
  try { body = await req.json() as typeof body; }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const steps = typeof body.steps === 'number' ? Math.round(body.steps) : null;
  if (!steps || steps < 0) {
    return NextResponse.json({ error: 'steps must be a positive number' }, { status: 400 });
  }

  const dateStr =
    typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : new Date().toISOString().slice(0, 10);

  // Find the user whose stepApiToken matches
  const workoutData = await prisma.workoutData.findFirst({
    where: {
      settings: { path: ['stepApiToken'], equals: token },
    },
  });

  if (!workoutData) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Merge steps into the day record
  const localDB    = (workoutData.localDB  ?? {}) as Record<string, unknown>;
  const dayRecord  = (localDB[dateStr]     ?? {}) as Record<string, unknown>;
  localDB[dateStr] = { ...dayRecord, steps };

  await prisma.workoutData.update({
    where: { id: workoutData.id },
    data:  { localDB: localDB as Parameters<typeof prisma.workoutData.update>[0]['data']['localDB'], syncedAt: new Date() },
  });

  return NextResponse.json({ ok: true, steps, date: dateStr });
}
