'use client';

/**
 * lib/AppContext.tsx
 *
 * Global React context for Que. Wrap the authenticated shell with <AppProvider>
 * and consume anywhere with useApp().
 *
 * Storage key map:
 *   ironmanCoreDB_v2          → localDB
 *   ironmanProfileSettings_v2 → profile
 *   ironmanTemplatesPool      → getTemplatePool() / saveTemplatePool()
 *   queExerciseUsage          → getUsage() / bumpUsage()
 *   queLastStreak             → getLastStreak() / setLastStreak()
 *   queWorkoutPresets         → getWorkoutPresets() / saveWorkoutPresets()
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { queueSync, pullFromCloud, restoreSettings } from '@/lib/syncEngine';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type ViewMode = 'day' | 'week' | 'month';
export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'tricep' | 'bicep'
  | 'forearms' | 'abs' | 'quads' | 'hamstring' | 'glutes'
  | 'calfs' | 'adductors';

/** One set's reps + weight, mirrors pendingSetData entries */
export interface SetData {
  r: string; // reps
  w: string; // weight (optional, free-text e.g. "135 lbs")
}

/** A single logged exercise or cardio entry */
export interface ExerciseEntry {
  k: 'lift' | 'text' | 'run' | 'bike' | 'swim';
  g?: string;       // muscle group (lift only)
  n?: string;       // exercise name
  sets?: SetData[]; // per-set data (lift only, new format)
  s?: string;       // legacy: set count
  r?: string;       // legacy: reps
  w?: string;       // legacy: weight
  v1?: string;      // cardio field 1 (distance / duration)
  v2?: string;      // cardio field 2 (time)
  note?: string;    // cardio notes
}

/** One day's persisted data record */
export interface DayRecord {
  steps?:    string | number;
  runDist?:  string | number;
  runTime?:  string | number;
  bikeDist?: string | number;
  bikeTime?: string | number;
  swimTime?: string | number;
  exercises?: string;  // JSON-serialised ExerciseEntry[]
  notes?:    string;
  weight?:   string;
  burn?:     number;
  budget?:   number;
  calsEaten?: string;
  protein?:  number;
}

/** Keyed by "YYYY-MM-DD" */
export type LocalDB = Record<string, DayRecord>;

/** User's metabolic profile (mirrors ironmanProfileSettings_v2) */
export interface UserProfile {
  weight:        string; // lbs
  height:        string; // inches
  age:           string;
  sex:           'male' | 'female';
  deficit:       string; // kcal/day goal
  activityLevel: string; // multiplier string e.g. "1.45"
}

export interface WorkoutTemplate {
  id:    string;
  title: string;
  text:  string;
}

