/**
 * GET /api/health/google-fit/callback?code=...
 *
 * Handles the OAuth redirect from Google after user grants Fitness access.
 * Exchanges the authorization code for access + refresh tokens and stores
 * them in the HealthConnection table, then redirects back to the app.
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';

export async function GET(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/?error=not_authenticated`);
  }

  const { searchParams } = new URL(req.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/?error=google_fit_denied`);
  }

  const clientId     = process.env.GOOGLE_FIT_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri  = `${process.env.NEXTAUTH_URL}/api/health/google-fit/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     clientId!,
      client_secret: clientSecret!,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    console.error('[google-fit] token exchange failed', await tokenRes.text());
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/?error=google_fit_token`);
  }

  const tokens = await tokenRes.json() as {
    access_token:  string;
    refresh_token?: string;
    expires_in:    number;
    scope:         string;
  };

  await prisma.healthConnection.upsert({
    where:  { userId: session.user.id },
    create: {
      userId:              session.user.id,
      googleAccessToken:   tokens.access_token,
      googleRefreshToken:  tokens.refresh_token ?? null,
      googleExpiresAt:     new Date(Date.now() + tokens.expires_in * 1000),
      googleScope:         tokens.scope,
    },
    update: {
      googleAccessToken:  tokens.access_token,
      googleExpiresAt:    new Date(Date.now() + tokens.expires_in * 1000),
      googleScope:        tokens.scope,
      // Only overwrite refresh_token if Google returned a new one
      ...(tokens.refresh_token && { googleRefreshToken: tokens.refresh_token }),
    },
  });

  return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/?fit=connected`);
}
