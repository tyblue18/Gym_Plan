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

/** Best PR across a set of exercise name variants. */
function bestPR(liftPRs: Record<string, number>, exercises: string[]): number {
  return exercises.reduce((max, ex) => Math.max(max, liftPRs[ex] ?? 0), 0);
}

const BADGE_DEFS: BadgeDef[] = [
  // ── Bench Press ──────────────────────────────────────────────────────────────
  lb('bench_135', '135 Bench',         '/Badges/135_bench_badge.png',  BENCH, 135),
  lb('bench_225', '225 Bench',         '/Badges/225_bench_badge.png',  BENCH, 225),
  lb('bench_315', '315 Bench',         '/Badges/315_bench_badge.png',  BENCH, 315),
  lb('bench_405', '405 Bench',         '/Badges/405_bench_badge.png',  BENCH, 405),
  lb('bench_495', '495 Bench',         '/Badges/495_bench_badge.png',  BENCH, 495),
  lb('bench_540', '540 Bench',         '/Badges/540_bench_badge.png',  BENCH, 540),
  lb('bench_630', '630 Bench',         '/Badges/630_bench_badge.png',  BENCH, 630),

  // ── Squat ─────────────────────────────────────────────────────────────────────
  lb('squat_135', '135 Squat',         '/Badges/135_squat_badge.png',  SQUAT, 135),
  lb('squat_225', '225 Squat',         '/Badges/225_squat_badge.png',  SQUAT, 225),
  lb('squat_315', '315 Squat',         '/Badges/315_squad_badge.png',  SQUAT, 315),
  lb('squat_405', '405 Squat',         '/Badges/405_squat_badge.png',  SQUAT, 405),
  lb('squat_495', '495 Squat',         '/Badges/495_squat_badge.png',  SQUAT, 495),
  lb('squat_540', '540 Squat',         '/Badges/540_squat_badge.png',  SQUAT, 540),
  lb('squat_630', '630 Squat',         '/Badges/630_squat_badge.png',  SQUAT, 630),

  // ── Deadlift ──────────────────────────────────────────────────────────────────
  lb('dead_135', '135 Deadlift',       '/Badges/135_deadlift_badge.png', DEAD, 135),
  lb('dead_225', '225 Deadlift',       '/Badges/225_deadlift_badge.png', DEAD, 225),
  lb('dead_315', '315 Deadlift',       '/Badges/315_deadlift_badge.png', DEAD, 315),
  lb('dead_405', '405 Deadlift',       '/Badges/405_deadlift_badge.png', DEAD, 405),
  lb('dead_495', '495 Deadlift',       '/Badges/495_deadlift_badge.png', DEAD, 495),
  lb('dead_540', '540 Deadlift',       '/Badges/540_deadlift_badge.png', DEAD, 540),
  lb('dead_630', '630 Deadlift',       '/Badges/630_deadlift_badge.png', DEAD, 630),

  // ── 1000 lb Club ─────────────────────────────────────────────────────────────
  {
    slug: 'pound_club_1000', label: '1000 lb Club', icon: '/Badges/1000_pound_club_badge.png',
    category: 'lift',
    check: ({ liftPRs }) =>
      bestPR(liftPRs, BENCH) + bestPR(liftPRs, SQUAT) + bestPR(liftPRs, DEAD) >= 1000,
  },

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

export interface AwardedBadge {
  slug:     string;
  label:    string;
  icon:     string;
  category: string;
}

/**
 * Checks all badge thresholds for a user, awards newly earned badges, and
 * revokes badges the user no longer qualifies for (e.g. after a corrected entry).
 * Safe to call on every sync. Throws only if Prisma is unavailable; callers should catch.
 */
export async function checkAndAwardBadges(
  userId:      string,
  workoutData: { localDB?: unknown; settings?: unknown },
): Promise<{ awarded: AwardedBadge[]; revoked: AwardedBadge[] }> {
  const localDB  = (workoutData.localDB  ?? {}) as Record<string, DayRecord>;
  const settings = (workoutData.settings ?? {}) as Record<string, unknown>;

  let liftPRs: Record<string, number> = {};
  try { liftPRs = (settings['queLiftPRs'] ?? {}) as Record<string, number>; }
  catch { /* malformed — treat as empty */ }

  const data: BadgeCheckData = { liftPRs, localDB };

  const existing = await prisma.badge.findMany({
    where:  { userId },
    select: { slug: true, label: true, icon: true, category: true },
  });
  const earnedMap = new Map(existing.map(b => [b.slug, b]));

  const toAward  = BADGE_DEFS.filter(def => !earnedMap.has(def.slug) && def.check(data));
  const toRevoke = BADGE_DEFS.filter(def => earnedMap.has(def.slug)  && !def.check(data));

  if (toAward.length > 0) {
    await prisma.badge.createMany({
      data: toAward.map(def => ({
        userId,
        category: def.category,
        slug:     def.slug,
        label:    def.label,
        icon:     def.icon,
      })),
      skipDuplicates: true,
    });
  }

  if (toRevoke.length > 0) {
    await prisma.badge.deleteMany({
      where: { userId, slug: { in: toRevoke.map(d => d.slug) } },
    });
  }

  return {
    awarded: toAward.map(def => ({ slug: def.slug, label: def.label, icon: def.icon, category: def.category })),
    revoked: toRevoke.map(def => ({ slug: def.slug, label: def.label, icon: def.icon, category: def.category })),
  };
}

/** Returns all badges for a user, newest first. */
export async function getUserBadges(userId: string) {
  return prisma.badge.findMany({
    where:   { userId },
    orderBy: { earnedAt: 'desc' },
  });
}
