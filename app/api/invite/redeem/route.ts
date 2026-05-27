/**
 * POST /api/invite/redeem — called once by a new user's client after they
 * authenticate, if they arrived via an invite link (`?invite=<username>`).
 *
 * Effects (all idempotent / deduped):
 *   1. Resolves the inviter by username (the invite "code").
 *   2. Establishes an accepted friendship between inviter and invitee.
 *   3. Awards coins to BOTH sides — `referral_received` on the invitee,
 *      `referral_sent` on the inviter. The invitee's `referral_received` row is
 *      the dedupe key: an account can only ever redeem ONE invite, which (since
 *      accounts are OAuth-gated) makes farming expensive.
 *   4. Push-notifies the inviter and re-runs the badge engine so the inviter's
 *      "Recruiter" badge can be awarded; any new badge is stashed on Redis so
 *      the inviter's next sync fires the celebration popup.
 *
 * Always returns 200 with `{ ok, reason }` for handled cases so the client can
 * clear the pending code and stop retrying.
 */

import { getServerSession }    from 'next-auth/next';
import { after, NextResponse } from 'next/server';
import { Redis }               from '@upstash/redis';
import { authOptions }         from '@/lib/auth';
import { prisma }              from '@/lib/prisma';
import { sendPushToUser }      from '@/lib/push';
import { inviteLimit }         from '@/lib/ratelimit';
import { inviteRedeemSchema }  from '@/lib/validators';
import { normalizeInviteCode, INVITE_REWARD_INVITER, INVITE_REWARD_INVITEE } from '@/lib/invite';
import { awardBadgesForUser }  from '@/lib/badgeEngine';
import type { AwardedBadge }   from '@/lib/badgeEngine';

const redis = new Redis({
  url:   process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

/** Mirror of the resolve-battles cron: stash awarded badges so the inviter's
 *  next sync drains them and fires the que-badge-earned popup. */
async function queuePendingBadges(userId: string, awarded: AwardedBadge[]): Promise<void> {
  if (awarded.length === 0) return;
  const key      = `pending:badges:${userId}`;
  const existing = (await redis.get<AwardedBadge[]>(key)) ?? [];
  const seen     = new Set(existing.map(b => b.slug));
  const merged   = [...existing, ...awarded.filter(b => !seen.has(b.slug))];
  await redis.setex(key, 7 * 24 * 3600, JSON.stringify(merged));
}

export async function POST(req: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });
  const meId = session.user.id;

  const { success } = await inviteLimit.limit(meId);
  if (!success) return NextResponse.json({ ok: false, reason: 'rate_limited' }, { status: 429 });

  const parsed = inviteRedeemSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: 'bad_request' }, { status: 400 });

  const code = normalizeInviteCode(parsed.data.code);
  // Invalid code shape → tell the client to drop it (ok:true clears the pending key).
  if (!code) return NextResponse.json({ ok: false, reason: 'invalid', clear: true });

  const inviter = await prisma.appUser.findUnique({
    where:  { username: code },
    select: { id: true, name: true, username: true },
  });
  if (!inviter)            return NextResponse.json({ ok: false, reason: 'not_found', clear: true });
  if (inviter.id === meId) return NextResponse.json({ ok: false, reason: 'self', clear: true });

  // Ensure both wallets exist (invitee's may be brand new).
  const [inviterWallet, inviteeWallet] = await Promise.all([
    prisma.coinWallet.upsert({ where: { userId: inviter.id }, create: { userId: inviter.id, balance: 0 }, update: {} }),
    prisma.coinWallet.upsert({ where: { userId: meId },       create: { userId: meId,       balance: 0 }, update: {} }),
  ]);

  // Dedupe: an account can only ever redeem one invite.
  const priorRedemption = await prisma.coinTransaction.count({
    where: { walletId: inviteeWallet.id, reason: 'referral_received' },
  });
  if (priorRedemption > 0) return NextResponse.json({ ok: false, reason: 'already_redeemed', clear: true });

  const existingFriendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: inviter.id, receiverId: meId },
        { requesterId: meId, receiverId: inviter.id },
      ],
    },
  });

  // Everything that touches balances runs in one transaction with a re-checked
  // dedupe guard so two concurrent redeems can't double-pay.
  await prisma.$transaction(async tx => {
    const stillNone = await tx.coinTransaction.count({
      where: { walletId: inviteeWallet.id, reason: 'referral_received' },
    });
    if (stillNone > 0) return;

    if (existingFriendship) {
      if (existingFriendship.status !== 'accepted') {
        await tx.friendship.update({ where: { id: existingFriendship.id }, data: { status: 'accepted' } });
      }
    } else {
      await tx.friendship.create({
        data: { requesterId: inviter.id, receiverId: meId, status: 'accepted' },
      });
    }

    await tx.coinTransaction.create({
      data: { walletId: inviteeWallet.id, amount: INVITE_REWARD_INVITEE, reason: 'referral_received', refId: inviter.id },
    });
    await tx.coinTransaction.create({
      data: { walletId: inviterWallet.id, amount: INVITE_REWARD_INVITER, reason: 'referral_sent', refId: meId },
    });
    await tx.coinWallet.update({ where: { id: inviteeWallet.id }, data: { balance: { increment: INVITE_REWARD_INVITEE } } });
    await tx.coinWallet.update({ where: { id: inviterWallet.id }, data: { balance: { increment: INVITE_REWARD_INVITER } } });
  });

  // Non-blocking: notify the inviter and re-evaluate their badges (Recruiter).
  after(async () => {
    sendPushToUser(inviter.id, {
      title: 'Someone joined Que 🎉',
      body:  `A friend joined with your invite. +${INVITE_REWARD_INVITER} coins!`,
      url:   '/app',
    }).catch(() => {});
    try {
      const awarded = await awardBadgesForUser(inviter.id);
      await queuePendingBadges(inviter.id, awarded);
    } catch { /* badge award is best-effort */ }
  });

  return NextResponse.json({ ok: true, inviter: inviter.name ?? inviter.username, coins: INVITE_REWARD_INVITEE });
}
