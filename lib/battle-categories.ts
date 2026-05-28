/**
 * lib/battle-categories.ts
 *
 * Registry of every typed-battle category. Each entry knows:
 *   - how to display itself (label, unit, group)
 *   - which direction wins (higher / lower)
 *   - how to compute a user's score from their DayRecord rows over a window
 *
 * Adding a new category is a one-entry change here + a UI-list update.
 */

export type CategoryGroup     = 'cardio' | 'lift' | 'diet';
export type CategoryDirection = 'higher' | 'lower';

export interface DayRow {
  date: string;                       // YYYY-MM-DD
  data: Record<string, unknown>;      // DayRecord.data
}

export interface BattleCategory {
  slug:        string;
  label:       string;
  group:       CategoryGroup;
  direction:   CategoryDirection;
  unit:        string;                // 'mi' | 'lb' | 'kcal' | 'g' | 'steps' | 'reps'
  /** One-line explanation of how the score is computed — shown under the
   *  selected chip in the ChallengeModal so users know what they're agreeing
   *  to. Should mention that the value accumulates over the window when
   *  relevant. */
  description: string;
  /** Short text shown when a user has 0/no data for this category. */
  noDataLabel: string;
  /** Optional safety warning shown in the ChallengeModal when this is picked. */
  safetyNote?: string;
  /**
   * Compute the user's score for this category over the window. Returns
   * either a finite number or `null` if the user has no data at all
   * (different from a zero score — used by the UI to show the "no data"
   * message rather than displaying "0 lb").
   */
  score: (rows: DayRow[]) => number | null;
  /**
   * True if a category requires logged exercise (lift/cardio).
   * Diet-only battles skip the exercise prereq for past windows.
   */
  requiresExercise?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function num(v: unknown): number {
  const n = parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Sum `field` across every food entry in the window.
 *
 * Each entry's stored protein/carbs/fat is ALREADY the total for its serving
 * count (CalorieTracker stores `perServing × servings`, and its own macro
 * totals sum the entries directly). So we must NOT multiply by `servings`
 * again here — doing so double-counts it.
 */
function sumFromFoods(rows: DayRow[], field: 'protein' | 'carbs' | 'fat'): number {
  let total = 0;
  for (const r of rows) {
    try {
      const foods = JSON.parse(String(r.data.foods ?? '[]'));
      if (!Array.isArray(foods)) continue;
      for (const f of foods) {
        total += num((f as Record<string, unknown>)[field]);
      }
    } catch { /* skip corrupt day */ }
  }
  return total;
}

/** Returns true if any day in the window has at least one logged exercise. */
export function hasLoggedExercise(rows: DayRow[]): boolean {
  for (const r of rows) {
    const raw = String(r.data.exercises ?? '');
    if (raw.length > 2) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) return true;
      } catch { /* skip */ }
    }
  }
  return false;
}

/** Total volume (reps × weight) across every set on every lift in window. */
function liftVolume(rows: DayRow[]): number {
  let total = 0;
  for (const r of rows) {
    try {
      const exs = JSON.parse(String(r.data.exercises ?? '[]'));
      if (!Array.isArray(exs)) continue;
      for (const ex of exs) {
        if ((ex as { k?: string }).k !== 'lift') continue;
        const sets = Array.isArray((ex as { sets?: unknown }).sets)
          ? ((ex as { sets: Array<{ r?: unknown; w?: unknown }> }).sets)
          : Array.from(
              { length: parseInt(String((ex as { s?: unknown }).s ?? '1')) || 1 },
              () => ({ r: (ex as { r?: unknown }).r, w: (ex as { w?: unknown }).w }),
            );
        for (const s of sets) total += num(s.r) * num(s.w);
      }
    } catch { /* skip */ }
  }
  return total;
}

/** Total rep count across every set on every lift in window. */
function liftReps(rows: DayRow[]): number {
  let total = 0;
  for (const r of rows) {
    try {
      const exs = JSON.parse(String(r.data.exercises ?? '[]'));
      if (!Array.isArray(exs)) continue;
      for (const ex of exs) {
        if ((ex as { k?: string }).k !== 'lift') continue;
        const sets = Array.isArray((ex as { sets?: unknown }).sets)
          ? ((ex as { sets: Array<{ r?: unknown }> }).sets)
          : Array.from(
              { length: parseInt(String((ex as { s?: unknown }).s ?? '1')) || 1 },
              () => ({ r: (ex as { r?: unknown }).r }),
            );
        for (const s of sets) total += num(s.r);
      }
    } catch { /* skip */ }
  }
  return total;
}

