/**
 * GET    /api/friends — list accepted friends + pending requests
 * POST   /api/friends — send a friend request by username
 * DELETE /api/friends — remove a friend or cancel a request
 */

import { getServerSession }       from 'next-auth/next';
import { after, NextResponse }    from 'next/server';
import { authOptions }            from '@/lib/auth';
import { prisma }            from '@/lib/prisma';
import { sendPushToUser }    from '@/lib/push';
import { friendLimit }       from '@/lib/ratelimit';
import { PROFILE_PHOTO_KEY } from '@/lib/constants';
import { friendPostSchema, friendDeleteSchema } from '@/lib/validators';

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const me = { id: session.user.id };

  const userSelect = {
    id: true, name: true, username: true,
    status: true, statusExpiresAt: true,
    badges: { select: { id: true } },
    workoutData: { select: { settings: true } },
  } as const;

  const [sent, received] = await Promise.all([
    prisma.friendship.findMany({
      where:   { requesterId: me.id },
      include: { receiver: { select: userSelect } },
    }),
    prisma.friendship.findMany({
      where:   { receiverId: me.id },
      include: { requester: { select: userSelect } },
    }),
  ]);

  const now = new Date();
  const expiredIds: string[] = [];

  function extractFriendFields(u: {
    id: string; name: string | null; username: string | null;
    status: string | null; statusExpiresAt: Date | null;
    badges: { id: string }[];
    workoutData: { settings: unknown } | null;
  }, friendshipId: string) {
    const settings = (u.workoutData?.settings ?? {}) as Record<string, unknown>;
    const photo    = (typeof settings[PROFILE_PHOTO_KEY] === 'string' ? settings[PROFILE_PHOTO_KEY] : null);
    const active   = !u.statusExpiresAt || u.statusExpiresAt > now;
    if (!active && u.statusExpiresAt) expiredIds.push(u.id);
    const status   = u.status && active ? u.status : null;
    return {
      id: u.id, friendshipId,
      name: u.name, username: u.username,
      badgeCount: u.badges.length,
      photo, status,
    };
  }

  const friends = [
    ...sent.filter(f => f.status === 'accepted').map(f => extractFriendFields(f.receiver, f.id)),
    ...received.filter(f => f.status === 'accepted').map(f => extractFriendFields(f.requester, f.id)),
  ];

  if (expiredIds.length > 0) after(() =>
    prisma.appUser.updateMany({
      where: { id: { in: expiredIds }, statusExpiresAt: { lte: now } },
      data:  { status: null, statusExpiresAt: null },
    }).catch(() => {})
  );

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
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const { success } = await friendLimit.limit(session.user.id);
  if (!success) return NextResponse.json({ error: 'Too many friend requests — slow down' }, { status: 429 });

  const parsed = friendPostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Username required' }, { status: 400 });
  const { username } = parsed.data;

  const me = await prisma.appUser.findUnique({ where: { id: session.user.id } });
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

  sendPushToUser(target.id, {
    title: 'New friend request',
    body:  `${me.name ?? me.username ?? 'Someone'} wants to be friends`,
    url:   '/',
  }).catch(() => {});

  return NextResponse.json({ ok: true, friendshipId: friendship.id });
}

export async function DELETE(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const { success } = await friendLimit.limit(session.user.id);
  if (!success) return NextResponse.json({ error: 'Too many requests — slow down' }, { status: 429 });

  const dparsed = friendDeleteSchema.safeParse(await req.json().catch(() => null));
  if (!dparsed.success) return NextResponse.json({ error: 'friendshipId required' }, { status: 400 });
  const { friendshipId } = dparsed.data;

  const me = { id: session.user.id };

  const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!friendship || (friendship.requesterId !== me.id && friendship.receiverId !== me.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.friendship.delete({ where: { id: friendshipId } });
  return NextResponse.json({ ok: true });
}
