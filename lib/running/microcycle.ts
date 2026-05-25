import { formatPace } from './vdot';
import type {
  TrainingPhase, WorkoutType, DayOfWeek,
  DayWorkout, TrainingPaces,
} from './types';
import type { WeekSkeleton } from './macrocycle';

// ─── Day selection helpers ─────────────────────────────────────────────────

function isAdjacent(a: number, b: number): boolean {
  const d = Math.abs(a - b);
  return d === 1 || d === 6;   // wrap Sat→Sun
}

/** Choose which days of the week to run on, given the long-run day anchor. */
function selectRunDays(daysPerWeek: number, longRunDay: DayOfWeek): number[] {
  // Mid-week preference order (Tue, Thu, Wed, Mon, Fri, Sun, Sat)
  const preference = [2, 4, 3, 1, 5, 0, 6];
  const chosen = new Set<number>([longRunDay]);
  for (const d of preference) {
    if (chosen.size >= daysPerWeek) break;
    chosen.add(d);
  }
  return [...chosen].sort((a, b) => a - b);
}

/**
 * Among the chosen run days, pick up to `numQuality` days for hard sessions.
 * Hard sessions must not be adjacent to the long run or each other.
 * Falls back to relaxed adjacency if strict selection doesn't find enough days.
 */
function selectQualityDays(
  runDays: number[],
  longRunDay: DayOfWeek,
  numQuality: number,
): number[] {
  if (numQuality === 0) return [];

  const nonLong = runDays.filter(d => d !== longRunDay);
  // Sort by proximity to Wednesday (ideal hard-effort day)
  const sorted = [...nonLong].sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));

  const hardDays  = new Set<number>([longRunDay]);
  const quality: number[] = [];

  // Strict pass: not adjacent to long run OR each other
  for (const d of sorted) {
    if (quality.length >= numQuality) break;
    const adjHard    = [...hardDays].some(h => isAdjacent(d, h));
    const adjQuality = quality.some(q => isAdjacent(d, q));
    if (!adjHard && !adjQuality) {
      quality.push(d);
      hardDays.add(d);
    }
  }

  // Relaxed pass: only avoid adjacency to other quality days
  for (const d of sorted) {
    if (quality.length >= numQuality) break;
    if (quality.includes(d)) continue;
    if (!quality.some(q => isAdjacent(d, q))) {
      quality.push(d);
    }
  }

  return quality;
}

// ─── Phase quality assignments ─────────────────────────────────────────────

function qualityTypes(
  phase: TrainingPhase,
  isRecovery: boolean,
  daysPerWeek: number,
): WorkoutType[] {
  if (isRecovery || phase === 'base') return [];
  const cap = daysPerWeek <= 3 ? 1 : 2;
  switch (phase) {
    case 'build1': return cap === 1 ? ['threshold']             : ['marathon', 'threshold'];
    case 'build2': return cap === 1 ? ['threshold']             : ['threshold', 'interval'];
    case 'peak':   return cap === 1 ? ['interval']              : ['interval', 'repetition'];
    case 'taper':  return ['threshold'];
    default:       return [];
  }
}

// ─── Per-workout mileage ────────────────────────────────────────────────────

function qualityMiles(type: WorkoutType, weekly: number): number {
  const factors: Record<string, number> = {
    marathon:   0.22,
    threshold:  0.16,
    interval:   0.15,
    repetition: 0.12,
  };
  const mins:  Record<string, number> = { marathon: 5, threshold: 4, interval: 5, repetition: 4 };
  const maxes: Record<string, number> = { marathon: 14, threshold: 9, interval: 12, repetition: 8 };
  const raw = weekly * (factors[type] ?? 0.15);
  return Math.round(Math.max(mins[type] ?? 4, Math.min(maxes[type] ?? 8, raw)) * 10) / 10;
}

// ─── Workout descriptions ────────────────────────────────────────────────────

