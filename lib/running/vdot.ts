import type { RaceDistance, TrainingPaces } from './types';

export const RACE_METERS: Record<RaceDistance, number> = {
  '5k':     5_000,
  '10k':    10_000,
  half:     21_097.5,
  marathon: 42_195,
};

export const RACE_LABELS: Record<RaceDistance, string> = {
  '5k':     '5K',
  '10k':    '10K',
  half:     'Half Marathon',
  marathon: 'Marathon',
};

// Jack Daniels formula: velocity (m/min) → VO2 at that velocity
function velocityToVO2(v: number): number {
  return -4.60 + 0.182258 * v + 0.000104 * v * v;
}

// Fractional utilization of VO2max sustainable for t minutes
function pctVO2max(t: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * t) +
    0.2989558 * Math.exp(-0.1932605 * t)
  );
}

// Given a target VO2, solve the quadratic for velocity (m/min)
function vo2ToVelocity(targetVO2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -(4.60 + targetVO2);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Compute VDOT from a recent race (distance in metres, time in seconds). */
export function computeVDOT(distMeters: number, timeSeconds: number): number {
  const t = timeSeconds / 60;       // minutes
  const v = distMeters / t;         // m/min
  return velocityToVO2(v) / pctVO2max(t);
}

/** Predict finish time (seconds) for a given distance from VDOT. */
export function predictRaceTime(vdot: number, distMeters: number): number {
  // Binary search for t such that VO2(dist/t) / pct(t) = vdot
  let lo = distMeters / 700;
  let hi = distMeters / 50;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const computed = velocityToVO2(distMeters / mid) / pctVO2max(mid);
    if (computed > vdot) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 60;
}

/**
 * Infer VDOT from an easy pace (sec/mile).
 * Easy pace runs at ~65 % of VO2max.
 */
export function vdotFromEasyPace(secPerMile: number): number {
  const v = 1609.344 / (secPerMile / 60);  // m/min
  return velocityToVO2(v) / 0.65;
}

/** All Jack Daniels training paces (stored as sec/mile). */
export function computeTrainingPaces(vdot: number): TrainingPaces {
  const vEasyLow  = vo2ToVelocity(vdot * 0.59);
  const vEasyHigh = vo2ToVelocity(vdot * 0.74);
  const vMarathon = vo2ToVelocity(vdot * 0.84);
  const vThresh   = vo2ToVelocity(vdot * 0.88);
  const vInterval = vo2ToVelocity(vdot * 0.98);
  const vRep      = vInterval * 1.095;   // R ≈ 9.5 % faster velocity than I

  const toSecMile = (v: number) => Math.round((1609.344 / v) * 60);
  return {
    easyLow:    toSecMile(vEasyLow),
    easyHigh:   toSecMile(vEasyHigh),
    marathon:   toSecMile(vMarathon),
    threshold:  toSecMile(vThresh),
    interval:   toSecMile(vInterval),
    repetition: toSecMile(vRep),
  };
}

/** Format a sec/mile pace as "m:ss / unit" string. */
export function formatPace(secPerMile: number, units: 'mi' | 'km'): string {
  const sec = units === 'km'
    ? Math.round(secPerMile / 1.609344)
    : Math.round(secPerMile);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Format a total-seconds duration as "h:mm:ss" or "m:ss". */
export function formatTime(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