export interface WorkoutPreset {
  id:          string;
  name:        string;
  exercises:   string; // JSON-serialised ExerciseEntry[]
  isRecurring: boolean;
  daysOfWeek:  number[];
  everyNWeeks: number;
  createdAt:   string; // YYYY-MM-DD
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS  (immutable — not stored in React state)
// ─────────────────────────────────────────────────────────────────────────────

export const MONTHS: string[] = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export const PRESETS: Record<MuscleGroup, string[]> = {
  chest:     ['Bench Press','Incline Bench Press','Decline Bench Press','Chest Flyes','Cable Crossover','Push-ups','Machine Chest Press','Pec Deck','Smith Machine Press','Dumbbell Pullover'],
  back:      ['Pull-ups','Chin-ups','Lat Pulldown','T-Bar Row','Barbell Row','Seated Cable Row','Single-Arm Row','Face Pulls','Shrugs','Deadlift','Sumo Deadlift','Rack Pull','Straight-Arm Pulldown'],
  tricep:    ['Tricep Pushdown','Overhead Tricep Extension','Skull Crushers','Close-Grip Bench','Dips','Cable Tricep Kickback','Diamond Push-ups','Tricep Machine'],
  bicep:     ['Barbell Curl','Dumbbell Curl','Hammer Curls','Preacher Curl','Incline Curl','Cable Curl','Concentration Curl','Spider Curl','21s'],
  forearms:  ['Wrist Curls','Reverse Wrist Curls','Reverse Curl','Farmer Carries','Dead Hang','Plate Pinch'],
  shoulders: ['Overhead Press','Arnold Press','Lateral Raises','Front Raises','Rear Delt Flyes','Cable Lateral Raise','Face Pulls','Upright Row','Machine Shoulder Press'],
  abs:       ['Plank','Side Plank','Crunches','Bicycle Crunches','Dead Bug','Russian Twists','Hanging Leg Raises','Cable Crunch','Ab Wheel Rollout','V-ups','Pallof Press','Dragon Flag'],
  quads:     ['Back Squat','Front Squat','Leg Press','Leg Extension','Lunges','Bulgarian Split Squat','Pendulum Squat','Hack Squat','Step-ups'],
  hamstring: ['Romanian Deadlift','Stiff-Leg Deadlift','Leg Curl','Seated Leg Curl','Nordic Curl','Good Mornings','Glute-Ham Raise'],
  glutes:    ['Hip Thrust','Glute Bridge','Glute Kickback','Cable Pull-Through','Frog Pump','Donkey Kicks'],
  calfs:     ['Standing Calf Raise','Seated Calf Raise','Single-Leg Calf Raise','Donkey Calf Raise','Leg Press Calf Raise'],
  adductors: ['Hip Adduction Machine','Copenhagen Plank','Wide-Stance Squat','Side Lunges','Cable Hip Adduction','Sumo Squat'],
};

export const DEFAULT_TEMPLATES: WorkoutTemplate[] = [
  { id:'1', title:'Day 1: Upper Body HIT + Swim',   text:'Incline Bench Smith: 2x failure\nChest Flyes: 2x\nT-Bar Rows: 2x\nWeighted Pullups: 2x\nShrugs: 2x\nTricep Ext: 3x\nPreacher + Curls: 4x\nLateral Raises: 3x\nFarmer Carries: 2x\n[Swim 1: 45m Drills]' },
  { id:'2', title:'Day 2: Legs (Hams/Glutes)',       text:'Stiff Legged Deadlifts (RDL): 3x failure\nGlute Squats/Bridges: 2x\nHamstring Curls: 2x\nHip Adduction: 2x\nAbs Core Setup: 2x\n[NO CARDIO RECOVERY]' },
  { id:'3', title:'Day 3: Aerobic Flush',            text:'[Bike Z2 Spin: 60m @ 85-90 RPM]\n[Run Easy Base: 30m]' },
  { id:'4', title:'Day 4: Upper Repeat',             text:'Incline Bench Smith: 2x failure\nChest Flyes: 2x\nT-Bar Rows: 2x\nWeighted Pullups: 2x\nShrugs: 2x\nTricep Ext: 3x\nPreacher + Curls: 4x\nLateral Raises: 3x\nFarmer Carries: 2x\n[Swim 2: 45m Laps]' },
  { id:'5', title:'Day 5: Legs (Quads/Calf)',        text:'Pendulum Squat: 3x failure\nQuad Extensions: 2x\nHip Abduction: 2x\nCalf Raises: 2x\nAbs Core Setup: 2x' },
  { id:'6', title:'Day 6: Metabolic Clearance',      text:'[Run: 30-45m Slow Flush Jog]' },
  { id:'7', title:'Day 7: Endurance Peak',           text:'[Long Bike: Z2 Aero position]\n[Long Run: Z2 Conversational]' },
  { id:'8', title:'Day 8: Systemic Reset',           text:'[TOTAL REST - CNS DOWNREGULATION]' },
];

const DEFAULT_PROFILE: UserProfile = {
  weight:        '180',
  height:        '70',
  age:           '29',
  sex:           'male',
  deficit:       '500',
  activityLevel: '1.45',
};

// Storage keys — exactly as used in the vanilla JS app
const DB_KEY       = 'ironmanCoreDB_v2';
const PROFILE_KEY  = 'ironmanProfileSettings_v2';
const TEMPLATE_KEY = 'ironmanTemplatesPool';
const USAGE_KEY    = 'queExerciseUsage';
const STREAK_KEY   = 'queLastStreak';
const PRESETS_KEY  = 'queWorkoutPresets';

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — safe date string
// ─────────────────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface AppContextValue {
  // ── Derived from _today (read-only, never changes) ──────────────────────
  today:    Date;
  todayStr: string;

