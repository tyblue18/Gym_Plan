/**
 * lib/badgeCatalog.ts
 *
 * Client-accessible catalog of every badge in the app.
 * Used by the showcase editor "All Badges" view.
 * Keep in sync with BADGE_DEFS in lib/badgeEngine.ts.
 */

export interface CatalogEntry {
  slug:     string;
  label:    string;
  icon:     string;        // file path starting with '/' or emoji
  category: 'lift' | 'cardio' | 'nutrition';
  howToGet: string;        // shown when badge is not yet earned
}

export const BADGE_CATALOG: CatalogEntry[] = [
  // ── Bench Press ──────────────────────────────────────────────────────────────
  { slug: 'bench_135', label: '135 Bench',      icon: '/Badges/135_bench_badge.png',    category: 'lift',      howToGet: 'Bench press 135 lbs' },
  { slug: 'bench_225', label: '225 Bench',      icon: '/Badges/225_bench_badge.png',    category: 'lift',      howToGet: 'Bench press 225 lbs' },
  { slug: 'bench_315', label: '315 Bench',      icon: '/Badges/315_bench_badge.png',    category: 'lift',      howToGet: 'Bench press 315 lbs' },
  { slug: 'bench_405', label: '405 Bench',      icon: '/Badges/405_bench_badge.png',    category: 'lift',      howToGet: 'Bench press 405 lbs' },
  { slug: 'bench_495', label: '495 Bench',      icon: '/Badges/495_bench_badge.png',    category: 'lift',      howToGet: 'Bench press 495 lbs' },
  { slug: 'bench_540', label: '540 Bench',      icon: '/Badges/540_bench_badge.png',    category: 'lift',      howToGet: 'Bench press 540 lbs' },
  { slug: 'bench_630', label: '630 Bench',      icon: '/Badges/630_bench_badge.png',    category: 'lift',      howToGet: 'Bench press 630 lbs' },

  // ── Squat ─────────────────────────────────────────────────────────────────────
  { slug: 'squat_135', label: '135 Squat',      icon: '/Badges/135_squat_badge.png',    category: 'lift',      howToGet: 'Squat 135 lbs' },
  { slug: 'squat_225', label: '225 Squat',      icon: '/Badges/225_squat_badge.png',    category: 'lift',      howToGet: 'Squat 225 lbs' },
  { slug: 'squat_315', label: '315 Squat',      icon: '/Badges/315_squad_badge.png',    category: 'lift',      howToGet: 'Squat 315 lbs' },
  { slug: 'squat_405', label: '405 Squat',      icon: '/Badges/405_squat_badge.png',    category: 'lift',      howToGet: 'Squat 405 lbs' },
  { slug: 'squat_495', label: '495 Squat',      icon: '/Badges/495_squat_badge.png',    category: 'lift',      howToGet: 'Squat 495 lbs' },
  { slug: 'squat_540', label: '540 Squat',      icon: '/Badges/540_squat_badge.png',    category: 'lift',      howToGet: 'Squat 540 lbs' },
  { slug: 'squat_630', label: '630 Squat',      icon: '/Badges/630_squat_badge.png',    category: 'lift',      howToGet: 'Squat 630 lbs' },

  // ── Deadlift ──────────────────────────────────────────────────────────────────
  { slug: 'dead_135',  label: '135 Deadlift',   icon: '/Badges/135_deadlift_badge.png', category: 'lift',      howToGet: 'Deadlift 135 lbs' },
  { slug: 'dead_225',  label: '225 Deadlift',   icon: '/Badges/225_deadlift_badge.png', category: 'lift',      howToGet: 'Deadlift 225 lbs' },
  { slug: 'dead_315',  label: '315 Deadlift',   icon: '/Badges/315_deadlift_badge.png', category: 'lift',      howToGet: 'Deadlift 315 lbs' },
  { slug: 'dead_405',  label: '405 Deadlift',   icon: '/Badges/405_deadlift_badge.png', category: 'lift',      howToGet: 'Deadlift 405 lbs' },
  { slug: 'dead_495',  label: '495 Deadlift',   icon: '/Badges/495_deadlift_badge.png', category: 'lift',      howToGet: 'Deadlift 495 lbs' },
  { slug: 'dead_540',  label: '540 Deadlift',   icon: '/Badges/540_deadlift_badge.png', category: 'lift',      howToGet: 'Deadlift 540 lbs' },
  { slug: 'dead_630',  label: '630 Deadlift',   icon: '/Badges/630_deadlift_badge.png', category: 'lift',      howToGet: 'Deadlift 630 lbs' },

  // ── 1000 lb Club ─────────────────────────────────────────────────────────────
  { slug: 'pound_club_1000', label: '1000 lb Club', icon: '/Badges/1000_pound_club_badge.png', category: 'lift', howToGet: 'Bench + Squat + Deadlift PRs combined ≥ 1,000 lbs' },

  // ── Overhead Press ────────────────────────────────────────────────────────────
  { slug: 'ohp_95',    label: '95 OHP',          icon: '🏋️', category: 'lift', howToGet: 'Overhead press 95 lbs'  },
  { slug: 'ohp_115',   label: '115 OHP',         icon: '🏋️', category: 'lift', howToGet: 'Overhead press 115 lbs' },
  { slug: 'ohp_135',   label: 'One Plate OHP',   icon: '🥇', category: 'lift', howToGet: 'Overhead press 135 lbs' },
  { slug: 'ohp_185',   label: '185 OHP',         icon: '💪', category: 'lift', howToGet: 'Overhead press 185 lbs' },
  { slug: 'ohp_225',   label: 'Two Plate OHP',   icon: '👑', category: 'lift', howToGet: 'Overhead press 225 lbs' },

  // ── Running ───────────────────────────────────────────────────────────────────
  { slug: 'run_5k',          label: 'First 5K',           icon: '/Badges/First_5K_badge.png',            category: 'cardio', howToGet: 'Log a run of 3.1+ miles in one session' },
  { slug: 'run_10k',         label: 'First 10K',          icon: '/Badges/First_10K_badge.png',           category: 'cardio', howToGet: 'Log a run of 6.2+ miles in one session' },
  { slug: 'run_15k',         label: 'First 15K',          icon: '/Badges/First_15K_badge.png',           category: 'cardio', howToGet: 'Log a run of 9.3+ miles in one session' },
  { slug: 'run_half',        label: 'Half Marathon',       icon: '/Badges/First_half_marathon_badge.png', category: 'cardio', howToGet: 'Log a run of 13.1+ miles in one session' },
  { slug: 'run_marathon',    label: 'Marathon',            icon: '/Badges/First_marathon_badge.png',      category: 'cardio', howToGet: 'Log a run of 26.2+ miles in one session' },
  { slug: 'run_50mi',        label: '50 Miles Run',        icon: '/Badges/Running_total_run_badge.png',   category: 'cardio', howToGet: 'Run 50 miles total across all sessions' },
  { slug: 'run_50mi_single', label: '50-Mile Single Run',  icon: '/Badges/Run_50miles.png',               category: 'cardio', howToGet: 'Run 50 miles in a single session' },

  // ── Cycling ───────────────────────────────────────────────────────────────────
  { slug: 'bike_first',  label: 'First Bike Ride',   icon: '/Badges/First_bike_badge.png',          category: 'cardio', howToGet: 'Log your first bike ride' },
  { slug: 'bike_50mi',   label: '50 Miles Biked',    icon: '/Badges/Running_total_bike_badge.png',  category: 'cardio', howToGet: 'Bike 50 miles total across all sessions' },
  { slug: 'bike_1000mi', label: '1,000 Miles Biked', icon: '/Badges/1000_miles_biked_badge.png',   category: 'cardio', howToGet: 'Bike 1,000 miles total across all sessions' },

  // ── Swimming ──────────────────────────────────────────────────────────────────
  { slug: 'swim_first', label: 'First Swim',     icon: '/Badges/First_swim_badge.png',         category: 'cardio', howToGet: 'Log your first swim session' },
  { slug: 'swim_15mi',  label: '15 Miles Swum',  icon: '/Badges/Running_total_swim_badge.png', category: 'cardio', howToGet: 'Swim 15 miles total across all sessions' },

  // ── Triathlete ────────────────────────────────────────────────────────────────
  { slug: 'triathlete', label: 'Triathlete', icon: '/Badges/Triathlete_badge.png', category: 'cardio', howToGet: 'Log a run, bike, and swim on the same day' },

  // ── Calorie burn ──────────────────────────────────────────────────────────────
  { slug: 'cal_1000', label: '1,000 Cal Burn', icon: '/Badges/1000_calorie_burned_badge.png', category: 'cardio', howToGet: 'Burn 1,000+ calories in a single session' },

  // ── Lift volume ───────────────────────────────────────────────────────────────
  { slug: 'million_lbs', label: 'Million Pounds',  icon: '/Badges/Million_pounds_lifted.png',      category: 'lift', howToGet: 'Lift 1,000,000 lbs in any muscle group (lifetime total)' },
  { slug: 'pr_both',     label: 'Double PR Day',   icon: '/Badges/PR_both_lift_and_cardio.png',    category: 'lift', howToGet: 'Set a new lift PR and a new run PR on the same day' },

  // ── Workout streaks ───────────────────────────────────────────────────────────
  { slug: 'scholar', label: 'Scholar', icon: '/Badges/scholar_badge.png', category: 'nutrition', howToGet: 'Log workouts 14 days in a row' },
  { slug: 'master',  label: 'Master',  icon: '/Badges/master_badge.png',  category: 'nutrition', howToGet: 'Log workouts 30 days in a row' },
  { slug: 'seer',    label: 'Seer',    icon: '/Badges/seer_badge.png',    category: 'nutrition', howToGet: 'Log workouts 50 days in a row' },
  { slug: 'stoic',   label: 'Stoic',   icon: '/Badges/stoic_badge.png',   category: 'nutrition', howToGet: 'Log workouts AND hit calorie goals every day for 50 days' },

  // ── First Meal ────────────────────────────────────────────────────────────────
  { slug: 'first_meal', label: 'First Meal', icon: '/Badges/First_meal.png', category: 'nutrition', howToGet: 'Log calories for the first time' },

  // ── Diet completion ───────────────────────────────────────────────────────────
  { slug: 'locked_in', label: 'Locked In', icon: '/Badges/Locked_in.png', category: 'nutrition', howToGet: 'Complete a diet plan and reach your goal weight (±5 lbs) in the final 2 weeks' },

  // ── Big eating days ───────────────────────────────────────────────────────────
  { slug: 'eat_5000',  label: '5,000 Cal Day',  icon: '/Badges/5000_calories_eaten.png',       category: 'nutrition', howToGet: 'Log 5,000+ calories eaten in a single day' },
  { slug: 'eat_10000', label: '10,000 Cal Day', icon: '/Badges/10000_calories_eaten_badge.jpg', category: 'nutrition', howToGet: 'Log 10,000+ calories eaten in a single day' },

  // ── Calorie goal streaks ──────────────────────────────────────────────────────
  { slug: 'streak_3',   label: '3-Day Streak',      icon: '🔥', category: 'nutrition', howToGet: 'Hit your calorie goal 3 days in a row (±100 kcal)' },
  { slug: 'streak_7',   label: 'Week Warrior',       icon: '🔥', category: 'nutrition', howToGet: 'Hit your calorie goal 7 days in a row (±100 kcal)' },
  { slug: 'streak_14',  label: 'Two-Week Run',       icon: '⚡', category: 'nutrition', howToGet: 'Hit your calorie goal 14 days in a row (±100 kcal)' },
  { slug: 'streak_30',  label: 'Monthly Master',     icon: '🌟', category: 'nutrition', howToGet: 'Hit your calorie goal 30 days in a row (±100 kcal)' },
  { slug: 'streak_60',  label: '60-Day Domination',  icon: '💎', category: 'nutrition', howToGet: 'Hit your calorie goal 60 days in a row (±100 kcal)' },
  { slug: 'streak_100', label: 'Century Club',       icon: '👑', category: 'nutrition', howToGet: 'Hit your calorie goal 100 days in a row (±100 kcal)' },
];
