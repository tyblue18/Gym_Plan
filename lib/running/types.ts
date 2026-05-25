export type RaceDistance = '5k' | '10k' | 'half' | 'marathon';
export type FitnessMethod = 'race' | 'pace';
export type TrainingPhase = 'base' | 'build1' | 'build2' | 'peak' | 'taper';
export type WorkoutType =
  | 'rest' | 'easy' | 'strides' | 'long'
  | 'marathon' | 'threshold' | 'interval' | 'repetition';
// 0=Sun 1=Mon … 6=Sat
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TrainingInputs {
  raceDistance:        RaceDistance;
  raceDate:            string;          // YYYY-MM-DD
  fitnessMethod:       FitnessMethod;
  recentRaceDistance?: RaceDistance;
  recentRaceSeconds?:  number;          // total seconds for recent race
  easyPaceSeconds?:    number;          // sec per unit (same as `units`)
  currentMPW:          number;          // in `units` per week
  daysPerWeek:         number;          // 3–6
  longRunDay:          DayOfWeek;
  units:               'mi' | 'km';
}

export interface TrainingPaces {
  easyLow:    number;   // sec / mile (always miles internally)
  easyHigh:   number;
  marathon:   number;
  threshold:  number;
  interval:   number;
  repetition: number;
}

export interface VDOTSummary {
  vdot:              number;
  predictedGoalTime: number;   // seconds
  paces:             TrainingPaces;
}

export interface DayWorkout {
  dayOfWeek:   DayOfWeek;
  type:        WorkoutType;
  miles:       number;        // always miles internally
  description: string;
}

export interface WeekPlan {
  weekNumber: number;
  phase:      TrainingPhase;
  totalMiles: number;
  days:       DayWorkout[];
  isRecovery: boolean;
}

export interface TrainingPlan {
  inputs:     TrainingInputs;
  vdot:       VDOTSummary;
  weeks:      WeekPlan[];
  totalWeeks: number;
}
