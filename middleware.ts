/**
 * middleware.ts
 *
 * Runs on the Edge runtime before every matched request.
 * withAuth checks for a valid NextAuth JWT cookie; if absent it
 * redirects to the custom sign-in page defined in `pages.signIn`.
 *
 * Protected:   /          (the workout shell)
 *              /index.html (iframe src — same-origin auth cookie is sent)
 *
 * Excluded:    /api/auth/* — NextAuth handlers must stay public
 *              /auth/*     — sign-in page itself (would cause redirect loop)
 *              /_next/*    — Next.js compiled assets
 *              favicon / icons / manifest
 */
import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/auth/signin',
  },
});

export const config = {
  matcher: [
    /*
     * Negative lookahead: skip anything that starts with the paths below.
     * Everything else (including / and /index.html) is protected.
     */
    '/((?!api/auth|auth/|_next/static|_next/image|favicon\\.ico|icon|apple-icon|manifest\\.json|placeholder).*)',
  ],
};
