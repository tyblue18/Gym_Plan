/**
 * GET    /api/friends — list accepted friends + pending requests
 * POST   /api/friends — send a friend request by username
 * DELETE /api/friends — remove a friend or cancel a request
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json(null, { status: 401 });

  const me = await prisma.appUser.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json({ friends: [], incoming: [], outgoing: [] });

  const [sent, received] = await Promise.all([
    prisma.friendship.findMany({
      where:   { requesterId: me.id },
      include: {
        receiver: {
          select: { id: true, name: true, username: true, badges: { select: { id: true } } },
        },
      },
    }),
    prisma.friendship.findMany({
      where:   { receiverId: me.id },
      include: {
        requester: {
          select: { id: true, name: true, username: true, badges: { select: { id: true } } },
        },
      },
    }),
  ]);

  const friends = [
    ...sent.filter(f => f.status === 'accepted').map(f => ({
      id:           f.receiver.id,
      friendshipId: f.id,
      name:         f.receiver.name,
      username:     f.receiver.username,
      badgeCount:   f.receiver.badges.length,
    })),
    ...received.filter(f => f.status === 'accepted').map(f => ({
      id:           f.requester.id,
      friendshipId: f.id,
      name:         f.requester.name,
      username:     f.requester.username,
      badgeCount:   f.requester.badges.length,
    })),
  ];

  const incoming = received.filter(f => f.status === 'pending').map(f => ({
    id:           f.requester.id,
    friendshipId: f.id,
    name:         f.requester.name,
    username:     f.requester.username,
  }));

  const outgoing = sent.filter(f => f.status === 'pending').map(f => ({
    id:           f.receiver.id,
    friendshipId: f.id,
    name:         f.receiver.name,
    username:     f.receiver.username,
  }));

  return NextResponse.json({ friends, incoming, outgoing });
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json(null, { status: 401 });

  const { username } = await req.json() as { username?: string };
  if (!username?.trim()) return NextResponse.json({ error: 'Username required' }, { status: 400 });

  const me = await prisma.appUser.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!me.username) {
    return NextResponse.json({ error: 'Set your username first' }, { status: 400 });
  }

  const target = await prisma.appUser.findUnique({
    where: { username: username.trim().toLowerCase() },
  });
  if (!target)       return NextResponse.json({ error: 'No user with that username' }, { status: 404 });
  if (target.id === me.id) return NextResponse.json({ error: "Can't add yourself" }, { status: 400 });

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: me.id, receiverId: target.id },
        { requesterId: target.id, receiverId: me.id },
      ],
    },
  });

  if (existing) {
    const msg = existing.status === 'accepted' ? 'Already friends'
      : existing.status === 'pending'  ? 'Request already sent or received'
      : 'Request already exists';
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  const friendship = await prisma.friendship.create({
    data: { requesterId: me.id, receiverId: target.id },
  });

  return NextResponse.json({ ok: true, friendshipId: friendship.id });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json(null, { status: 401 });

  const { friendshipId } = await req.json() as { friendshipId?: string };
  if (!friendshipId) return NextResponse.json({ error: 'friendshipId required' }, { status: 400 });

  const me = await prisma.appUser.findUnique({ where: { email: session.user.email } });
  if (!me) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!friendship || (friendship.requesterId !== me.id && friendship.receiverId !== me.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.friendship.delete({ where: { id: friendshipId } });
  return NextResponse.json({ ok: true });
}
