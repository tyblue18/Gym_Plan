/**
 * GET /api/health/google-fit/steps?date=YYYY-MM-DD
 *
 * Returns step count for the requested date (defaults to today).
 * Automatically refreshes the access token when it's expired.
 *
 * Response: { steps: number, date: string, source: "google_fit" }
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';

// ─────────────────────────────────────────────────────────────────────────────
// Token refresh
// ─────────────────────────────────────────────────────────────────────────────

async function refreshAccessToken(conn: {
  googleRefreshToken: string | null;
  userId: string;
}): Promise<string | null> {
  if (!conn.googleRefreshToken) return null;

  const clientId     = process.env.GOOGLE_FIT_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: conn.googleRefreshToken,
      client_id:     clientId!,
      client_secret: clientSecret!,
      grant_type:    'refresh_token',
    }),
  });

  if (!res.ok) return null;

  const data = await res.json() as { access_token: string; expires_in: number };
  await prisma.healthConnection.update({
    where:  { userId: conn.userId },
    data:   {
      googleAccessToken: data.access_token,
      googleExpiresAt:   new Date(Date.now() + data.expires_in * 1000),
    },
  });

  return data.access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step fetch
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);

  const conn = await prisma.healthConnection.findUnique({
    where: { userId: session.user.id },
  });

  if (!conn?.googleAccessToken) {
    return NextResponse.json({ error: 'Google Fit not connected' }, { status: 404 });
  }

  let token = conn.googleAccessToken;

  // Refresh if expired (with 60 s buffer)
  const expiry = conn.googleExpiresAt;
  if (expiry && expiry.getTime() < Date.now() + 60_000) {
    const refreshed = await refreshAccessToken({
      googleRefreshToken: conn.googleRefreshToken,
      userId:             session.user.id,
    });
    if (!refreshed) {
      return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
    }
    token = refreshed;
  }

  // Build time range for the requested date (midnight → midnight in ms)
  const dayStart = new Date(`${dateStr}T00:00:00`).getTime();
  const dayEnd   = dayStart + 86_400_000;

  const fitRes = await fetch(
    'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        aggregateBy:  [{ dataTypeName: 'com.google.step_count.delta' }],
        bucketByTime: { durationMillis: 86_400_000 },
        startTimeMillis: String(dayStart),
        endTimeMillis:   String(dayEnd),
      }),
    }
  );

  if (!fitRes.ok) {
    return NextResponse.json({ error: 'Google Fit API error' }, { status: 502 });
  }

  const data = await fitRes.json() as {
    bucket: Array<{
      dataset: Array<{
        point: Array<{ value: Array<{ intVal?: number }> }>;
      }>;
    }>;
  };

  const steps = data.bucket?.[0]?.dataset?.[0]?.point?.reduce(
    (sum, pt) => sum + (pt.value?.[0]?.intVal ?? 0),
    0
  ) ?? 0;

  return NextResponse.json({ steps, date: dateStr, source: 'google_fit' });
}
