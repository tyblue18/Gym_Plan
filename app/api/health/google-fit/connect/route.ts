/**
 * GET /api/health/google-fit/connect
 *
 * Redirects the signed-in user to Google's OAuth consent screen
 * requesting the Fitness read scope.
 *
 * Requires env vars:
 *   GOOGLE_FIT_CLIENT_ID     — can reuse GOOGLE_CLIENT_ID if scope was
 *   GOOGLE_FIT_CLIENT_SECRET    added to the same OAuth client
 *   NEXTAUTH_URL             — for the callback redirect URI
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';

const FIT_SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
].join(' ');

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const clientId    = process.env.GOOGLE_FIT_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.NEXTAUTH_URL}/api/health/google-fit/callback`;

  if (!clientId) {
    return NextResponse.json(
      { error: 'GOOGLE_FIT_CLIENT_ID not configured' },
      { status: 500 }
    );
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id',     clientId);
  url.searchParams.set('redirect_uri',  redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope',         FIT_SCOPES);
  url.searchParams.set('access_type',   'offline');   // get refresh token
  url.searchParams.set('prompt',        'consent');   // force refresh token each time

  return NextResponse.redirect(url.toString());
}