  // ── 1. localDBInstance ──────────────────────────────────────────────────
  localDB:    LocalDB;
  setLocalDB: React.Dispatch<React.SetStateAction<LocalDB>>;

  // ── 2. activeDayFocusString ─────────────────────────────────────────────
  activeDayFocus:    string;
  setActiveDayFocus: (dateStr: string) => void;

  // ── 3. currentDisplayDate ───────────────────────────────────────────────
  currentDisplayDate:    Date;
  setCurrentDisplayDate: React.Dispatch<React.SetStateAction<Date>>;

  // ── 4. activeViewMode ───────────────────────────────────────────────────
  viewMode:    ViewMode;
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>;

  // ── 5. currentGroup ─────────────────────────────────────────────────────
  currentGroup:    string;
  setCurrentGroup: React.Dispatch<React.SetStateAction<string>>;

  // ── 6 & 7. lastBurn / lastBudget (cached calculation results) ───────────
  lastBurn:    number;
  setLastBurn: React.Dispatch<React.SetStateAction<number>>;
  lastBudget:    number;
  setLastBudget: React.Dispatch<React.SetStateAction<number>>;

  // ── 8 & 9. pendingSetsCount / pendingSetData ─────────────────────────────
  pendingSetsCount:    number;
  setPendingSetsCount: React.Dispatch<React.SetStateAction<number>>;
  pendingSetData:    SetData[];
  setPendingSetData: React.Dispatch<React.SetStateAction<SetData[]>>;

  // ── 10. UserProfile (was split across 6 bio-* inputs) ───────────────────
  profile:    UserProfile;
  setProfile: (updates: Partial<UserProfile>) => void;

  // ── 11–14. Static constants (not state, but surfaced here for convenience)
  months:           string[];
  presets:          Record<MuscleGroup, string[]>;
  defaultTemplates: WorkoutTemplate[];

  // ── Loading gate (false during the initial localStorage hydration) ───────
  isLoaded: boolean;

  // ── High-level storage actions ───────────────────────────────────────────

  /** Merge `updates` into a day record and persist to localStorage. */
  updateDayRecord: (dateStr: string, updates: Partial<DayRecord>) => void;

  /** Read a day record (returns empty object if not found). */
  getDayRecord: (dateStr: string) => DayRecord;

  /** Persist the current localDB snapshot to localStorage immediately. */
  persistDB: (db?: LocalDB) => void;

  /** Persist the user profile to localStorage (full or partial update). */
  persistProfile: (updates: Partial<UserProfile>) => void;

  // ── Secondary-storage helpers (mirrors vanilla JS helpers) ───────────────

  getUsage: () => Record<string, Record<string, number>>;
  bumpUsage: (group: string, name: string) => void;

  getTemplatePool: () => WorkoutTemplate[];
  saveTemplatePool: (pool: WorkoutTemplate[]) => void;

  getWorkoutPresets: () => WorkoutPreset[];
  saveWorkoutPresets: (presets: WorkoutPreset[]) => void;

  getLastStreak: () => number;
  saveLastStreak: (n: number) => void;

  /** Most recent weight on or before dateStr (mirrors vanilla getLastKnownWeight). */
  getLastKnownWeight: (dateStr: string) => string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  // ── Today — state so the hydration effect can correct it to the client's
  //    local clock (useRef captures the server's UTC time during SSR).
  const [today, setTodayInternal] = useState<Date>(() => new Date());
  const todayStr = toDateStr(today);

