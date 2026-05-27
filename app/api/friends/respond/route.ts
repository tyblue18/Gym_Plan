/**
 * POST /api/friends/respond
 * Body: { friendshipId: string, accept: boolean }
 * Only the receiver of a pending request can call this.
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';
import { sendPushToUser }   from '@/lib/push';
import { friendLimit }      from '@/lib/ratelimit';
import { friendRespondSchema } from '@/lib/validators';

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const { success } = await friendLimit.limit(session.user.id);
  if (!success) return NextResponse.json({ error: 'Too many requests — slow down' }, { status: 429 });

  const parsed = friendRespondSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'friendshipId and accept required' }, { status: 400 });
  const { friendshipId, accept } = parsed.data;

  const me = { id: session.user.id };

  const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!friendship || friendship.receiverId !== me.id || friendship.status !== 'pending') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.friendship.update({
    where: { id: friendshipId },
    data:  { status: accept ? 'accepted' : 'rejected' },
  });

  if (accept) {
    const accepter = await prisma.appUser.findUnique({
      where:  { id: me.id },
      select: { name: true, username: true },
    });
    sendPushToUser(friendship.requesterId, {
      title: 'Friend request accepted',
      body:  `${accepter?.name ?? accepter?.username ?? 'Someone'} accepted your friend request`,
      url:   '/',
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