function describeDay(
  type: WorkoutType,
  miles: number,
  paces: TrainingPaces,
  units: 'mi' | 'km',
): string {
  const pu  = units;
  const ef  = formatPace(paces.easyHigh, units);
  const mf  = formatPace(paces.marathon, units);
  const tf  = formatPace(paces.threshold, units);
  const inf = formatPace(paces.interval, units);
  const rf  = formatPace(paces.repetition, units);

  switch (type) {
    case 'easy':
      return `${miles} ${pu} easy (${ef}/${pu})`;
    case 'strides':
      return `${miles} ${pu} easy (${ef}/${pu}) + 6×20 s strides`;
    case 'long':
      return `Long ${miles} ${pu} easy (${ef}/${pu})`;
    case 'marathon': {
      const qm = Math.round(miles * 0.60 * 10) / 10;
      return `${miles} ${pu} w/ ${qm} ${pu} @ M-pace (${mf}/${pu})`;
    }
    case 'threshold': {
      const qm = Math.round(miles * 0.55 * 10) / 10;
      const reps = Math.max(2, Math.min(5, Math.round(qm)));
      if (qm <= 3) return `${miles} ${pu} w/ ${qm} ${pu} tempo @ T (${tf}/${pu})`;
      return `${miles} ${pu} w/ ${reps}×1 ${pu} @ T (${tf}/${pu}), 1 min rest`;
    }
    case 'interval': {
      const reps = Math.max(4, Math.min(8, Math.round(miles * 0.5)));
      return `${miles} ${pu} w/ ${reps}×1000 m @ I (${inf}/${pu}), 3 min jog`;
    }
    case 'repetition': {
      const reps = Math.max(6, Math.min(12, Math.round(miles * 1.5)));
      return `${miles} ${pu} w/ ${reps}×400 m @ R (${rf}/${pu}), 400 m jog`;
    }
    default:
      return 'Rest';
  }
}

// ─── Main scheduler ─────────────────────────────────────────────────────────

export function scheduleMicrocycle(
  skeleton:   WeekSkeleton,
  daysPerWeek: number,
  longRunDay:  DayOfWeek,
  paces:       TrainingPaces,
  units:       'mi' | 'km',
): DayWorkout[] {
  const { phase, totalMiles, isRecovery } = skeleton;

  const qTypes  = qualityTypes(phase, isRecovery, daysPerWeek);
  const runDays = selectRunDays(daysPerWeek, longRunDay);
  const qDays   = selectQualityDays(runDays, longRunDay, qTypes.length);

  // Long-run miles (30 % of week, capped)
  const longMi = Math.round(
    Math.max(4, Math.min(phase === 'taper' ? 12 : 22, totalMiles * 0.30)) * 10
  ) / 10;

  // Quality miles
  const qMiles = qTypes.map(t => qualityMiles(t, totalMiles));

  // Easy miles: whatever's left, split across remaining run days
  const easyDays    = runDays.filter(d => d !== longRunDay && !qDays.includes(d));
  const allocated   = longMi + qMiles.reduce((s, m) => s + m, 0);
  const easyBudget  = Math.max(0, totalMiles - allocated);
  const easyMPD     = easyDays.length > 0
    ? Math.round((easyBudget / easyDays.length) * 10) / 10
    : 0;

  // Build day array (default = rest)
  const days: DayWorkout[] = Array.from({ length: 7 }, (_, i) => ({
    dayOfWeek:   i as DayOfWeek,
    type:        'rest',
    miles:       0,
    description: 'Rest',
  }));

  // Long run
  days[longRunDay] = {
    dayOfWeek:   longRunDay,
    type:        'long',
    miles:       longMi,
    description: describeDay('long', longMi, paces, units),
  };

  // Quality sessions
  qDays.forEach((d, i) => {
    const t = qTypes[i];
    const m = qMiles[i];
    days[d] = { dayOfWeek: d as DayOfWeek, type: t, miles: m, description: describeDay(t, m, paces, units) };
  });

  // Easy / strides
  const withStrides = phase === 'base';
  for (const d of easyDays) {
    if (easyMPD <= 0) continue;
    const t: WorkoutType = withStrides ? 'strides' : 'easy';
    days[d] = { dayOfWeek: d as DayOfWeek, type: t, miles: easyMPD, description: describeDay(t, easyMPD, paces, units) };
  }

  return days;
}
