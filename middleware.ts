/**
 * middleware.ts
 *
 * Auth guard — runs on the Edge runtime before every matched request.
 * withAuth checks for a valid NextAuth JWT; absent → redirect to sign-in.
 *
 * ⚠️  PWA CRITICAL — the following must NEVER be intercepted:
 *   sw.js          Service worker must be reachable by the browser at all times.
 *                  If the SW registration fetch is redirected to the sign-in
 *                  page it will register the HTML as the worker script and
 *                  break caching entirely.
 *   manifest.json  Browser fetches this without cookies — redirect breaks
 *                  PWA install prompts and the "Add to Home Screen" flow.
 *   Que_logo.png   Icons referenced by the manifest must load unauthenticated.
 *
 * Protected:  /   /index.html  (all app pages)
 * Excluded:   see negative-lookahead in matcher below
 */
import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/auth/signin',
  },
});

export const config = {
  matcher: [
    '/((?!api/auth|auth/|_next/static|_next/image|favicon\\.ico|icon|apple-icon|manifest\\.json|sw\\.js|Que_logo\\.png|placeholder).*)',
  ],
};
