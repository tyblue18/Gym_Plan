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
  liftPRs:  Record<string, number>;
  localDB:  Record<string, DayRecord>;
  settings: Record<string, unknown>;
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

/** Shared consecutive-day streak counter. */
function longestStreak(days: string[]): number {
  if (days.length === 0) return 0;
  let max = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round(
      (new Date(days[i] + 'T00:00:00Z').getTime() - new Date(days[i - 1] + 'T00:00:00Z').getTime()) / 86400000
    );
    if (gap === 1) { cur++; max = Math.max(max, cur); }
    else           { cur = 1; }
  }
  return max;
}

/** Returns the longest consecutive workout-logged streak in localDB. */
function maxWorkoutStreak(localDB: Record<string, DayRecord>): number {
  return longestStreak(
    Object.keys(localDB).filter(d => String(localDB[d].exercises ?? '').length > 2).sort()
  );
}

/** Returns the longest streak where BOTH a workout was logged AND the calorie goal was hit. */
function maxCombinedStreak(localDB: Record<string, DayRecord>): number {
  return longestStreak(
    Object.keys(localDB).filter(d => {
      const rec = localDB[d];
      return (
        String(rec.exercises ?? '').length > 2 &&
        hitGoal(rec.calsEaten as string | undefined, rec.budget)
      );
    }).sort()
  );
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

  // ── Running distances ─────────────────────────────────────────────────────────
  // Thresholds use the standard runner's round-number equivalents (mi):
  // 5K=3.1, 10K=6.2, 15K=9.3, half=13.1, marathon=26.2
  {
    slug: 'run_5k', label: 'First 5K', icon: '/Badges/First_5K_badge.png', category: 'cardio',
    check: ({ localDB }) => Object.values(localDB).some(d =>
      parseFloat(String(d.runDist ?? '0')) >= 3.1
    ),
  },
  {
    slug: 'run_10k', label: 'First 10K', icon: '/Badges/First_10K_badge.png', category: 'cardio',
    check: ({ localDB }) => Object.values(localDB).some(d =>
      parseFloat(String(d.runDist ?? '0')) >= 6.2
    ),
  },
  {
    slug: 'run_15k', label: 'First 15K', icon: '/Badges/First_15K_badge.png', category: 'cardio',
    check: ({ localDB }) => Object.values(localDB).some(d =>
      parseFloat(String(d.runDist ?? '0')) >= 9.3
    ),
  },
  {
    slug: 'run_half', label: 'First Half Marathon', icon: '/Badges/First_half_marathon_badge.png', category: 'cardio',
    check: ({ localDB }) => Object.values(localDB).some(d =>
      parseFloat(String(d.runDist ?? '0')) >= 13.1
    ),
  },
  {
    slug: 'run_marathon', label: 'First Marathon', icon: '/Badges/First_marathon_badge.png', category: 'cardio',
    check: ({ localDB }) => Object.values(localDB).some(d =>
      parseFloat(String(d.runDist ?? '0')) >= 26.2
    ),
  },
  {
    slug: 'run_50mi', label: '50 Miles Run', icon: '/Badges/Running_total_run_badge.png', category: 'cardio',
    check: ({ localDB }) =>
      Object.values(localDB).reduce((s, d) => s + (parseFloat(String(d.runDist ?? '0')) || 0), 0) >= 50,
  },
  {
    slug: 'run_50mi_single', label: '50 Mile Run', icon: '/Badges/Run_50miles.png', category: 'cardio',
    check: ({ localDB }) => Object.values(localDB).some(d =>
      parseFloat(String(d.runDist ?? '0')) >= 50
    ),
  },

  // ── First Meal (first time logging calories) ──────────────────────────────────
  {
    slug: 'first_meal', label: 'First Meal', icon: '/Badges/First_mean.png', category: 'nutrition',
    check: ({ localDB }) => Object.values(localDB).some(d =>
      (parseFloat(String(d.calsEaten ?? '0')) || 0) > 0
    ),
  },

  // ── Locked In (diet completion) ───────────────────────────────────────────────
  {
    slug: 'locked_in', label: 'Locked In', icon: '/Badges/Locked_in.png', category: 'nutrition',
    check: ({ localDB, settings }) => {
      const plan = settings['queAthletePlan'] as {
        startDate?: string; weeksTarget?: number; goalWeight?: number; type?: string;
      } | null | undefined;
      if (!plan?.startDate || !plan.goalWeight || !plan.weeksTarget) return false;
      const endMs     = new Date(plan.startDate + 'T00:00:00Z').getTime() + plan.weeksTarget * 7 * 86_400_000;
      const endStr    = new Date(endMs).toISOString().slice(0, 10);
      const todayStr  = new Date().toISOString().slice(0, 10);
      if (todayStr < endStr) return false;
      const windowStr = new Date(endMs - 14 * 86_400_000).toISOString().slice(0, 10);
      return Object.entries(localDB).some(([date, d]) => {
        if (date < windowStr) return false;
        const w = parseFloat(String(d.weight ?? '0')) || 0;
        return w > 0 && Math.abs(w - plan.goalWeight!) <= 5;
      });
    },
  },

  // ── Triathlete (bike + run + swim same day) ────────────────────────────────────
  {
    slug: 'triathlete', label: 'Triathlete', icon: '/Badges/Triathlete_badge.png', category: 'cardio',
    check: ({ localDB }) => Object.values(localDB).some(d =>
      (parseFloat(String(d.runDist  ?? '0')) > 0) &&
      (parseFloat(String(d.bikeDist ?? '0')) > 0) &&
      (parseFloat(String(d.swimTime ?? '0')) > 0)
    ),
  },

  // ── Swimming ──────────────────────────────────────────────────────────────────
  {
    slug: 'swim_first', label: 'First Swim', icon: '/Badges/First_swim_badge.png', category: 'cardio',
    check: ({ localDB }) => Object.values(localDB).some(d =>
      parseFloat(String(d.swimTime ?? '0')) > 0
    ),
  },
  {
    slug: 'swim_15mi', label: '15 Miles Swum', icon: '/Badges/Running_total_swim_badge.png', category: 'cardio',
    check: ({ localDB }) =>
      Object.values(localDB).reduce((s, d) => s + (parseFloat(String(d.swimDist ?? '0')) || 0), 0) >= 15,
  },

  // ── Million Pounds Lifted ─────────────────────────────────────────────────────
  {
    slug: 'million_lbs', label: 'Million Pounds Lifted', icon: '/Badges/Million_pounds_lifted.png', category: 'lift',
    check: ({ settings }) => {
      const groups = settings['queMillionGroups'] as string[] | undefined;
      return Array.isArray(groups) && groups.length > 0;
    },
  },

  // ── Double PR Day ─────────────────────────────────────────────────────────────
  {
    slug: 'pr_both', label: 'Double PR Day', icon: '/Badges/PR_both_lift_and_cardio.png', category: 'lift',
    check: ({ localDB }) => Object.values(localDB).some(d => !!(d as { prBothDay?: boolean }).prBothDay),
  },

  // ── 1,000 Calorie Burn ────────────────────────────────────────────────────────
  {
    slug: 'cal_1000', label: '1,000 Cal Burn', icon: '/Badges/1000_calorie_burned_badge.png', category: 'cardio',
    check: ({ localDB }) => Object.values(localDB).some(d => (parseFloat(String(d.burn ?? '0')) || 0) >= 1000),
  },

  // ── Cycling ───────────────────────────────────────────────────────────────────
  {
    slug: 'bike_first', label: 'First Bike Ride', icon: '/Badges/First_bike_badge.png', category: 'cardio',
    check: ({ localDB }) => Object.values(localDB).some(d =>
      parseFloat(String(d.bikeDist ?? '0')) >= 0.1
    ),
  },
  {
    slug: 'bike_50mi', label: '50 Miles Biked', icon: '/Badges/Running_total_bike_badge.png', category: 'cardio',
    check: ({ localDB }) =>
      Object.values(localDB).reduce((s, d) => s + (parseFloat(String(d.bikeDist ?? '0')) || 0), 0) >= 50,
  },
  {
    slug: 'bike_1000mi', label: '1,000 Miles Biked', icon: '/Badges/1000_miles_biked_badge.png', category: 'cardio',
    check: ({ localDB }) =>
      Object.values(localDB).reduce((s, d) => s + (parseFloat(String(d.bikeDist ?? '0')) || 0), 0) >= 1000,
  },

  // ── Workout streak ────────────────────────────────────────────────────────────
  {
    slug: 'scholar', label: 'Scholar', icon: '/Badges/scholar_badge.png', category: 'nutrition',
    check: ({ localDB }) => maxWorkoutStreak(localDB) >= 14,
  },
  {
    slug: 'master', label: 'Master', icon: '/Badges/master_badge.png', category: 'nutrition',
    check: ({ localDB }) => maxWorkoutStreak(localDB) >= 30,
  },
  {
    slug: 'seer', label: 'Seer', icon: '/Badges/seer_badge.png', category: 'nutrition',
    check: ({ localDB }) => maxWorkoutStreak(localDB) >= 50,
  },
  {
    slug: 'stoic', label: 'Stoic', icon: '/Badges/stoic_badge.png', category: 'nutrition',
    check: ({ localDB }) => maxCombinedStreak(localDB) >= 50,
  },

  // ── Big eating days ───────────────────────────────────────────────────────────
  {
    slug: 'eat_5000', label: '5,000 Calories Eaten', icon: '/Badges/5000_calories_eaten.png', category: 'nutrition',
    check: ({ localDB }) => Object.values(localDB).some(d =>
      (parseFloat(String(d.calsEaten ?? '0')) || 0) >= 5000
    ),
  },
  {
    slug: 'eat_10000', label: '10,000 Calories Eaten', icon: '/Badges/10000_calories_eaten_badge.jpg', category: 'nutrition',
    check: ({ localDB }) => Object.values(localDB).some(d =>
      (parseFloat(String(d.calsEaten ?? '0')) || 0) >= 10000
    ),
  },

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

// DayRecord table cast — model was added after initial Prisma client generation
type DayRecordRow = { date: string; data: unknown };
const dayRecordTable = (prisma as unknown as {
  dayRecord: { findMany: (args: unknown) => Promise<DayRecordRow[]> };
}).dayRecord;

/**
 * Checks all badge thresholds for a user, awards newly earned badges, and
 * revokes badges the user no longer qualifies for (e.g. after a corrected entry).
 *
 * Fetches the user's full workout history directly from the DB so checks are
 * always accurate regardless of what the sync push contained. Run this AFTER
 * DayRecord upserts so the latest data is visible.
 *
 * Safe to call on every sync. Throws only if Prisma is unavailable; callers should catch.
 */
export async function checkAndAwardBadges(
  userId:   string,
  settings: Record<string, unknown>,
): Promise<{ awarded: AwardedBadge[]; revoked: AwardedBadge[] }> {
  let liftPRs: Record<string, number> = {};
  try { liftPRs = (settings['queLiftPRs'] ?? {}) as Record<string, number>; }
  catch { /* malformed — treat as empty */ }

  // Fetch full history and existing badges in parallel.
  const [existing, dayRows] = await Promise.all([
    prisma.badge.findMany({
      where:  { userId },
      select: { slug: true, label: true, icon: true, category: true },
    }),
    dayRecordTable.findMany({ where: { userId }, select: { date: true, data: true } }),
  ]);

  const localDB: Record<string, DayRecord> = Object.fromEntries(
    dayRows.map(r => [r.date, r.data as DayRecord])
  );

  const data: BadgeCheckData = { liftPRs, localDB, settings };
  const earnedMap = new Map(existing.map(b => [b.slug, b]));

  const toAward  = BADGE_DEFS.filter(def => !earnedMap.has(def.slug) && def.check(data));
  // Revoke lift and cardio badges when thresholds are no longer met (corrected entry).
  // Nutrition streak badges are never revoked — past streaks are permanent achievements.
  const toRevoke = BADGE_DEFS.filter(def =>
    earnedMap.has(def.slug) && def.category !== 'nutrition' && !def.check(data)
  );

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
