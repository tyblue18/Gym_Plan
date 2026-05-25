import type { TrainingInputs, TrainingPlan, WeekPlan } from './types';
import { RACE_METERS, computeVDOT, predictRaceTime, vdotFromEasyPace, computeTrainingPaces } from './vdot';
import { buildMacrocycle }   from './macrocycle';
import { scheduleMicrocycle } from './microcycle';

/**
 * Entry point: given user inputs, return a complete training plan.
 * Returns null if the race date is fewer than 2 weeks away or inputs are invalid.
 */
export function buildTrainingPlan(inputs: TrainingInputs): TrainingPlan | null {
  // ── Total weeks until race ─────────────────────────────────────────────────
  const today     = new Date();
  today.setHours(0, 0, 0, 0);
  const raceDay   = new Date(inputs.raceDate);
  raceDay.setHours(0, 0, 0, 0);
  const totalWeeks = Math.floor((raceDay.getTime() - today.getTime()) / (7 * 24 * 3600 * 1000));

  if (totalWeeks < 2) return null;

  // ── VDOT ──────────────────────────────────────────────────────────────────
  let rawVDOT: number;

  if (inputs.fitnessMethod === 'race' && inputs.recentRaceDistance && inputs.recentRaceSeconds) {
    rawVDOT = computeVDOT(RACE_METERS[inputs.recentRaceDistance], inputs.recentRaceSeconds);
  } else if (inputs.fitnessMethod === 'pace' && inputs.easyPaceSeconds) {
    // Convert pace to sec/mile if user entered in km
    const secPerMile = inputs.units === 'km'
      ? inputs.easyPaceSeconds * 1.609344
      : inputs.easyPaceSeconds;
    rawVDOT = vdotFromEasyPace(secPerMile);
  } else {
    return null;
  }

  const vdot = Math.round(rawVDOT * 10) / 10;
  if (vdot < 18 || vdot > 90) return null;   // sanity check

  // ── Paces + predicted time ────────────────────────────────────────────────
  const paces             = computeTrainingPaces(vdot);
  const predictedGoalTime = predictRaceTime(vdot, RACE_METERS[inputs.raceDistance]);

  // ── Normalise mileage to miles ────────────────────────────────────────────
  const currentMPW_mi = inputs.units === 'km'
    ? inputs.currentMPW / 1.609344
    : inputs.currentMPW;

  // ── Build macrocycle skeletons ────────────────────────────────────────────
  const skeletons = buildMacrocycle(currentMPW_mi, totalWeeks, inputs.raceDistance);

  // ── Schedule each week's days ─────────────────────────────────────────────
  const weeks: WeekPlan[] = skeletons.map(sk => ({
    weekNumber: sk.weekNumber,
    phase:      sk.phase,
    totalMiles: sk.totalMiles,
    isRecovery: sk.isRecovery,
    days:       scheduleMicrocycle(
      sk,
      inputs.daysPerWeek,
      inputs.longRunDay,
      paces,
      inputs.units,
    ),
  }));

  return {
    inputs,
    vdot: { vdot, predictedGoalTime, paces },
    weeks,
    totalWeeks: weeks.length,
  };
}
