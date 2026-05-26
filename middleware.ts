/**
 * middleware.ts
 *
 * Routing rules — runs on the Edge runtime before every matched request.
 *
 * /              → public landing page; authenticated users are redirected to /app
 * /app/*         → protected; unauthenticated users are sent to /auth/signin
 * /profile/*     → public read-only profiles; no auth required
 *
 * ⚠️  PWA CRITICAL — the following must NEVER be intercepted:
 *   sw.js          Service worker must be reachable by the browser at all times.
 *   manifest.json  Browser fetches this without cookies.
 *   Que_logo.png   Icons referenced by the manifest must load unauthenticated.
 */
import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;

  // Authenticated users hitting the landing page → skip it, go straight to the app
  if (pathname === '/' && token) {
    return NextResponse.redirect(new URL('/app', req.url));
  }

  // /app routes are protected — send unauthenticated users to sign-in
  if (pathname.startsWith('/app') && !token) {
    const signInUrl = new URL('/auth/signin', req.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api/auth|api/admin|auth/|_next/static|_next/image|favicon\\.ico|icon|apple-icon|manifest\\.json|sw\\.js|Que_logo\\.png|placeholder).*)',
  ],
};
