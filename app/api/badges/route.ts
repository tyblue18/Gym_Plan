/**
 * GET /api/badges          — own badges
 * GET /api/badges?userId=x — a friend's badges (friendship required)
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';
import { getUserBadges }    from '@/lib/badgeEngine';

export async function GET(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json(null, { status: 401 });

  const me = await prisma.appUser.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json(null, { status: 404 });

  const targetId = new URL(req.url).searchParams.get('userId');

  // Own badges
  if (!targetId || targetId === me.id) {
    const badges = await getUserBadges(me.id);
    return NextResponse.json({ badges });
  }

  // Friend's badges — verify friendship first
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'accepted',
      OR: [
        { requesterId: me.id, receiverId: targetId },
        { requesterId: targetId, receiverId: me.id },
      ],
    },
  });
  if (!friendship) return NextResponse.json({ error: 'Not friends' }, { status: 403 });

  const badges = await getUserBadges(targetId);
  return NextResponse.json({ badges });
}
