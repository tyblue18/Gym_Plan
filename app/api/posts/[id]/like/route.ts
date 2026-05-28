/** POST /api/posts/[id]/like — toggle the signed-in user's like on a post. */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';
import { feedLimit }        from '@/lib/ratelimit';
import { postAccess }       from '@/lib/groupAccess';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const meId = session.user.id;
  const { id } = await params;

  const { success } = await feedLimit.limit(meId);
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const access = await postAccess(meId, id);
  if (!access.ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const existing = await prisma.postLike.findUnique({ where: { postId_userId: { postId: id, userId: meId } }, select: { id: true } });
  if (existing) await prisma.postLike.delete({ where: { id: existing.id } });
  else          await prisma.postLike.create({ data: { postId: id, userId: meId } });

  const count = await prisma.postLike.count({ where: { postId: id } });
  return NextResponse.json({ liked: !existing, count });
}
