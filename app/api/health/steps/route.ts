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
import { stepLimit }    from '@/lib/ratelimit';

export async function POST(req: Request): Promise<NextResponse> {
  // Rate-limit by IP first — this caps brute-forcing the token and stops the
  // per-request DB token lookup below from being hammered by anonymous traffic.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon';
  const { success } = await stepLimit.limit(ip);
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

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

  // Find the user whose stepApiToken matches (also grab settings for their tz).
  const workoutData = await prisma.workoutData.findFirst({
    where:  { settings: { path: ['stepApiToken'], equals: token } },
    select: { userId: true, settings: true },
  });

  if (!workoutData) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Prefer the explicit date; otherwise default to the user's LOCAL today using
  // their stored queTzOffset (getTimezoneOffset minutes; local = UTC − offset).
  // Falls back to UTC if the offset isn't stored. Without this, an evening push
  // from a user behind UTC would file steps on the next (future) day.
  const tzOffset = (workoutData.settings as { queTzOffset?: unknown } | null)?.queTzOffset;
  const offsetMin = typeof tzOffset === 'number' ? tzOffset : 0;
  const dateStr =
    typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : new Date(Date.now() - offsetMin * 60_000).toISOString().slice(0, 10);

  // Write to the DayRecord row (the authoritative per-day store /api/sync reads),
  // NOT the legacy WorkoutData.localDB blob — writing the blob got silently
  // overridden by DayRecord rows on the next pull, so steps never propagated.
  // Merge into the day + stamp _editedAt so the client's newer-wins merge keeps it.
  const dr = (prisma as unknown as {
    dayRecord: {
      findUnique: (a: unknown) => Promise<{ data: unknown } | null>;
      upsert:     (a: unknown) => Promise<unknown>;
    };
  }).dayRecord;

  const existing = await dr.findUnique({
    where:  { userId_date: { userId: workoutData.userId, date: dateStr } },
    select: { data: true },
  });
  const data = { ...((existing?.data ?? {}) as Record<string, unknown>), steps, _editedAt: new Date().toISOString() };
  await dr.upsert({
    where:  { userId_date: { userId: workoutData.userId, date: dateStr } },
    create: { userId: workoutData.userId, date: dateStr, data },
    update: { data },
  });

  return NextResponse.json({ ok: true, steps, date: dateStr });
}
