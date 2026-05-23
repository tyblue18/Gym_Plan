/**
 * GET /api/health/token
 *
 * Returns the authenticated user's personal step-sync API token,
 * generating and persisting one if it doesn't yet exist.
 *
 * Response: { token: string, endpoint: string }
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const userId = session.user.id;
  const wd = await prisma.workoutData.findUnique({ where: { userId } });
  const settings = (wd?.settings ?? {}) as Record<string, unknown>;
  let token = settings.stepApiToken as string | undefined;

  if (!token) {
    token = generateToken();
    await prisma.workoutData.upsert({
      where:  { userId },
      create: { userId, settings: { ...settings, stepApiToken: token } },
      update: { settings: { ...settings, stepApiToken: token } },
    });
  }

  const base = process.env.NEXTAUTH_URL ?? '';
  return NextResponse.json({ token, endpoint: `${base}/api/health/steps` });
}
