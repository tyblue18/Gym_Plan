# Que

A mobile-first PWA for personal training, nutrition tracking, and friend-vs-friend fitness challenges.

**Live:** <!-- [TODO: add deployed URL, e.g. https://que.example.com] -->

> The deployed app opens to a public landing page with a PWA install prompt. Signed-in users land on the authenticated dashboard at `/app`: a tab shell that hosts the calendar, calorie tracker, metrics, workout protocol, and social tabs. Anyone with the link can view a user's public profile and badge showcase at `/profile/<username>`.

<!-- [TODO: add screenshot of /app dashboard at 1200x800 to docs/screenshot.png and reference it here] -->

## Why this exists

Que is a single-athlete training OS built to consolidate workout logging, calorie tracking, and weight-management projections into one offline-first app that works at the gym, in the kitchen, and on the trail without depending on a network. It grew into a multi-device social platform with typed friendship battles, server-side badge evaluation, cardio-aware cut/bulk plan projections, and a Jack-Daniels VDOT running plan generator. The goal is a working personal trainer in your pocket without the noise of mainstream fitness apps: no ads, no upsells, no engagement-bait notifications.

## Tech stack

| Layer                | Choice                                                          |
| -------------------- | --------------------------------------------------------------- |
| Framework            | Next.js 15 (App Router) on Node 20                              |
| Language             | TypeScript 5.7                                                  |
| UI                   | React 19, Tailwind CSS v4, Radix primitives                     |
| State                | Custom React Context with `localStorage` as source of truth     |
| Database             | PostgreSQL via Prisma 5 (Neon)                                  |
| Auth                 | NextAuth 4 (GitHub and Google OAuth, JWT sessions)              |
| Hosting              | Vercel (serverless functions + 5 cron jobs + Edge analytics)    |
| Rate limiting        | Upstash Redis (per-user fixed-window)                           |
| File storage         | Vercel Blob (profile photos)                                    |
| Push                 | Web Push API with VAPID                                         |
| Health integration   | Google Fit OAuth (steps)                                        |
| Telemetry            | `@vercel/analytics` page views + typed `trackEvent()` wrapper   |
| Error tracking       | In-house reporter to `/api/log/error`, surfaced in Vercel logs  |
| Animation            | Framer Motion and Lottie                                        |
| Charts               | Recharts plus raw canvas for perf-critical plan charts          |
| Barcode scanning     | `@zxing/browser` with `BarcodeDetector` fallback                |

## Architecture overview

```
Browser (localStorage, Service Worker)
        ↕  debounced sync (4 s)
Next.js App Router (/ landing, /app dashboard, /profile/[username])
        ↕  JWT auth via NextAuth
Next.js API Routes
        ↕  Prisma
PostgreSQL (Neon)
```

**Offline-first with newer-wins conflict resolution.** `localStorage` is the authoritative source for the active session. Every edit through `updateDayRecord()` stamps the day with an `_editedAt` ISO timestamp and queues a debounced push (4 s) to `/api/sync`. The server and the pull-merge both pick the higher `_editedAt` per day, which is what makes multi-device usage safe: if a phone edits Monday at 10:01 and a laptop edits the same day at 10:30 before pulling, the laptop edit wins on the next sync instead of being silently rejected as a stale write. The client surfaces every server-side conflict through a `que-conflict` event that drives a bottom toast, so the user always understands when their local copy was overwritten.

**Two-layer badge engine.** Badges are evaluated server-authoritative on every `POST /api/sync`. Each badge has a check function in `lib/badgeEngine.ts` and a display entry in `lib/badgeCatalog.ts`; the DB enforces `@@unique [userId, slug]` so the award path is idempotent and safe to call from multiple code paths (sync, challenge resolution, manual cleanup). The client runs an optimistic detection layer for instant celebration popups, using `localStorage` (`queShownBadgePopups`) to dedupe popups across refreshes. When the server confirms via a `que-badge-earned` event, the client filters out anything already shown locally so the user never sees the same badge twice.

**Typed battle resolution with atomic guards.** Friendship battles let two users compete on stat categories (steps, run miles, lift volume, protein, etc.) over a measurement window. Each category has a pure `score(rows)` function in `lib/battle-categories.ts`; the resolver in `lib/battleEngine.ts` loads both users' `DayRecord` rows in parallel, scores each category, and writes the resolution inside a Prisma `$transaction`. Coin transfers use `updateMany` with a `status: 'active'` guard so a concurrent retry or a backfilled cron sweep cannot double-pay. Acceptance enforces a `balance < 0` check on the wager debit and throws to roll back the whole transaction if either side would overdraft.

**Service worker update flow.** The SW registers on every page load and polls for updates every 60 seconds. When a fresh SW reaches the `installed` state with an existing controller (a real update, not a first install), `sw-register.tsx` reveals an in-app "New version ready, Update" prompt. The SW does not call `skipWaiting()` on its own; the client posts `{ type: 'SKIP_WAITING' }` only after the user clicks update, then reloads on `controllerchange`. This prevents the common PWA failure mode where a tab silently picks up new JS mid-session and crashes on a stale React tree.

## Key systems

### Sync engine (`lib/syncEngine.ts`, `app/api/sync/route.ts`)
Debounced `queueSync()` accumulates dirty days and pushes them with a fresh settings snapshot. The POST handler compares incoming `_editedAt` against the stored row, returns rejected writes as `conflicts: [{ date, data }]`, and writes accepted upserts in parallel. The GET handler returns each day with `_syncedAt` so the client can detect staleness on the next push.

### Badge engine (`lib/badgeEngine.ts`, `lib/badgeCatalog.ts`)
60+ badges across lift, cardio, and nutrition categories. `checkAndAwardBadges(userId, settings)` loads the user's full DayRecord history plus their resolved-battle win count, runs every `check()` function, and writes new badges with `skipDuplicates`. Lift and cardio badges are revoked on data correction; nutrition and battle-win badges are permanent.

### Plan engine (`lib/metricsTypes.ts`, `components/metrics/MetricsModals.tsx`)
Cut and bulk plans with cardio-adjusted projections. `getEffectiveDailyKcal(plan)` accounts for the 40% of cardio burn that is not eaten back, `getPlanBaseline(plan, localDB)` resolves the true starting weight from the first in-window weigh-in, and `getPlanCompliance(plan, localDB, profile)` walks each logged day and computes real caloric balance versus true maintenance. Bulk plans persist their surplus as a negative `profile.deficit` so the single budget formula handles both directions without branching.

### Food search (`app/api/food/search/route.ts`)
Dual-source: USDA FoodData Central primary, Open Food Facts fallback. Results are normalized to one shape and run through a plausibility check (kcal range, macro sum sanity). Barcode scanning uses ZXing with a `BarcodeDetector` race fallback for browsers that support it natively. The food picker surfaces a Recents and Frequents tab in the empty search state, backed by a 200-entry LRU in `lib/foodUsage.ts`.

### Battle resolution (`lib/battleEngine.ts`, `lib/battle-categories.ts`, `app/api/cron/resolve-battles/route.ts`)
A 03:00 UTC cron sweeps every `status: 'active'` battle whose `endDate` is in the past, calls `resolveBattle(id)`, transfers the pot atomically, awards battle-count badges via `awardBadgesForUser(winnerId)`, and queues the awarded badges in Redis so the user's next sync drains them and fires the in-app celebration popup. The same flow runs inline when a typed-window battle is accepted past its end date.

### Google Fit integration (`app/api/health/google-fit/*`)
OAuth flow stores tokens in `HealthConnection`. Every step fetch checks the access token expiry with a 60 s buffer and refreshes inline. The `sync-steps` cron writes daily step counts into every connected user's `DayRecord` at 02:00 UTC.

### Push notifications (`lib/push.ts`, `app/api/cron/*`)
Web Push with VAPID. Five cron-triggered pushes cover the weigh-in reminder, daily nudge, weekly recap, step sync, and battle resolution outcomes. Subscriptions are stored per-user with the endpoint as the dedup key; failed deliveries are caught and dropped without bubbling.

### Error tracking (`lib/errorReporter.ts`, `components/ErrorBoundary.tsx`, `app/api/log/error/route.ts`)
Each tab in `/app` wraps its content in an `<ErrorBoundary>` so a single crash isolates to that subtree. The reporter dedupes errors within a 5 s window, caps at 50 per session, and POSTs with `keepalive: true` to a rate-limited sink that logs structured JSON to Vercel function logs. Designed so a Sentry or Bugsnag SDK can replace the reporter without changing call sites.

### Telemetry (`lib/telemetry.ts`)
Typed `trackEvent()` wrapper over `@vercel/analytics`. The full event catalog lives in one TypeScript union so call sites cannot send untyped strings. Events cover food search behavior, lift logging, plan creation, battle outcomes, and data export.

## Getting started

### Prerequisites

- Node 20 or newer
- A PostgreSQL database (Neon, Supabase, or local)
- An Upstash Redis instance (rate limiting and Redis-backed badge queue)

### Setup

```bash
git clone <repo-url>
cd <repo-name>
npm install

# Create .env.local with the variables listed below

npx prisma migrate dev            # initial schema migration
npm run dev                       # starts on http://localhost:3000
```

For OAuth sign-in to work locally you need GitHub and Google OAuth apps with `http://localhost:3000/api/auth/callback/<provider>` registered as the redirect URI.

### Environment variables

| Variable                                            | Purpose                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`                                      | Postgres connection string (pooled)                                    |
| `DIRECT_URL`                                        | Postgres direct URL (for migrations and read-after-write)              |
| `NEXTAUTH_SECRET`                                   | NextAuth JWT signing secret (`openssl rand -base64 32`)                |
| `NEXTAUTH_URL`                                      | Canonical app URL for OAuth callbacks                                  |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`          | GitHub OAuth app credentials                                           |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`          | Google OAuth app credentials                                           |
| `GOOGLE_FIT_CLIENT_ID`, `GOOGLE_FIT_CLIENT_SECRET`  | Optional override for Fit-specific OAuth credentials                   |
| `USDA_API_KEY`                                      | USDA FoodData Central API key (falls back to `DEMO_KEY`, 30 req/hr)    |
| `CRON_SECRET`                                       | Bearer token Vercel sends to all cron routes                           |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN`              | Upstash Redis (pending-badge queue, error rate limit)                  |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`| Same Upstash instance, aliased for the `@upstash/ratelimit` library    |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`                      | VAPID public key for web push                                          |
| `VAPID_PRIVATE_KEY`                                 | VAPID private key (server only)                                        |
| `BLOB_READ_WRITE_TOKEN`                             | Vercel Blob token for profile photo storage                            |

### Scripts

| Command         | What it does                                                |
| --------------- | ----------------------------------------------------------- |
| `npm run dev`   | Start the Next.js dev server                                |
| `npm run build` | Generate Prisma client and produce a production build       |
| `npm start`     | Start the production server (run after `npm run build`)     |
| `npm run lint`  | Run ESLint across the repo                                  |

## Project structure

```
app/
  app/                       Authenticated dashboard (5 tabs, each in its own ErrorBoundary)
  profile/[username]/        Public read-only profile pages with per-user OG images
  api/
    sync/                    GET pull, POST push with _editedAt conflict resolution
    badges/                  GET earned badges; admin re-evaluation
    challenges/              Battle create, accept, decline, resolve
    food/search/             USDA + Open Food Facts dual-source search
    health/google-fit/       OAuth flow, token refresh, step fetch
    cron/                    5 scheduled jobs (steps, battle resolution, push reminders)
    log/error/               Client error sink, rate-limited
  layout.tsx                 Root layout, providers, fonts, PWA meta
  page.tsx                   Public landing page

lib/
  AppContext.tsx             Global React context; localStorage I/O; _editedAt stamping
  syncEngine.ts              Debounced cloud sync and pull-merge
  badgeEngine.ts             Server-side badge evaluation and revocation
  badgeCatalog.ts            Client-accessible badge display catalog
  battleEngine.ts            Typed battle resolution (pure compute + transactional commit)
  battle-categories.ts       Registry of every typed-battle category with a pure score function
  coinEngine.ts              Server-side calorie coin awards
  metricsTypes.ts            Plan engine: budget metrics, baseline, compliance
  metricsCharts.ts           Canvas chart helpers
  errorReporter.ts           Client error reporter with dedupe and keepalive POST
  telemetry.ts               Typed trackEvent() wrapper over @vercel/analytics
  foodUsage.ts               LRU tracker powering food picker Recents/Frequents
  dataExport.ts              Full JSON snapshot of every export-relevant localStorage key
  push.ts, ratelimit.ts, prisma.ts, validators.ts, auth.ts, calorie-utils.ts, storage.ts, ...
  running/                   VDOT-based training plan generator (Jack Daniels methodology)

components/
  WorkoutLogger.tsx          Lift and cardio entry, outlier guards, rest timer, 1RM estimator
  CalorieTracker.tsx         Meal sections, food picker, macros, copy-yesterday shortcut
  MetricsDashboard.tsx       Charts, plan tile, data export
  CalendarScheduler.tsx      Month/week/day calendar with workout indicators
  SocialTab.tsx              Friends, classic + typed battles, profile cards
  ProfileCard.tsx            Public profile + drag-and-drop badge showcase
  ErrorBoundary.tsx          Per-tab error isolation
  ConflictToast.tsx          Surfaces multi-device sync conflicts
  sw-register.tsx            Service worker registration + "New version" update prompt
  AutoCropImage.tsx          Badge background removal with LRU cache and IntersectionObserver
  calorie/, metrics/, workout/, running/, landing/    Feature-scoped subcomponents

prisma/
  schema.prisma              10 models: AppUser, WorkoutData, DayRecord, Badge, Challenge, ...

public/
  sw.js                      Service worker (network-first JS, cache-first assets, SKIP_WAITING)
  Badges/                    Achievement badge images
  manifest.json              PWA manifest
```

## Notable engineering details

**Per-day newer-wins sync conflict resolution.** Every `updateDayRecord` stamps `_editedAt = new Date().toISOString()` on the day before persisting. The server POST compares incoming `_editedAt` against the stored row's `_editedAt`, accepts the newer write, and returns the older one in a `conflicts` array that the client writes back to `localStorage`. The pull-merge on the client does the same comparison, with ties broken toward remote so cron-side writes (Google Fit steps) still propagate. This replaces the naive "last device to sync wins" model that drops real edits made on slower-syncing devices.

**Atomic challenge wager deduction.** Battle acceptance debits the challengee's wager inside a Prisma `$transaction`. The transaction reads the wallet balance after the decrement and throws `INSUFFICIENT_FUNDS` if it would go negative, rolling back the whole flow. Resolution uses `updateMany` with a `where: { status: 'active' }` guard so a concurrent retry or a backfilled cron sweep cannot double-pay the winner. Coin transactions are append-only with a `reason` enum, so the wallet history is fully auditable.

**`AutoCropImage` with IntersectionObserver and LRU cache.** Badge PNGs from third-party sources have colored backgrounds, so the component does a corner-sampled flood fill on first render to produce a transparent crop. The cropped data URL is cached in `localStorage` (LRU-bounded at 100 entries) and a module-level `Map`, so subsequent mounts of the same badge are O(1). The initial mount waits for an `IntersectionObserver` to fire (200 px rootMargin) before doing the canvas work, so a 50-badge showcase grid does not block the main thread on open.

## Roadmap and known limitations

- No automated test suite. Manual smoke testing only.
- Plan history is single-active: switching plans overwrites the previous one.
- Sync merge is per-day, not per-field. If two devices edit different fields of the same day independently, the newer-edited day wins entirely and the other device's field is lost.
- Onboarding does not ask for plan intent, so the default `profile.deficit = 500` may not match user goals until they open the plan modal.
- No reduced-motion accessibility audit; viewport is locked (`maximumScale: 1`).
- The fallback error reporter writes to Vercel function logs only; production deployments would benefit from a Sentry or Bugsnag SDK at the reporter boundary.

## License

TBD. <!-- [TODO: confirm license choice (MIT recommended) and add a LICENSE file at the repo root] -->

## Author

Tanishq Somani.
