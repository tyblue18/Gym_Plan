/**
 * GET /api/cron/weekly-recap
 *
 * Scheduled at 14:00 UTC every Sunday (9 am ET / 6 am PT).
 * Sends a personalized weekly summary push to every subscribed user:
 * workouts logged, calorie goal hit rate, and streak.
 * Protected by CRON_SECRET.
 */

import { NextResponse }   from 'next/server';
import { prisma }         from '@/lib/prisma';
import { sendPushToUser } from '@/lib/push';
import { GOAL_TOLERANCE, LAST_STREAK_KEY } from '@/lib/constants';

interface DayRecord {
  calsEaten?: string | number;
  exercises?: string;
  budget?:    number | string;
}

type PushSubClient = {
  findMany: (args: {
    distinct: string[];
    select:   Record<string, boolean>;
  }) => Promise<Array<{ userId: string }>>;
};

const ps = () => (prisma as unknown as { pushSubscription: PushSubClient }).pushSubscription;

// ── Date helpers ──────────────────────────────────────────────────────────────

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns the 7 date strings Mon–Sun ending yesterday (the completed week). */
function weekDates(): string[] {
  const dates: string[] = [];
  const d = new Date();
  for (let i = 7; i >= 1; i--) {
    const day = new Date(d);
    day.setUTCDate(d.getUTCDate() - i);
    dates.push(dateStr(day));
  }
  return dates;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function hasWorkout(day: DayRecord | undefined): boolean {
  if (!day?.exercises) return false;
  try {
    const entries = JSON.parse(day.exercises) as Array<{ k: string }>;
    return entries.some(e => e.k === 'lift' || e.k === 'run' || e.k === 'bike' || e.k === 'swim');
  } catch { return false; }
}

function hitGoal(day: DayRecord | undefined): boolean {
  if (!day) return false;
  const eaten  = parseFloat(String(day.calsEaten ?? '0'));
  const budget = parseFloat(String(day.budget    ?? '0'));
  return eaten > 50 && budget > 0 && Math.abs(eaten - budget) <= GOAL_TOLERANCE;
}

interface WeekStats {
  workoutDays: number;
  goalDays:    number;
  loggedDays:  number;
}

function computeStats(localDB: Record<string, DayRecord>, dates: string[]): WeekStats {
  let workoutDays = 0, goalDays = 0, loggedDays = 0;
  for (const d of dates) {
    const day = localDB[d];
    if (!day) continue;
    if (hasWorkout(day))  workoutDays++;
    if (hitGoal(day))     goalDays++;
    if (parseFloat(String(day.calsEaten ?? '0')) > 50) loggedDays++;
  }
  return { workoutDays, goalDays, loggedDays };
}

// ── Message builder ───────────────────────────────────────────────────────────

function buildRecap(
  stats: WeekStats,
  streak: number,
): { title: string; body: string } {
  const { workoutDays, goalDays, loggedDays } = stats;
  const hasAnyData = workoutDays > 0 || loggedDays > 0;

  if (!hasAnyData) {
    return {
      title: 'New week, fresh start 🎯',
      body:  'Nothing logged last week. Jump in today and start your streak.',
    };
  }

  // Title based on overall performance
  let title: string;
  if (workoutDays >= 4 || goalDays >= 5) {
    title = 'Solid week 🔥';
  } else if (workoutDays >= 2 || goalDays >= 3) {
    title = 'Keep it going 💪';
  } else {
    title = 'Weekly recap 📊';
  }

  // Body — build stat fragments
  const parts: string[] = [];

  if (workoutDays > 0) {
    parts.push(`${workoutDays} workout${workoutDays !== 1 ? 's' : ''}`);
  }

  if (loggedDays > 0) {
    parts.push(`calorie goal ${goalDays}/${loggedDays} days`);
  }

  if (streak >= 3) {
    parts.push(`🔥 ${streak}-day streak`);
  }

  const body = parts.length > 0
    ? parts.join(' · ')
    : 'Check your metrics to see how you did.';

  return { title, body };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dates = weekDates();

  const subscribers = await ps().findMany({
    distinct: ['userId'],
    select:   { userId: true },
  });

  if (subscribers.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, week: dates[0] });
  }

  const userIds = subscribers.map(s => s.userId);

  const workoutRows = await prisma.workoutData.findMany({
    where:  { userId: { in: userIds } },
    select: { userId: true, localDB: true, settings: true },
  });

  const dataByUser = new Map(workoutRows.map(r => [r.userId, r]));

  let sent = 0;

  for (const { userId } of subscribers) {
    const row      = dataByUser.get(userId);
    const localDB  = (row?.localDB  ?? {}) as Record<string, DayRecord>;
    const settings = (row?.settings ?? {}) as Record<string, unknown>;

    const streak = (() => {
      try {
        const raw = settings[LAST_STREAK_KEY];
        return typeof raw === 'number' ? raw : parseInt(String(raw ?? '0')) || 0;
      } catch { return 0; }
    })();

    const stats = computeStats(localDB, dates);
    const msg   = buildRecap(stats, streak);

    await sendPushToUser(userId, { ...msg, url: '/app' });
    sent++;
  }

  console.log(`[cron/weekly-recap] week of ${dates[0]} — sent:${sent}`);
  return NextResponse.json({ ok: true, week: dates[0], sent });
}
