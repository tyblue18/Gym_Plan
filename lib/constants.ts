/**
 * lib/constants.ts
 *
 * App-wide constants — values that MUST agree across client and server, or
 * are referenced from many places where a typo would silently break sync.
 *
 * Don't put logic here. Functions live in lib/calorie-utils.ts, lib/storage.ts,
 * lib/syncEngine.ts, etc.
 */

// ── Calorie goal tolerance ───────────────────────────────────────────────────
// kcal window around the daily budget that counts as "hitting the goal".
// Used by the client streak UI, the server coin engine, the server badge
// engine, and the weekly recap cron — drifting any one of them silently
// awards (or fails to award) coins/badges. Single source of truth.
export const GOAL_TOLERANCE = 100;

// ── localStorage key namespace ───────────────────────────────────────────────
// These names are baked into users' browser storage; renaming any of them is
// a breaking change that requires a migration step. Centralized here so a
// typo can't silently create a separate key.

// Core workout / food / metrics log + BMR profile
// (legacy "ironman" prefix retained for backward compat with existing users)
export const DB_KEY            = 'ironmanCoreDB_v2';
export const PROFILE_KEY       = 'ironmanProfileSettings_v2';
export const TEMPLATES_KEY     = 'ironmanTemplatesPool';

// Coins / goals / streaks / PRs
export const COIN_KEY          = 'queCalorieCoins';
export const MACRO_GOALS_KEY   = 'queMacroGoals';
export const LAST_STREAK_KEY   = 'queLastStreak';
export const LIFT_PRS_KEY      = 'queLiftPRs';
export const MILLION_GROUPS_KEY = 'queMillionGroups';

// Plan / presets / usage
export const ATHLETE_PLAN_KEY   = 'queAthletePlan';
export const WORKOUT_PRESETS_KEY = 'queWorkoutPresets';
export const EXERCISE_USAGE_KEY  = 'queExerciseUsage';

// UI preferences
export const PROFILE_PHOTO_KEY = 'queProfilePhoto';
export const ACCENT_KEY        = 'queAccentColor';
export const BG_KEY            = 'queBgPreset';
export const LIGHT_BG_KEY      = 'queLightBgPreset';
export const THEME_KEY         = 'queTheme';

// Misc client state (single-use today, centralized so they're discoverable)
export const SHOWN_BADGES_KEY   = 'queShownBadgePopups';
export const WEIGHT_PROMPT_KEY  = 'queWeightPromptDate';
export const SOCIAL_ANIM_KEY    = 'queSocialAnimIdx';
export const COINS_MIGRATED_KEY = 'queCoinsMigrated';
