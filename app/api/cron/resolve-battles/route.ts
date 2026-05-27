/**
 * GET /api/cron/resolve-battles
 *
 * Scheduled at 03:00 UTC daily (after sync-steps at 02:00 — gives Google Fit
 * data a chance to land before scoring).
 *
 * Sweeps every typed battle whose status='active' and endDate < today, scores
 * it via lib/battleEngine.resolveBattle(), transfers the pot, and pushes a
 * win/loss/tie notification to both users.
 *
 * Protected by CRON_SECRET. Safe to invoke manually for replays — resolveBattle
 * is idempotent (it guards with a status='active' updateMany check).
 */

import { NextResponse }   from 'next/server';
import { prisma }         from '@/lib/prisma';
import { sendPushToUser } from '@/lib/push';
import { resolveBattle, todayUTC } from '@/lib/battleEngine';

interface Participant {
  id:       string;
  name:     string | null;
  username: string | null;
}

function displayName(p: Participant): string {
  return p.name ?? (p.username ? `@${p.username}` : 'your opponent');
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayUTC();

  // Find every typed battle whose window has ended. The composite
  // [status, endDate] index lets this stay cheap as the table grows.
  const due = await prisma.challenge.findMany({
    where: {
      status:  'active',
      type:    'typed',
      endDate: { lt: today },     // strict less-than: window must be fully past
    },
    select: {
      id:           true,
      challengerId: true,
      challengeeId: true,
      wager:        true,
      endDate:      true,
      challenger:   { select: { id: true, name: true, username: true } },
      challengee:   { select: { id: true, name: true, username: true } },
    },
    // Cap per-run work so a backlog after an outage doesn't time out the
    // serverless function. The next run picks up the rest 24h later.
    take: 200,
  });

  let resolved = 0;
  let failed   = 0;

  for (const c of due) {
    try {
      const resolution = await resolveBattle(c.id);
      if (!resolution) {                       // already resolved, or invalid shape
        continue;
      }
      resolved++;

      // Push both participants. Don't await — fire-and-forget per-user so a
      // single push failure can't block other notifications in the loop.
      const challengerName = displayName(c.challenger);
      const challengeeName = displayName(c.challengee);
      const pot            = c.wager * 2;

      if (resolution.winnerId === c.challengerId) {
        sendPushToUser(c.challengerId, {
          title: `You won! 🏆`,
          body:  `Beat ${challengeeName} — ${pot} 🪙 added to your wallet.`,
          url:   '/',
        }).catch(() => {});
        sendPushToUser(c.challengeeId, {
          title: `Battle lost`,
          body:  `${challengerName} won the battle. Better luck next time.`,
          url:   '/',
        }).catch(() => {});
      } else if (resolution.winnerId === c.challengeeId) {
        sendPushToUser(c.challengeeId, {
          title: `You won! 🏆`,
          body:  `Beat ${challengerName} — ${pot} 🪙 added to your wallet.`,
          url:   '/',
        }).catch(() => {});
        sendPushToUser(c.challengerId, {
          title: `Battle lost`,
          body:  `${challengeeName} won the battle. Better luck next time.`,
          url:   '/',
        }).catch(() => {});
      } else {
        // Tie: both refunded their wager
        const tieBody = `Battle ended in a tie — ${c.wager} 🪙 refunded.`;
        sendPushToUser(c.challengerId, { title: 'Battle tied 🤝', body: tieBody, url: '/' }).catch(() => {});
        sendPushToUser(c.challengeeId, { title: 'Battle tied 🤝', body: tieBody, url: '/' }).catch(() => {});
      }
    } catch (e) {
      failed++;
      console.error(`[cron/resolve-battles] failed for ${c.id}:`, e);
    }
  }

  console.log(`[cron/resolve-battles] ${today} — resolved:${resolved} failed:${failed} pending:${due.length}`);
  return NextResponse.json({ ok: true, date: today, resolved, failed, scanned: due.length });
}
