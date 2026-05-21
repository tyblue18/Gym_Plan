/**
 * app/page.tsx — Application Shell  (Server Component)
 *
 * Architecture: two-layer separation of concerns
 * ┌─────────────────────────────────────────────────────┐
 * │  AuthHeader  (Client Component — reads useSession)  │  ← 48 px
 * ├─────────────────────────────────────────────────────┤
 * │                                                     │
 * │   <iframe src="/index.html">                        │
 * │   Full workout app — Calendar, Lifting, Cardio,     │
 * │   Metrics, Protocol.  All JS state, localStorage    │
 * │   reads/writes, and biometric calculations are      │
 * │   completely untouched inside this iframe.          │
 * │                                                     │
 * │   localStorage is SAME-ORIGIN (localhost:3000),     │
 * │   so data persists identically whether the user     │
 * │   is signed in or not — offline-first guarantee.   │
 * │                                                     │
 * └─────────────────────────────────────────────────────┘
 *
 * When unauthenticated the workout app works exactly as before;
 * auth adds an identity layer on top without gating any feature.
 */

import { AuthHeader } from '@/components/header';

export default function WorkoutPage() {
  return (
    <div className="app-shell">

      {/* ── Auth layer ───────────────────────────────────────────────── */}
      {/*
       * AuthHeader is a Client Component that consumes SessionProvider
       * (injected by AuthProvider in app/layout.tsx).
       * Renders: skeleton → SignIn button → User pill, depending on state.
       */}
      <AuthHeader />

      {/* ── Workout app layer ─────────────────────────────────────────── */}
      <main className="app-frame-container">
        <iframe
          src="/index.html"
          className="app-frame"
          title="Que — Training &amp; Calorie Log"
          /**
           * Security: allow-scripts + allow-same-origin lets the workout app
           * run its JS and access localStorage on the same origin.
           * allow-forms permits the inline form inputs (sets/reps/weight).
           * Omitting allow-top-navigation prevents the iframe from
           * redirecting the parent window.
           */
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </main>

    </div>
  );
}
