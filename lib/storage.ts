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
