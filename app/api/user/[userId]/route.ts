/**
 * GET /api/user/[userId] — public profile of a friend
 * Requires the requesting user to be friends with the target.
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<NextResponse> {
  const { userId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json(null, { status: 401 });

  const me = await prisma.appUser.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json(null, { status: 404 });

  // Verify friendship (or own profile)
  if (userId !== me.id) {
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: me.id, receiverId: userId },
          { requesterId: userId, receiverId: me.id },
        ],
      },
    });
    if (!friendship) return NextResponse.json({ error: 'Not friends' }, { status: 403 });
  }

  const user = await prisma.appUser.findUnique({
    where:   { id: userId },
    include: {
      badges:      { orderBy: { earnedAt: 'desc' } },
      workoutData: { select: { settings: true } },
      coinWallet:  { select: { balance: true } },
    },
  });
  if (!user) return NextResponse.json(null, { status: 404 });

  const statusActive = !user.statusExpiresAt || user.statusExpiresAt > new Date();
  const settings = (user.workoutData?.settings ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    id:              user.id,
    name:            user.name,
    username:        user.username,
    status:          statusActive ? user.status : null,
    statusExpiresAt: statusActive ? user.statusExpiresAt?.toISOString() ?? null : null,
    showcaseBadges:  (user.showcaseBadges as string[] | null) ?? [],
    badges:          user.badges,
    badgeCount:      user.badges.length,
    profilePhoto:    (settings['queProfilePhoto'] as string | undefined) ?? null,
    coinBalance:     user.coinWallet?.balance ?? 0,
  });
}
