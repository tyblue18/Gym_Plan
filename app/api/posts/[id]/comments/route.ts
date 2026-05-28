/**
 * GET  /api/posts/[id]/comments — list comments (oldest first) with authors.
 * POST /api/posts/[id]/comments — add a comment.
 * Both require membership of the post's group.
 */

import { getServerSession }    from 'next-auth/next';
import { NextResponse }        from 'next/server';
import { authOptions }         from '@/lib/auth';
import { prisma }              from '@/lib/prisma';
import { feedLimit }           from '@/lib/ratelimit';
import { commentCreateSchema } from '@/lib/validators';
import { postAccess }          from '@/lib/groupAccess';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const { id } = await params;

  const access = await postAccess(session.user.id, id);
  if (!access.ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const comments = await prisma.postComment.findMany({
    where:   { postId: id },
    orderBy: { createdAt: 'asc' },
    take:    100,
    include: { user: { select: { id: true, name: true, username: true } } },
  });

  return NextResponse.json({
    comments: comments.map(c => ({
      id: c.id, text: c.text, createdAt: c.createdAt,
      author: { id: c.user.id, name: c.user.name, username: c.user.username },
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const meId = session.user.id;
  const { id } = await params;

  const { success } = await feedLimit.limit(meId);
  if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const access = await postAccess(meId, id);
  if (!access.ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const parsed = commentCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Comment required' }, { status: 400 });

  const c = await prisma.postComment.create({
    data:    { postId: id, userId: meId, text: parsed.data.text.trim() },
    include: { user: { select: { id: true, name: true, username: true } } },
  });

  return NextResponse.json({
    ok: true,
    comment: { id: c.id, text: c.text, createdAt: c.createdAt, author: { id: c.user.id, name: c.user.name, username: c.user.username } },
  });
}
