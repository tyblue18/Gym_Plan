/**
 * POST /api/friends/respond
 * Body: { friendshipId: string, accept: boolean }
 * Only the receiver of a pending request can call this.
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const { friendshipId, accept } = await req.json() as {
    friendshipId?: string;
    accept?: boolean;
  };
  if (!friendshipId) return NextResponse.json({ error: 'friendshipId required' }, { status: 400 });

  const me = { id: session.user.id };

  const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!friendship || friendship.receiverId !== me.id || friendship.status !== 'pending') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.friendship.update({
    where: { id: friendshipId },
    data:  { status: accept ? 'accepted' : 'rejected' },
  });

  return NextResponse.json({ ok: true });
}
