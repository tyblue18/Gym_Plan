/**
 * GET /api/cron/daily-nudge
 *
 * Scheduled at 20:00 UTC daily by Vercel Cron.
 * For every user with a push subscription, checks today's localDB entry.
 * Sends a targeted nudge if they haven't logged food, a workout, or either.
 * Protected by CRON_SECRET.
 */

import { NextResponse }     from 'next/server';
import { prisma }           from '@/lib/prisma';
import { sendPushToUser }   from '@/lib/push';

interface DayRecord {
  calsEaten?: string | number;
  exercises?: string;
  budget?:    number | string;
}

type PushSubClient = {
  findMany: (args: {
    distinct:  string[];
    select:    Record<string, boolean>;
  }) => Promise<Array<{ userId: string }>>;
};

const ps = () => (prisma as unknown as { pushSubscription: PushSubClient }).pushSubscription;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function hasLoggedFood(day: DayRecord | undefined): boolean {
  if (!day) return false;
  const eaten = parseFloat(String(day.calsEaten ?? '0'));
  return eaten > 50;
}

function hasLoggedWorkout(day: DayRecord | undefined): boolean {
  if (!day?.exercises) return false;
  try {
    const entries = JSON.parse(day.exercises) as Array<{ k: string }>;
    return entries.some(e => e.k === 'lift' || e.k === 'run' || e.k === 'bike' || e.k === 'swim');
  } catch { return false; }
}

function buildMessage(
  loggedFood: boolean,
  loggedWorkout: boolean,
  streak: number,
): { title: string; body: string } | null {
  const streakNote = streak >= 3 ? ` Keep your ${streak}-day streak alive.` : '';

  if (!loggedFood && !loggedWorkout) {
    return {
      title: 'Log your day 📋',
      body:  `You haven't tracked food or a workout yet today.${streakNote}`,
    };
  }
  if (!loggedFood) {
    return {
      title: 'Track your meals 🍽️',
      body:  `Workout logged — just missing today's food.${streakNote}`,
    };
  }
  if (!loggedWorkout) {
    return {
      title: 'Hit the gym? 💪',
      body:  `Food's tracked — no workout logged yet today.`,
    };
  }
  return null; // all done, no nudge needed
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayUTC();

  // Get distinct user IDs that have at least one push subscription
  const subscribers = await ps().findMany({
    distinct: ['userId'],
    select:   { userId: true },
  });

  if (subscribers.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 0, date: today });
  }

  const userIds = subscribers.map(s => s.userId);

  // Fetch workout data for all subscribed users in one query
  const workoutRows = await prisma.workoutData.findMany({
    where:  { userId: { in: userIds } },
    select: { userId: true, localDB: true, settings: true },
  });

  const dataByUser = new Map(workoutRows.map(r => [r.userId, r]));

  let sent = 0, skipped = 0;

  for (const { userId } of subscribers) {
    const row      = dataByUser.get(userId);
    const localDB  = (row?.localDB  ?? {}) as Record<string, DayRecord>;
    const settings = (row?.settings ?? {}) as Record<string, unknown>;
    const today_record = localDB[today];

    const loggedFood    = hasLoggedFood(today_record);
    const loggedWorkout = hasLoggedWorkout(today_record);

    // Parse streak from synced settings
    const streak = (() => {
      try {
        const raw = settings['queLastStreak'];
        return typeof raw === 'number' ? raw : parseInt(String(raw ?? '0')) || 0;
      } catch { return 0; }
    })();

    const msg = buildMessage(loggedFood, loggedWorkout, streak);
    if (!msg) { skipped++; continue; }

    await sendPushToUser(userId, { ...msg, url: '/app' });
    sent++;
  }

  console.log(`[cron/daily-nudge] ${today} — sent:${sent} skipped:${skipped}`);
  return NextResponse.json({ ok: true, date: today, sent, skipped });
}
