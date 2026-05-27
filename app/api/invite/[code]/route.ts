/**
 * GET /api/invite/[code] — PUBLIC. Returns the minimal inviter info needed to
 * render the "X invited you to Que" banner on the landing page. No auth: the
 * same fields are already public on /profile/[username]. Returns null if the
 * code isn't a valid username or no such user exists.
 */

import { NextResponse }       from 'next/server';
import { prisma }             from '@/lib/prisma';
import { normalizeInviteCode } from '@/lib/invite';
import { PROFILE_PHOTO_KEY }  from '@/lib/constants';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code: raw } = await params;
  const code = normalizeInviteCode(raw);
  if (!code) return NextResponse.json(null);

  const user = await prisma.appUser.findUnique({
    where:  { username: code },
    select: {
      name: true, username: true,
      badges: { select: { id: true } },
      workoutData: { select: { settings: true } },
    },
  });
  if (!user) return NextResponse.json(null);

  const settings = (user.workoutData?.settings ?? {}) as Record<string, unknown>;
  const photo    = typeof settings[PROFILE_PHOTO_KEY] === 'string' ? (settings[PROFILE_PHOTO_KEY] as string) : null;

  return NextResponse.json({
    name:       user.name,
    username:   user.username,
    photo,
    badgeCount: user.badges.length,
  });
}