  // ── Loading gate — becomes true after localStorage is hydrated ───────────
  const [isLoaded, setIsLoaded] = useState(false);

  // ── 1. localDB ─────────────────────────────────────────────────────────────
  const [localDB, setLocalDB] = useState<LocalDB>({});

  // ── 2. activeDayFocusString ────────────────────────────────────────────────
  const [activeDayFocus, setActiveDayFocusRaw] = useState<string>(todayStr);

  // ── 3. currentDisplayDate ──────────────────────────────────────────────────
  const [currentDisplayDate, setCurrentDisplayDate] = useState<Date>(
    () => new Date(today.getFullYear(), today.getMonth(), today.getDate())
  );

  // ── 4. activeViewMode (defaults to week on mobile, month on desktop) ───────
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  // ── 5. currentGroup ────────────────────────────────────────────────────────
  const [currentGroup, setCurrentGroup] = useState<string>('chest');

  // ── 6 & 7. lastBurn / lastBudget ───────────────────────────────────────────
  const [lastBurn,   setLastBurn]   = useState<number>(0);
  const [lastBudget, setLastBudget] = useState<number>(0);

  // ── 8 & 9. pendingSetsCount / pendingSetData ───────────────────────────────
  const [pendingSetsCount, setPendingSetsCount] = useState<number>(3);
  const [pendingSetData,   setPendingSetData]   = useState<SetData[]>([
    { r: '1', w: '' },
    { r: '1', w: '' },
    { r: '1', w: '' },
  ]);

  // ── 10. UserProfile ────────────────────────────────────────────────────────
  const [profile, setProfileState] = useState<UserProfile>(DEFAULT_PROFILE);

  // ─────────────────────────────────────────────────────────────────────────
  // HYDRATION — runs once on mount (client only, never on SSR)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // ── Correct SSR timezone mismatch ─────────────────────────────────────
    //    The server runs UTC; the client has the user's actual local date.
    //    Re-derive today from the client clock and reset navigation state.
    const clientNow = new Date();
    const clientStr = toDateStr(clientNow);
    setTodayInternal(clientNow);
    setActiveDayFocusRaw(clientStr);
    setCurrentDisplayDate(
      new Date(clientNow.getFullYear(), clientNow.getMonth(), clientNow.getDate())
    );

