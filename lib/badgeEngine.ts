/**
 * lib/badgeEngine.ts
 *
 * Server-side badge evaluation. Called as a side-effect of every POST /api/sync.
 * Reads synced workout data, computes which badge thresholds are met, and
 * writes newly earned badges to the Badge table. Each badge is awarded at most
 * once (@@unique [userId, slug]).
 *
 * Adding a new badge: add one entry to BADGE_DEFS — no schema changes needed.
 */

import { prisma } from '@/lib/prisma';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DayRecord {
  calsEaten?: string;
  budget?:    number | string;
  [key: string]:  unknown;
}

interface BadgeCheckData {
  // queLiftPRs: exercise name → all-time max weight (lbs)
  liftPRs: Record<string, number>;
  localDB: Record<string, DayRecord>;
}

interface BadgeDef {
  slug:     string;
  label:    string;
  icon:     string;
  category: 'lift' | 'cardio' | 'nutrition';
  check:    (data: BadgeCheckData) => boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** True when a day's intake is within ±100 kcal of budget. */
function hitGoal(calsEaten: string | undefined, budget: unknown): boolean {
  const eaten = parseFloat(String(calsEaten ?? '0'));
  const bud   = parseFloat(String(budget   ?? '0'));
  return eaten > 0 && bud > 0 && Math.abs(eaten - bud) <= 100;
}

/** Returns the longest consecutive calorie-goal streak in localDB. */
function maxStreak(localDB: Record<string, DayRecord>): number {
  const goalDays = Object.keys(localDB)
    .filter(d => hitGoal(localDB[d].calsEaten, localDB[d].budget))
    .sort();

  if (goalDays.length === 0) return 0;

  let max = 1, cur = 1;
  for (let i = 1; i < goalDays.length; i++) {
    const prev = new Date(goalDays[i - 1] + 'T00:00:00Z');
    const curr = new Date(goalDays[i]     + 'T00:00:00Z');
    const gap  = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (gap === 1) { cur++; max = Math.max(max, cur); }
    else           { cur = 1; }
  }
  return max;
}

/** True if any of the given exercise name variants has a PR ≥ weight. */
function liftHit(liftPRs: Record<string, number>, exercises: string[], weight: number): boolean {
  return exercises.some(ex => (liftPRs[ex] ?? 0) >= weight);
}

/** Shorthand for creating a lift badge definition. */
function lb(slug: string, label: string, icon: string, exercises: string[], weight: number): BadgeDef {
  return {
    slug, label, icon, category: 'lift',
    check: ({ liftPRs }) => liftHit(liftPRs, exercises, weight),
  };
}

// ── Badge definitions ──────────────────────────────────────────────────────────
//
// Exercise name arrays cover common variations users might type.
// Weight thresholds are in pounds (matching queLiftPRs).
//
const BENCH = ['Bench Press', 'Barbell Bench Press', 'Flat Bench Press', 'Flat Barbell Bench'];
const SQUAT = ['Squat', 'Back Squat', 'Barbell Squat', 'Low Bar Squat', 'High Bar Squat'];
const DEAD  = ['Deadlift', 'Barbell Deadlift', 'Conventional Deadlift', 'Romanian Deadlift'];
const OHP   = ['Overhead Press', 'OHP', 'Military Press', 'Barbell OHP', 'Standing OHP', 'Barbell Overhead Press'];

const BADGE_DEFS: BadgeDef[] = [
  // ── Bench Press ──────────────────────────────────────────────────────────────
  lb('bench_135', 'One Plate Bench',   '🏋️', BENCH, 135),
  lb('bench_185', '185 Bench Club',    '🏋️', BENCH, 185),
  lb('bench_225', 'Two Plate Bench',   '🥈', BENCH, 225),
  lb('bench_275', '275 Bench Club',    '🏋️', BENCH, 275),
  lb('bench_315', 'Three Plate Bench', '🥇', BENCH, 315),
  lb('bench_365', '365 Bench Club',    '💪', BENCH, 365),
  lb('bench_405', 'Four Plate Bench',  '👑', BENCH, 405),

  // ── Squat ─────────────────────────────────────────────────────────────────────
  lb('squat_135', 'One Plate Squat',   '🏋️', SQUAT, 135),
  lb('squat_225', 'Two Plate Squat',   '🥈', SQUAT, 225),
  lb('squat_315', 'Three Plate Squat', '🥇', SQUAT, 315),
  lb('squat_405', 'Four Plate Squat',  '💪', SQUAT, 405),
  lb('squat_495', 'Five Plate Squat',  '🔥', SQUAT, 495),
  lb('squat_585', 'Six Plate Squat',   '👑', SQUAT, 585),

  // ── Deadlift ──────────────────────────────────────────────────────────────────
  lb('dead_135', 'One Plate Deadlift',  '🏋️', DEAD, 135),
  lb('dead_225', 'Two Plate Deadlift',  '🥈', DEAD, 225),
  lb('dead_315', 'Three Plate Deadlift','🥇', DEAD, 315),
  lb('dead_405', 'Four Plate Deadlift', '💪', DEAD, 405),
  lb('dead_495', 'Five Plate Deadlift', '🔥', DEAD, 495),
  lb('dead_585', 'Six Plate Deadlift',  '🔥', DEAD, 585),
  lb('dead_675', 'Seven Plate Deadlift','👑', DEAD, 675),

  // ── Overhead Press ────────────────────────────────────────────────────────────
  lb('ohp_95',  '95 OHP Club',        '🏋️', OHP, 95),
  lb('ohp_115', '115 OHP Club',       '🏋️', OHP, 115),
  lb('ohp_135', 'One Plate OHP',      '🥇', OHP, 135),
  lb('ohp_185', '185 OHP Club',       '💪', OHP, 185),
  lb('ohp_225', 'Two Plate OHP',      '👑', OHP, 225),

  // ── Nutrition streaks ─────────────────────────────────────────────────────────
  {
    slug: 'streak_3',   label: '3-Day Streak',       icon: '🔥', category: 'nutrition',
    check: ({ localDB }) => maxStreak(localDB) >= 3,
  },
  {
    slug: 'streak_7',   label: 'Week Warrior',        icon: '🔥', category: 'nutrition',
    check: ({ localDB }) => maxStreak(localDB) >= 7,
  },
  {
    slug: 'streak_14',  label: 'Two-Week Run',        icon: '⚡', category: 'nutrition',
    check: ({ localDB }) => maxStreak(localDB) >= 14,
  },
  {
    slug: 'streak_30',  label: 'Monthly Master',      icon: '🌟', category: 'nutrition',
    check: ({ localDB }) => maxStreak(localDB) >= 30,
  },
  {
    slug: 'streak_60',  label: '60-Day Domination',   icon: '💎', category: 'nutrition',
    check: ({ localDB }) => maxStreak(localDB) >= 60,
  },
  {
    slug: 'streak_100', label: 'Century Club',         icon: '👑', category: 'nutrition',
    check: ({ localDB }) => maxStreak(localDB) >= 100,
  },
];

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Checks all badge thresholds for a user and awards any newly earned badges.
 * Safe to call on every sync — skips badges the user already holds.
 * Throws only if Prisma is unavailable; callers should catch.
 */
export async function checkAndAwardBadges(
  userId:      string,
  workoutData: { localDB?: unknown; settings?: unknown },
): Promise<void> {
  const localDB  = (workoutData.localDB  ?? {}) as Record<string, DayRecord>;
  const settings = (workoutData.settings ?? {}) as Record<string, unknown>;

  let liftPRs: Record<string, number> = {};
  try { liftPRs = (settings['queLiftPRs'] ?? {}) as Record<string, number>; }
  catch { /* malformed — treat as empty */ }

  const data: BadgeCheckData = { liftPRs, localDB };

  // Load slugs the user already has so we don't re-award
  const existing = await prisma.badge.findMany({
    where:  { userId },
    select: { slug: true },
  });
  const earned = new Set(existing.map(b => b.slug));

  const toAward = BADGE_DEFS.filter(def => !earned.has(def.slug) && def.check(data));
  if (toAward.length === 0) return;

  await prisma.badge.createMany({
    data: toAward.map(def => ({
      userId,
      category: def.category,
      slug:     def.slug,
      label:    def.label,
      icon:     def.icon,
    })),
    skipDuplicates: true, // race-condition safety
  });
}

/** Returns all badges for a user, newest first. */
export async function getUserBadges(userId: string) {
  return prisma.badge.findMany({
    where:   { userId },
    orderBy: { earnedAt: 'desc' },
  });
}
