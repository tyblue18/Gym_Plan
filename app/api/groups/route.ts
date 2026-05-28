/**
 * GET  /api/groups — list every group the signed-in user belongs to, with members.
 * POST /api/groups — create a group (name + friends to add). You can only add
 *                    people you're accepted-friends with; members needn't be
 *                    friends with each other. The creator is always a member.
 */

import { getServerSession }   from 'next-auth/next';
import { NextResponse }       from 'next/server';
import { authOptions }        from '@/lib/auth';
import { prisma }             from '@/lib/prisma';
import { groupLimit }         from '@/lib/ratelimit';
import { groupCreateSchema }  from '@/lib/validators';
import { PROFILE_PHOTO_KEY }  from '@/lib/constants';

/** Max members per group (so the largest team battle is 6 v 6). */
const MAX_GROUP_SIZE = 12;

type MemberUser = {
  id: string; name: string | null; username: string | null;
  workoutData: { settings: unknown } | null;
};

function memberFields(u: MemberUser) {
  const settings = (u.workoutData?.settings ?? {}) as Record<string, unknown>;
  const photo    = typeof settings[PROFILE_PHOTO_KEY] === 'string' ? (settings[PROFILE_PHOTO_KEY] as string) : null;
  return { id: u.id, name: u.name, username: u.username, photo };
}

export async function GET(): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const meId = session.user.id;

  const memberships = await prisma.groupMember.findMany({
    where:  { userId: meId },
    select: {
      group: {
        select: {
          id: true, name: true, ownerId: true, description: true, createdAt: true,
          members: {
            select: { user: { select: { id: true, name: true, username: true, workoutData: { select: { settings: true } } } } },
          },
          // Latest feed post → shown as a "last activity" preview on the group card.
          posts: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { note: true, payload: true, createdAt: true, user: { select: { name: true, username: true } } },
          },
          _count: { select: { posts: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const groups = memberships.map(m => {
    const post = m.group.posts[0];
    let lastPost: { author: string; text: string; at: string } | null = null;
    if (post) {
      const payload = (post.payload ?? {}) as { title?: string };
      const author  = post.user.name ?? (post.user.username ? `@${post.user.username}` : 'Someone');
      lastPost = { author, text: payload.title || post.note || 'shared a workout', at: post.createdAt.toISOString() };
    }
    return {
      id:          m.group.id,
      name:        m.group.name,
      description: m.group.description,
      createdAt:   m.group.createdAt.toISOString(),
      ownerId:     m.group.ownerId,
      isOwner:     m.group.ownerId === meId,
      members:     m.group.members.map(gm => memberFields(gm.user)),
      lastPost,
      postCount:   m.group._count.posts,
    };
  });

  return NextResponse.json({ groups });
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const meId = session.user.id;

  const { success } = await groupLimit.limit(meId);
  if (!success) return NextResponse.json({ error: 'Too many requests — slow down' }, { status: 429 });

  const parsed = groupCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Group name required' }, { status: 400 });

  const name      = parsed.data.name.trim();
  const requested = [...new Set((parsed.data.memberIds ?? []).filter(id => id !== meId))];
  if (!name) return NextResponse.json({ error: 'Group name required' }, { status: 400 });

  // Only people the creator is accepted-friends with can be added.
  let validFriends: string[] = [];
  if (requested.length > 0) {
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: meId, receiverId: { in: requested } },
          { receiverId: meId, requesterId: { in: requested } },
        ],
      },
      select: { requesterId: true, receiverId: true },
    });
    const friendSet = new Set(friendships.map(f => (f.requesterId === meId ? f.receiverId : f.requesterId)));
    validFriends = requested.filter(id => friendSet.has(id));
  }

  const memberIds = [meId, ...validFriends];
  if (memberIds.length > MAX_GROUP_SIZE) {
    return NextResponse.json({ error: `Groups are capped at ${MAX_GROUP_SIZE} members` }, { status: 400 });
  }

  const group = await prisma.group.create({
    data: {
      name,
      description: parsed.data.description?.trim() || null,
      ownerId: meId,
      members: { create: memberIds.map(userId => ({ userId })) },
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: group.id });
}
