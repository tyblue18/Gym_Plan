/**
 * Shared group-membership checks for the feed routes. A user can only see or
 * act on posts in groups they belong to.
 */
import { prisma } from '@/lib/prisma';

export async function isGroupMember(userId: string, groupId: string): Promise<boolean> {
  const m = await prisma.groupMember.findUnique({
    where:  { groupId_userId: { groupId, userId } },
    select: { id: true },
  }).catch(() => null);
  return !!m;
}

/** Resolves a post's group + author and whether the user may access it (is a member). */
export async function postAccess(userId: string, postId: string): Promise<{ ok: boolean; groupId?: string; authorId?: string }> {
  const post = await prisma.groupPost.findUnique({
    where:  { id: postId },
    select: { groupId: true, userId: true },
  });
  if (!post) return { ok: false };
  return { ok: await isGroupMember(userId, post.groupId), groupId: post.groupId, authorId: post.userId };
}
