/**
 * POST /api/admin/migrate-days
 *
 * One-time migration: reads WorkoutData.localDB for every user and backfills
 * individual DayRecord rows. Existing rows are never overwritten (skipDuplicates).
 *
 * Protected by CRON_SECRET. Run once, then this endpoint can be deleted.
 *
 * curl -X POST https://<your-domain>/api/admin/migrate-days \
 *   -H "Authorization: Bearer <CRON_SECRET>"
 */

import { NextResponse } from 'next/server';
import { prisma }       from '@/lib/prisma';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type DayRecordClient = {
  createMany: (args: {
    data:           Array<{ userId: string; date: string; data: unknown }>;
    skipDuplicates: boolean;
  }) => Promise<{ count: number }>;
};

export async function POST(req: Request): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allWorkoutData = await prisma.workoutData.findMany({
    select: { userId: true, localDB: true },
  });

  const dr = (prisma as unknown as { dayRecord: DayRecordClient }).dayRecord;

  let totalMigrated = 0;
  let totalSkipped  = 0;
  let usersWithData = 0;

  for (const wd of allWorkoutData) {
    const blob  = (wd.localDB ?? {}) as Record<string, unknown>;
    const dates = Object.keys(blob).filter(k => DATE_RE.test(k));
    if (dates.length === 0) continue;

    usersWithData++;

    const rows = dates.map(date => ({ userId: wd.userId, date, data: blob[date] }));
    const { count } = await dr.createMany({ data: rows, skipDuplicates: true });

    totalMigrated += count;
    totalSkipped  += rows.length - count;
  }

  return NextResponse.json({
    ok:           true,
    users:        allWorkoutData.length,
    usersWithData,
    migrated:     totalMigrated,
    skipped:      totalSkipped,
  });
}
