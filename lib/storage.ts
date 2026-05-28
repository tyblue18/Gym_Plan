/**
 * lib/storage.ts
 *
 * Pure localStorage I/O helpers — these don't depend on React state, so they
 * live outside AppContext to keep the context value small. Importing them
 * directly (rather than reading them off `useApp()`) avoids context churn
 * when callers only need stateless storage access.
 */

import type { WorkoutTemplate, WorkoutPreset } from '@/lib/AppContext';
import {
  EXERCISE_USAGE_KEY,
  CUSTOM_EXERCISES_KEY,
  TEMPLATES_KEY,
  WORKOUT_PRESETS_KEY,
  LAST_STREAK_KEY,
} from '@/lib/constants';

// ── Exercise usage frequency (used to sort exercise suggestions) ─────────────

export function getUsage(): Record<string, Record<string, number>> {
  try {
    return JSON.parse(localStorage.getItem(EXERCISE_USAGE_KEY) ?? '{}');
  } catch { return {}; }
}

export function bumpUsage(group: string, name: string): void {
  const u = getUsage();
  if (!u[group]) u[group] = {};
  u[group][name] = (u[group][name] ?? 0) + 1;
  try { localStorage.setItem(EXERCISE_USAGE_KEY, JSON.stringify(u)); } catch { /* noop */ }
}

// ── Custom (user-added) exercises ────────────────────────────────────────────
// A preset's muscle map lives in code (SECONDARY_MUSCLES); custom exercises are
// the user's own additions, so we persist the muscles they hit here keyed by
// primary group → name. This is what keeps a custom exercise — and the muscle
// groups it trains — in the picker for next time.

export interface ExerciseMuscles { g2?: string; g3?: string }

export function getCustomExercises(): Record<string, Record<string, ExerciseMuscles>> {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_EXERCISES_KEY) ?? '{}');
  } catch { return {}; }
}

export function saveCustomExercise(group: string, name: string, muscles: ExerciseMuscles): void {
  const all = getCustomExercises();
  if (!all[group]) all[group] = {};
  all[group][name] = {
    ...(muscles.g2 ? { g2: muscles.g2 } : {}),
    ...(muscles.g3 ? { g3: muscles.g3 } : {}),
  };
  try { localStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(all)); } catch { /* noop */ }
}

// ── Workout templates pool ───────────────────────────────────────────────────

export function getTemplatePool(defaults: WorkoutTemplate[]): WorkoutTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATES_KEY) ?? 'null') ?? defaults;
  } catch { return defaults; }
}

export function saveTemplatePool(pool: WorkoutTemplate[]): void {
  try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(pool)); } catch { /* noop */ }
}

// ── Recurring / saved workout presets ────────────────────────────────────────

export function getWorkoutPresets(): WorkoutPreset[] {
  try {
    return JSON.parse(localStorage.getItem(WORKOUT_PRESETS_KEY) ?? '[]');
  } catch { return []; }
}

export function saveWorkoutPresets(ps: WorkoutPreset[]): void {
  try { localStorage.setItem(WORKOUT_PRESETS_KEY, JSON.stringify(ps)); } catch { /* noop */ }
}

// ── Calorie-goal streak ──────────────────────────────────────────────────────

export function getLastStreak(): number {
  return parseInt(localStorage.getItem(LAST_STREAK_KEY) ?? '-1', 10);
}

export function saveLastStreak(n: number): void {
  try { localStorage.setItem(LAST_STREAK_KEY, String(n)); } catch { /* noop */ }
}
