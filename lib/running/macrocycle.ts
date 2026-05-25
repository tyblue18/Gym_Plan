import type { RaceDistance, TrainingPhase } from './types';

// Taper weeks per race type (includes race week itself)
export const TAPER_WEEKS: Record<RaceDistance, number> = {
  '5k':     1,
  '10k':    1,
  half:     2,
  marathon: 3,
};

// Taper volume factors (applied to peak weekly mileage)
const TAPER_FACTORS: Record<RaceDistance, number[]> = {
  '5k':     [0.50],
  '10k':    [0.55],
  half:     [0.72, 0.48],
  marathon: [0.82, 0.62, 0.42],
};

export interface WeekSkeleton {
  weekNumber: number;
  phase:      TrainingPhase;
  totalMiles: number;
  isRecovery: boolean;
}

function phaseForWeek(weekIndex: number, trainWeeks: number): TrainingPhase {
  const base   = Math.max(1, Math.round(trainWeeks * 0.25));
  const build1 = Math.max(1, Math.round(trainWeeks * 0.30));
  const build2 = Math.max(1, Math.round(trainWeeks * 0.25));

  if (weekIndex < base)                   return 'base';
  if (weekIndex < base + build1)          return 'build1';
  if (weekIndex < base + build1 + build2) return 'build2';
  return 'peak';
}

/**
 * Build week-by-week mileage skeleton.
 * - currentMPW is always in miles.
 * - 10 % weekly build, recovery every 4th week at 78 %, hard cap at 2.2× start.
 */
export function buildMacrocycle(
  currentMPW:   number,
  totalWeeks:   number,
  raceDistance: RaceDistance,
): WeekSkeleton[] {
  const tapWeeks   = TAPER_WEEKS[raceDistance];
  const trainWeeks = Math.max(1, totalWeeks - tapWeeks);
  const cap        = Math.max(currentMPW * 2.2, currentMPW + 20);

  const skeletons: WeekSkeleton[] = [];
  let peakMiles = currentMPW;

  // ── Training block ─────────────────────────────────────────────────────────
  for (let i = 0; i < trainWeeks; i++) {
    const isRecovery = (i + 1) % 4 === 0;
    const raw        = currentMPW * Math.pow(1.10, i);
    const capped     = Math.min(raw, cap);
    const miles      = isRecovery ? capped * 0.78 : capped;

    if (!isRecovery) peakMiles = miles;

    skeletons.push({
      weekNumber: i + 1,
      phase:      trainWeeks <= 2 ? 'base' : phaseForWeek(i, trainWeeks),
      totalMiles: Math.round(miles * 10) / 10,
      isRecovery,
    });
  }

  // ── Taper block ────────────────────────────────────────────────────────────
  const factors = TAPER_FACTORS[raceDistance];
  for (let j = 0; j < tapWeeks; j++) {
    const factor = j < factors.length ? factors[j] : 0.35;
    skeletons.push({
      weekNumber: trainWeeks + j + 1,
      phase:      'taper',
      totalMiles: Math.round(peakMiles * factor * 10) / 10,
      isRecovery: false,
    });
  }

  return skeletons;
}
