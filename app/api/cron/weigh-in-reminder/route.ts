/**
 * GET /api/cron/weigh-in-reminder
 *
 * Scheduled at 13:00 UTC (8 am ET) daily by Vercel Cron.
 * Sends a morning weigh-in push to every subscribed user who hasn't
 * logged their weight for today yet.
 * Protected by CRON_SECRET.
 */

import { NextResponse }   from 'next/server';
import { prisma }         from '@/lib/prisma';
import { sendPushToUser } from '@/lib/push';

interface DayRecord {
  weight?: string | number;
}

type PushSubClient = {
  findMany: (args: {
    distinct: string[];
    select:   Record<string, boolean>;
  }) => Promise<Array<{ userId: string }>>;
};

const ps = () => (prisma as unknown as { pushSubscription: PushSubClient }).pushSubscription;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function hasLoggedWeight(day: DayRecord | undefined): boolean {
  if (!day?.weight) return false;
  return parseFloat(String(day.weight)) > 0;
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayUTC();

  const subscribers = await ps().findMany({
    distinct: ['userId'],
    select:   { userId: true },
  });

  if (subscribers.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 0, date: today });
  }

  const userIds = subscribers.map(s => s.userId);

  const workoutRows = await prisma.workoutData.findMany({
    where:  { userId: { in: userIds } },
    select: { userId: true, localDB: true },
  });

  const dataByUser = new Map(workoutRows.map(r => [r.userId, r]));

  let sent = 0, skipped = 0;

  for (const { userId } of subscribers) {
    const row      = dataByUser.get(userId);
    const localDB  = (row?.localDB ?? {}) as Record<string, DayRecord>;

    if (hasLoggedWeight(localDB[today])) {
      skipped++;
      continue;
    }

    await sendPushToUser(userId, {
      title: 'Morning weigh-in ⚖️',
      body:  'Log your weight to keep your trend accurate.',
      url:   '/app',
    });
    sent++;
  }

  console.log(`[cron/weigh-in-reminder] ${today} — sent:${sent} skipped:${skipped}`);
  return NextResponse.json({ ok: true, date: today, sent, skipped });
}
