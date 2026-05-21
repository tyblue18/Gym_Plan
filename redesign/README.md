# QUE / Athlete OS — Redesign

A complete visual rewrite of the Que gym-tracking app. All logic, state, props,
hooks, refs, drag handlers, calculations and data bindings are preserved
exactly — only the visual layer was rebuilt.

## Design system

**Aesthetic**: sports telemetry meets racing dashboard. Single sharp accent,
oversized condensed numerals, technical mono labels, sharp 1px hairlines.

| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#07080A` | Page ink |
| `--bg-1` | `#0E0F12` | Primary panels |
| `--bg-2` | `#16181D` | Raised surfaces |
| `--bg-3` | `#1F2229` | Inputs / pressed |
| `--accent` | `#4FC3F7` | Ice blue — the *only* hue |
| `--positive` | `#6DFF99` | On-target |
| `--danger` | `#FF4D5E` | Over-budget |
| `--ink-0..3` | white→3F424A | Text scale |

**Fonts** (loaded via `next/font/google` in `layout.tsx`):
- **Anton** — display / large telemetry numerals
- **Space Grotesk** — UI body
- **JetBrains Mono** — labels, telemetry strings

## File map

```
app/
  layout.tsx        ← loads 3 fonts via next/font, sets theme #07080A
  page.tsx          ← shell unchanged, just inherits new tokens
  globals.css       ← full token system + primitives (.que-card, .que-input…)

components/
  header.tsx                ← AuthHeader rebuilt (sharp pill, lime CTA)
  AmbientGlow.tsx           ← lime/cool palette, same state machine
  CalendarScheduler.tsx     ← Anton day numerals, lime selection
  MetricsDashboard.tsx      ← oversized budget number, telemetry math strip
  WorkoutLogger.tsx         ← sharp set table, lime LOG button
  GlowMount.tsx             ← unchanged
  auth-provider.tsx         ← unchanged
  sw-register.tsx           ← unchanged
  theme-provider.tsx        ← unchanged

lib/
  AppContext.tsx            ← unchanged (all storage logic intact)

postcss.config.mjs          ← unchanged
```

## What changed vs. what didn't

✅ Changed: every JSX `className`, every inline style, every color, every
font reference, every spacing/sizing token, every transition.

🔒 Preserved EXACTLY:
- `useApp`, `useSession`, `useSpotlightBorder` consumption
- All state hooks (`useState`, `useEffect`, `useMemo`, `useCallback`, refs)
- Mifflin-St Jeor BMR / TDEE / MET calculations
- localStorage keys & serialization formats
- Drag-scroll for muscle pills
- Enter-key auto-advance in set inputs
- Recurring workout matching by day-of-week
- Template pool, workout presets, usage tracking
- Canvas chart math (weight projection, trends)

## Drop-in instructions

1. Copy `redesign/app/*` → `app/`
2. Copy `redesign/components/*` → `components/`
3. Copy `redesign/lib/AppContext.tsx` → `lib/AppContext.tsx`
4. Restart dev server. Fonts load automatically.

No `package.json` changes required — `Anton`, `Space_Grotesk` and
`JetBrains_Mono` are all part of `next/font/google`.
