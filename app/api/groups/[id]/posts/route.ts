/**
 * GET /api/groups/[id]/posts — the group's activity feed (newest first), with
 * each post's author, like count, my-liked flag, and comment count.
 */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';
import { isGroupMember }    from '@/lib/groupAccess';
import { PROFILE_PHOTO_KEY } from '@/lib/constants';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const meId = session.user.id;
  const { id } = await params;

  if (!(await isGroupMember(meId, id))) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const posts = await prisma.groupPost.findMany({
    where:   { groupId: id },
    orderBy: { createdAt: 'desc' },
    take:    40,
    include: {
      user:     { select: { id: true, name: true, username: true, workoutData: { select: { settings: true } } } },
      likes:    { where: { userId: meId }, select: { id: true } },
      _count:   { select: { likes: true, comments: true } },
    },
  });

  const shaped = posts.map(p => {
    const settings = (p.user.workoutData?.settings ?? {}) as Record<string, unknown>;
    const photo    = typeof settings[PROFILE_PHOTO_KEY] === 'string' ? (settings[PROFILE_PHOTO_KEY] as string) : null;
    return {
      id: p.id, date: p.date, note: p.note, payload: p.payload, createdAt: p.createdAt,
      author: { id: p.user.id, name: p.user.name, username: p.user.username, photo },
      likeCount: p._count.likes, commentCount: p._count.comments,
      liked: p.likes.length > 0,
      mine: p.user.id === meId,
    };
  });

  return NextResponse.json({ posts: shaped });
}
