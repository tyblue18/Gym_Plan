/**
 * app/page.tsx — Application Shell (Server Component)
 *
 * Two-layer architecture preserved exactly:
 *   AuthHeader (52px) + iframe(/index.html) — workout app untouched inside.
 *   localStorage is same-origin so all persistence works identically.
 */

import { AuthHeader } from '@/components/header';

export default function WorkoutPage() {
  return (
    <div className="app-shell">
      <AuthHeader />

      <main className="app-frame-container">
        <iframe
          src="/index.html"
          className="app-frame"
          title="Que — Training &amp; Calorie Log"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </main>
    </div>
  );
}