/**
 * (endWeight - startWeight). Positive = gain, negative = loss.
 * Returns null if the user weighed in fewer than 2 times in the window —
 * we can't compute a delta with only one data point.
 */
function weightDelta(rows: DayRow[]): number | null {
  const weighed = rows
    .filter(r => num(r.data.weight) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (weighed.length < 2) return null;
  const start = num(weighed[0].data.weight);
  const end   = num(weighed[weighed.length - 1].data.weight);
  return end - start;
}

/** Returns null if every row in the window is missing the field. */
function sumOrNull(rows: DayRow[], field: string): number | null {
  let total = 0;
  let any = false;
  for (const r of rows) {
    const v = r.data[field];
    if (v === undefined || v === null || v === '') continue;
    const n = parseFloat(String(v));
    if (Number.isFinite(n)) { total += n; any = true; }
  }
  return any ? total : null;
}

function foodsHasField(rows: DayRow[], field: 'protein' | 'carbs' | 'fat'): boolean {
  for (const r of rows) {
    try {
      const foods = JSON.parse(String(r.data.foods ?? '[]'));
      if (Array.isArray(foods) && foods.length > 0) return true;
    } catch { /* skip */ }
    // A day-level macro field (pre-summed by CalorieTracker) also counts as data.
    if (num(r.data[field]) > 0) return true;
  }
  return false;
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const BATTLE_CATEGORIES: readonly BattleCategory[] = [
  // ── Cardio (all accumulate across every day in the battle window) ─────────
  {
    slug:        'cardio.steps',
    label:       'Most Steps Taken',
    group:       'cardio',
    direction:   'higher',
    unit:        'steps',
    description: 'Total steps accumulated across the battle window.',
    noDataLabel: 'no steps logged',
    requiresExercise: true,
    score: rows => sumOrNull(rows, 'steps'),
  },
  {
    slug:        'cardio.run_miles',
    label:       'Most Miles Ran',
    group:       'cardio',
    direction:   'higher',
    unit:        'mi',
    description: 'Total miles run, summed over every day in the window.',
    noDataLabel: 'no runs logged',
    requiresExercise: true,
    score: rows => sumOrNull(rows, 'runDist'),
  },
  {
    slug:        'cardio.swim_miles',
    label:       'Most Distance Swam',
    group:       'cardio',
    direction:   'higher',
    unit:        'mi',
    description: 'Total miles swum, summed over every day in the window.',
    noDataLabel: 'no swims logged',
    requiresExercise: true,
    score: rows => sumOrNull(rows, 'swimDist'),
  },
  {
    slug:        'cardio.bike_miles',
    label:       'Most Miles Biked',
    group:       'cardio',
    direction:   'higher',
    unit:        'mi',
    description: 'Total miles biked, summed over every day in the window.',
    noDataLabel: 'no rides logged',
    requiresExercise: true,
    score: rows => sumOrNull(rows, 'bikeDist'),
  },

  // ── Lift ──────────────────────────────────────────────────────────────────
  {
    slug:        'lift.volume',
    label:       'Most Weight Lifted',
    group:       'lift',
    direction:   'higher',
    unit:        'lb',
    description: 'Reps × weight, summed across every set of every lift in the window.',
    noDataLabel: 'no lifts logged',
    requiresExercise: true,
    score: rows => {
      if (!hasLoggedExercise(rows)) return null;
      return liftVolume(rows);
    },
  },
  {
    slug:        'lift.reps',
    label:       'Most Reps Done',
    group:       'lift',
    direction:   'higher',
    unit:        'reps',
    description: 'Raw total of reps performed across every lift in the window.',
    noDataLabel: 'no lifts logged',
    requiresExercise: true,
    score: rows => {
      if (!hasLoggedExercise(rows)) return null;
      return liftReps(rows);
    },
  },

  // ── Diet ──────────────────────────────────────────────────────────────────
  {
    slug:        'diet.kcal_more',
    label:       'Most Calories Eaten',
    group:       'diet',
    direction:   'higher',
    unit:        'kcal',
    description: 'Total kcal logged across every day in the window — higher wins.',
    noDataLabel: 'no food logged',
    score: rows => sumOrNull(rows, 'calsEaten'),
  },
  {
    slug:        'diet.kcal_less',
    label:       'Fewest Calories Eaten',
    group:       'diet',
    direction:   'lower',
    unit:        'kcal',
    description: 'Total kcal logged across every day in the window — lower wins.',
    noDataLabel: 'no food logged',
    score: rows => sumOrNull(rows, 'calsEaten'),
  },
  {
    slug:        'diet.protein',
    label:       'Most Protein Eaten',
    group:       'diet',
    direction:   'higher',
    unit:        'g',
    description: 'Total grams of protein across every meal in the window.',
    noDataLabel: 'no food logged',
    score: rows => {
      if (!foodsHasField(rows, 'protein')) return null;
      // Prefer the day-level protein field (already summed by CalorieTracker)
      // and fall back to summing the foods array directly.
      const dayLevel = sumOrNull(rows, 'protein');
      if (dayLevel !== null && dayLevel > 0) return dayLevel;
      return sumFromFoods(rows, 'protein');
    },
  },
  {
    slug:        'diet.carbs',
    label:       'Most Carbohydrates Eaten',
    group:       'diet',
    direction:   'higher',
    unit:        'g',
    description: 'Total grams of carbohydrates across every meal in the window.',
    noDataLabel: 'no food logged',
    score: rows => {
      if (!foodsHasField(rows, 'carbs')) return null;
      // Prefer the day-level field (already summed by CalorieTracker); fall back
      // to summing the foods array for days logged before it was stored.
      const dayLevel = sumOrNull(rows, 'carbs');
      if (dayLevel !== null && dayLevel > 0) return dayLevel;
      return sumFromFoods(rows, 'carbs');
    },
  },
  {
    slug:        'diet.fat',
    label:       'Most Fat Eaten',
    group:       'diet',
    direction:   'higher',
    unit:        'g',
    description: 'Total grams of fat across every meal in the window.',
    noDataLabel: 'no food logged',
    score: rows => {
      if (!foodsHasField(rows, 'fat')) return null;
      // Prefer the day-level field (already summed by CalorieTracker); fall back
      // to summing the foods array for days logged before it was stored.
      const dayLevel = sumOrNull(rows, 'fat');
      if (dayLevel !== null && dayLevel > 0) return dayLevel;
      return sumFromFoods(rows, 'fat');
    },
  },
  {
    slug:        'diet.weight_loss',
    label:       'Most Weight Lost',
    group:       'diet',
    direction:   'lower',                 // more negative = bigger loss = wins
    unit:        'lb',
    description: 'Difference between your first and last weigh-in in the window — most weight lost wins.',
    noDataLabel: 'needs ≥2 weigh-ins',
    safetyNote:  'Friendly competition — rapid weight loss is not healthy. Aim for ≤1–2 lb/week.',
    score: weightDelta,
  },
  {
    slug:        'diet.weight_gain',
    label:       'Most Weight Gained',
    group:       'diet',
    direction:   'higher',                // bigger positive = bigger gain = wins
    unit:        'lb',
    description: 'Difference between your first and last weigh-in in the window — most weight gained wins.',
    noDataLabel: 'needs ≥2 weigh-ins',
    safetyNote:  'Friendly competition — bulking is best done slowly. Aim for ≤1–2 lb/week.',
    score: weightDelta,
  },
] as const;

// ── Lookup helpers ───────────────────────────────────────────────────────────

const BY_SLUG = new Map(BATTLE_CATEGORIES.map(c => [c.slug, c]));

export function getCategory(slug: string): BattleCategory | undefined {
  return BY_SLUG.get(slug);
}

export function isValidCategorySlug(slug: string): boolean {
  return BY_SLUG.has(slug);
}

/** Allowed bestOf values — also the allowed length of `categories`. */
export const BEST_OF_VALUES = [1, 3, 5] as const;
export type BestOf = typeof BEST_OF_VALUES[number];

/** Allowed window kinds. */
export const WINDOW_KINDS = ['day', '3day', 'week'] as const;
export type WindowKind = typeof WINDOW_KINDS[number];

/** Human label for a window kind, e.g. for battle cards. */
export function windowLabel(windowKind: string): string {
  return windowKind === 'day' ? '1-day' : windowKind === '3day' ? '3-day' : windowKind === 'week' ? '7-day' : windowKind;
}
