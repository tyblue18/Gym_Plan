/** DELETE /api/posts/[id] — remove a post (its author or the group owner). */

import { getServerSession } from 'next-auth/next';
import { NextResponse }     from 'next/server';
import { authOptions }      from '@/lib/auth';
import { prisma }           from '@/lib/prisma';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const meId = session.user.id;
  const { id } = await params;

  const post = await prisma.groupPost.findUnique({
    where:  { id },
    select: { userId: true, group: { select: { ownerId: true } } },
  });
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  if (post.userId !== meId && post.group.ownerId !== meId) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  await prisma.groupPost.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