    // ── Load user profile ─────────────────────────────────────────────────
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Record<string, string>;
        // Vanilla JS stored single-char keys: w/h/a/s/b/l
        setProfileState({
          weight:        p.w || DEFAULT_PROFILE.weight,
          height:        p.h || DEFAULT_PROFILE.height,
          age:           p.a || DEFAULT_PROFILE.age,
          sex:           (p.s as 'male' | 'female') || DEFAULT_PROFILE.sex,
          deficit:       p.b || DEFAULT_PROFILE.deficit,
          activityLevel: p.l || DEFAULT_PROFILE.activityLevel,
        });
      }
    } catch {
      // Corrupted storage — fall through to defaults
    }

    // ── Load workout DB ───────────────────────────────────────────────────
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) setLocalDB(JSON.parse(raw) as LocalDB);
    } catch {
      // Corrupted storage — start with empty DB
    }

    // ── Default to week view on mobile ────────────────────────────────────
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setViewMode('week');
    }

    setIsLoaded(true);

    // ── Pull from cloud and merge (remote wins per day) ────────────────────
    // Fire-and-forget — failures are silent, localStorage is the fallback.
    pullFromCloud().then(remote => {
      if (!remote) return;

      if (remote.localDB && typeof remote.localDB === 'object') {
        const remoteDB = remote.localDB as Record<string, unknown>;
        setLocalDB(prev => ({ ...prev, ...remoteDB } as typeof prev));
        try {
          const merged = { ...JSON.parse(localStorage.getItem(DB_KEY) ?? '{}'), ...remoteDB };
          localStorage.setItem(DB_KEY, JSON.stringify(merged));
        } catch { /* storage full — skip */ }
      }

      if (remote.profile && typeof remote.profile === 'object') {
        const p = remote.profile as Record<string, string>;
        if (Object.keys(p).length > 0) {
          setProfileState({
            weight:        p.w || '180',
            height:        p.h || '70',
            age:           p.a || '29',
            sex:           (p.s as 'male' | 'female') || 'male',
            deficit:       p.b || '500',
            activityLevel: p.l || '1.45',
          });
          try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* noop */ }
        }
      }
      // Restore settings (profile photo, presets, plan, etc.)
      if (remote.settings && typeof remote.settings === 'object') {
        restoreSettings(remote.settings as Record<string, unknown>);
      }
    }).catch(() => { /* offline — no-op */ });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────────────────────

  /** setActiveDayFocus also keeps currentDisplayDate in sync. */
  const setActiveDayFocus = useCallback((dateStr: string) => {
    setActiveDayFocusRaw(dateStr);
    const [y, m, d] = dateStr.split('-').map(Number);
    setCurrentDisplayDate(new Date(y, m - 1, d));
  }, []);

  // Sync localDB to cloud on every change, but skip the very first render
  // (initial localStorage hydration + cloud pull shouldn't count as a user write).
  const syncSkipCountRef = useRef(2); // skip first 2 fires (mount + cloud-pull merge)
  useEffect(() => {
    if (syncSkipCountRef.current > 0) {
      syncSkipCountRef.current -= 1;
      return;
    }
    queueSync({ localDB: localDB as Record<string, unknown> });
  }, [localDB]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Merge a partial update into one day's record and immediately persist. */
  const updateDayRecord = useCallback(
    (dateStr: string, updates: Partial<DayRecord>) => {
      setLocalDB(prev => {
        const next = {
          ...prev,
          [dateStr]: { ...(prev[dateStr] ?? {}), ...updates },
        };
        try {
          localStorage.setItem(DB_KEY, JSON.stringify(next));
        } catch { /* storage quota exceeded */ }
        return next;
      });
    },
    []
  );

  /** Read a single day's record without triggering a re-render. */
  const getDayRecord = useCallback(
    (dateStr: string): DayRecord => localDB[dateStr] ?? {},
    [localDB]
  );

  /** Flush the current (or supplied) DB snapshot to localStorage + cloud. */
  const persistDB = useCallback(
    (db?: LocalDB) => {
      const target = db ?? localDB;
      try {
        localStorage.setItem(DB_KEY, JSON.stringify(target));
      } catch { /* storage quota exceeded */ }
      if (db) setLocalDB(db);
      // Queue a cloud sync — debounced 4 s, fire-and-forget
      queueSync({ localDB: target as Record<string, unknown> });
    },
    [localDB]
  );

  /** Persist profile — merges partial updates, writes to localStorage + cloud. */
  const persistProfile = useCallback(
    (updates: Partial<UserProfile>) => {
      setProfileState(prev => {
        const next = { ...prev, ...updates };
        const payload = {
          w: next.weight,
          h: next.height,
          a: next.age,
          s: next.sex,
          b: next.deficit,
          l: next.activityLevel,
        };
        try {
          localStorage.setItem(PROFILE_KEY, JSON.stringify(payload));
        } catch { /* storage quota exceeded */ }
        // Sync profile to cloud
        queueSync({ profile: payload });
        return next;
      });
    },
    []
  );

  // Convenience wrapper that accepts a partial UserProfile
  const setProfile = useCallback(
    (updates: Partial<UserProfile>) => persistProfile(updates),
    [persistProfile]
  );

  // ── Secondary-storage helpers (no React state — direct localStorage I/O) ──

  const getUsage = useCallback(
    (): Record<string, Record<string, number>> => {
      try {
        return JSON.parse(localStorage.getItem(USAGE_KEY) ?? '{}');
      } catch { return {}; }
    },
    []
  );

  const bumpUsage = useCallback((group: string, name: string) => {
    const u = (() => {
      try { return JSON.parse(localStorage.getItem(USAGE_KEY) ?? '{}'); } catch { return {}; }
    })();
    if (!u[group]) u[group] = {};
    u[group][name] = (u[group][name] ?? 0) + 1;
    try { localStorage.setItem(USAGE_KEY, JSON.stringify(u)); } catch { /* noop */ }
  }, []);

  const getTemplatePool = useCallback((): WorkoutTemplate[] => {
    try {
      return JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? 'null') ?? DEFAULT_TEMPLATES;
    } catch { return DEFAULT_TEMPLATES; }
  }, []);

  const saveTemplatePool = useCallback((pool: WorkoutTemplate[]) => {
    try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(pool)); } catch { /* noop */ }
  }, []);

  const getWorkoutPresets = useCallback((): WorkoutPreset[] => {
    try {
      return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]');
    } catch { return []; }
  }, []);

  const saveWorkoutPresets = useCallback((ps: WorkoutPreset[]) => {
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(ps)); } catch { /* noop */ }
  }, []);

  const getLastStreak = useCallback((): number => {
    return parseInt(localStorage.getItem(STREAK_KEY) ?? '-1', 10);
  }, []);

  const saveLastStreak = useCallback((n: number) => {
    try { localStorage.setItem(STREAK_KEY, String(n)); } catch { /* noop */ }
  }, []);

  const getLastKnownWeight = useCallback(
    (dateStr: string): string => {
      const hit = Object.keys(localDB)
        .filter(ds => ds <= dateStr && !!localDB[ds]?.weight)
        .sort((a, b) => b.localeCompare(a))[0];
      return hit ? String(localDB[hit].weight ?? '') : '';
    },
    [localDB]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // CONTEXT VALUE — memoised to prevent unnecessary re-renders in consumers
  // ─────────────────────────────────────────────────────────────────────────

  const value = useMemo<AppContextValue>(
    () => ({
      // ── Stable refs ─────────────────────────────────────────────────────
      today,
      todayStr,

      // ── React state ─────────────────────────────────────────────────────
      localDB,         setLocalDB,
      activeDayFocus,  setActiveDayFocus,
      currentDisplayDate, setCurrentDisplayDate,
      viewMode,        setViewMode,
      currentGroup,    setCurrentGroup,
      lastBurn,        setLastBurn,
      lastBudget,      setLastBudget,
      pendingSetsCount, setPendingSetsCount,
      pendingSetData,  setPendingSetData,
      profile,         setProfile,
      isLoaded,

      // ── Constants ────────────────────────────────────────────────────────
      months:           MONTHS,
      presets:          PRESETS,
      defaultTemplates: DEFAULT_TEMPLATES,

      // ── Actions ──────────────────────────────────────────────────────────
      updateDayRecord,
      getDayRecord,
      persistDB,
      persistProfile,

      // ── Secondary storage helpers ─────────────────────────────────────────
      getUsage,
      bumpUsage,
      getTemplatePool,
      saveTemplatePool,
      getWorkoutPresets,
      saveWorkoutPresets,
      getLastStreak,
      saveLastStreak,
      getLastKnownWeight,
    }),
    [
      today,
      localDB, activeDayFocus, currentDisplayDate,
      viewMode, currentGroup,
      lastBurn, lastBudget,
      pendingSetsCount, pendingSetData,
      profile, isLoaded,
      setActiveDayFocus, updateDayRecord, getDayRecord,
      persistDB, persistProfile, setProfile,
      getUsage, bumpUsage,
      getTemplatePool, saveTemplatePool,
      getWorkoutPresets, saveWorkoutPresets,
      getLastStreak, saveLastStreak,
      getLastKnownWeight,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useApp() — consume the global app context from any client component.
 *
 * @example
 * const { localDB, activeDayFocus, updateDayRecord } = useApp();
 */
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp() must be called inside <AppProvider>. Wrap your layout with it.');
  }
  return ctx;
}
