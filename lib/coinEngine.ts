/**
 * lib/coinEngine.ts
 *
 * Server-side calorie-coin awards. Called as a side-effect of every
 * POST /api/sync, after day records are upserted.
 *
 * Rules (mirror of CalorieTracker.tsx client logic):
 *   • A day "hits the goal" via isGoalDay(): on a cut/bulk plan, any day at/below
 *     (cut) or at/above (bulk) true maintenance (tdee + burn) counts; with no
 *     plan it's the precise ±100 kcal band around budget. calsEaten must be > 0.
 *   • Coins per day = Math.floor(streak / 7) + 1
 *     (week 1 = 1 coin/day, week 2 = 2 coins/day, …)
 *   • Each date is awarded at most once, tracked via CoinTransaction
 *     rows with reason = 'goal_hit' and refId = 'YYYY-MM-DD'.
 *   • FUTURE days never earn coins. A user can scroll the calendar to
 *     tomorrow and fill in a goal-hit day, but coins are only granted for
 *     dates ≤ the user's LOCAL today (derived from their queTzOffset). This
 *     also keeps future days out of the streak multiplier.
 *   • Non-critical: callers should catch and swallow errors so a coin
 *     failure never blocks a sync response.
 */

import { prisma } from '@/lib/prisma';
import { isGoalDay, dayMaintenanceFromRecord, type PlanDirection } from '@/lib/calorie-utils';

type DayRecordClient = {
  findMany: (args: unknown) => Promise<Array<{ date: string; data: unknown }>>;
};

function dr(): DayRecordClient {
  return (prisma as unknown as { dayRecord: DayRecordClient }).dayRecord;
}

/** Coins earned on a day that ends a streak of `streak` consecutive goal days. */
function coinsForStreak(streak: number): number {
  return Math.floor(streak / 7) + 1;
}

/** Count consecutive goal-hit days ending at dateStr (inclusive). */
function streakEndingAt(dateStr: string, goalDaySet: Set<string>): number {
  let count = 0;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 366; i++) {
    const ds = dt.toISOString().slice(0, 10);
    if (!goalDaySet.has(ds)) break;
    count++;
    dt.setUTCDate(dt.getUTCDate() - 1);
  }
  return count;
}

export interface CoinAward { date: string; coins: number }

/**
 * Scans all DayRecord rows for the user, finds goal-hit dates not yet
 * awarded, creates CoinTransactions, and increments CoinWallet.balance.
 * Returns the list of newly awarded dates and the updated wallet balance.
 */
export async function checkAndAwardCoins(
  userId: string,
  tzOffsetMinutes?: number,
  planDirection: PlanDirection = null,
): Promise<{ awarded: CoinAward[]; walletBalance: number }> {
  // The user's LOCAL today (YYYY-MM-DD). queTzOffset is Date.getTimezoneOffset()
  // — minutes where local = UTC − offset — so shifting "now" by it and reading
  // the UTC date yields the local calendar day. Falls back to UTC today when the
  // offset is missing (legacy clients); at worst a tz-ahead user's same-day coin
  // lands on the next sync, which is harmless.
  const offset     = Number.isFinite(tzOffsetMinutes) ? (tzOffsetMinutes as number) : 0;
  const localToday = new Date(Date.now() - offset * 60_000).toISOString().slice(0, 10);

  // 1. All day records — need full history to compute streaks correctly.
  const dayRows = await dr().findMany({
    where:   { userId },
    select:  { date: true, data: true },
    orderBy: { date: 'asc' },
  } as unknown as Parameters<DayRecordClient['findMany']>[0]);

  // 2. Build the set of goal-hit dates — FUTURE days are excluded so they can
  //    neither be awarded nor inflate the streak multiplier (anti-farming).
  //    Plan-aware: on a cut/bulk, any day under/over true maintenance counts
  //    (see isGoalDay); without a plan it's the precise ±100 band.
  const goalDaySet = new Set<string>();
  for (const row of dayRows) {
    if (row.date > localToday) continue;
    const data = row.data as Record<string, unknown>;
    const maint = dayMaintenanceFromRecord(data);
    if (isGoalDay(data.calsEaten, data.budget, maint, planDirection)) goalDaySet.add(row.date);
  }

  // 3. Get (or create) the wallet and the dates already awarded.
  const wallet = await prisma.coinWallet.upsert({
    where:   { userId },
    create:  { userId, balance: 0 },
    update:  {},
    include: {
      transactions: {
        where:  { reason: 'goal_hit' },
        select: { refId: true },
      },
    },
  });

  if (goalDaySet.size === 0) return { awarded: [], walletBalance: wallet.balance };

  const awardedDates = new Set(
    wallet.transactions.map(t => t.refId).filter((r): r is string => r !== null),
  );

  // 4. New dates = goal days not yet in CoinTransaction (sorted asc for streak math).
  const newDates = Array.from(goalDaySet).filter(d => !awardedDates.has(d)).sort();
  if (newDates.length === 0) return { awarded: [], walletBalance: wallet.balance };

  // 5. Compute coins for each new date using the full goal-day history.
  const toAward: CoinAward[] = newDates.map(date => ({
    date,
    coins: coinsForStreak(streakEndingAt(date, goalDaySet)),
  }));

  const totalCoins = toAward.reduce((s, a) => s + a.coins, 0);

  // 6. Write transactions and update balance atomically.
  const updated = await prisma.$transaction(async tx => {
    await Promise.all(
      toAward.map(a =>
        tx.coinTransaction.create({
          data: { walletId: wallet.id, amount: a.coins, reason: 'goal_hit', refId: a.date },
        }),
      ),
    );
    return tx.coinWallet.update({
      where: { id: wallet.id },
      data:  { balance: { increment: totalCoins } },
    });
  });

  return { awarded: toAward, walletBalance: updated.balance };
}
