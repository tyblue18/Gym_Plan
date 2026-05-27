/**
 * lib/battleEngine.ts
 *
 * Server-side typed-battle resolution.
 *
 * Flow:
 *   1. Load both users' DayRecord rows in the [startDate, endDate] window.
 *   2. For each category in challenge.categories, compute both scores.
 *   3. Per category, decide a winner by direction; ties are no-result.
 *   4. Overall winner = majority of decided categories. If decided is even
 *      and split, the whole battle ties (both refunded).
 *   5. Atomic Prisma transaction: write resolution JSON, mark resolved,
 *      transfer coins, create CoinTransaction rows.
 */

import { prisma } from '@/lib/prisma';
import {
  BATTLE_CATEGORIES, getCategory,
  type BattleCategory, type DayRow,
} from '@/lib/battle-categories';

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CategoryResult {
  slug:             string;
  label:            string;
  group:            BattleCategory['group'];
  direction:        BattleCategory['direction'];
  unit:             string;
  challengerScore:  number | null;
  challengeeScore:  number | null;
  /** 'challenger' | 'challengee' | 'tie' | 'nodata' */
  outcome:          'challenger' | 'challengee' | 'tie' | 'nodata';
}

export interface BattleResolution {
  perCategory: CategoryResult[];
  summary: {
    challengerWins: number;
    challengeeWins: number;
    ties:           number;
    /** Total categories where both users had data. */
    decided:        number;
  };
  /** Final winnerId, or null on overall tie. */
  winnerId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORING
// ─────────────────────────────────────────────────────────────────────────────

/** Compare two scores per direction. Returns 1 if a wins, -1 if b wins, 0 tie. */
function compare(a: number, b: number, direction: BattleCategory['direction']): 0 | 1 | -1 {
  if (a === b) return 0;
  if (direction === 'higher') return a > b ? 1 : -1;
  return a < b ? 1 : -1;
}

function scoreCategory(
  cat:               BattleCategory,
  challengerRows:    DayRow[],
  challengeeRows:    DayRow[],
  challengerId:      string,
  challengeeId:      string,
): CategoryResult {
  const cs = cat.score(challengerRows);
  const es = cat.score(challengeeRows);

  // Per spec: a user with no logged data LOSES that category to anyone who
  // did log (regardless of direction). Only when *both* users have no data
  // does the category count as a true no-result and skip the win tally.
  let outcome: CategoryResult['outcome'];
  if (cs === null && es === null) {
    outcome = 'nodata';
  } else if (cs === null) {
    outcome = 'challengee';
  } else if (es === null) {
    outcome = 'challenger';
  } else {
    const cmp = compare(cs, es, cat.direction);
    outcome = cmp === 1 ? 'challenger' : cmp === -1 ? 'challengee' : 'tie';
  }

  // Kept in scope (not in the result row) so debug logs can attribute scores
  // by user without re-plumbing the IDs through caller chains.
  void challengerId; void challengeeId;

  return {
    slug:            cat.slug,
    label:           cat.label,
    group:           cat.group,
    direction:       cat.direction,
    unit:            cat.unit,
    challengerScore: cs,
    challengeeScore: es,
    outcome,
  };
}



/**
 * Build a BattleResolution given two users' DayRows and the chosen category slugs.
 * Pure function — does no DB I/O — so it can be unit-tested and reused by a
 * "live preview" endpoint later.
 */
export function computeResolution(
  challengerId:    string,
  challengeeId:    string,
  categorySlugs:   string[],
  challengerRows:  DayRow[],
  challengeeRows:  DayRow[],
): BattleResolution {
  const perCategory: CategoryResult[] = [];
  for (const slug of categorySlugs) {
    const cat = getCategory(slug);
    if (!cat) continue;                                  // unknown slugs are silently skipped
    perCategory.push(scoreCategory(cat, challengerRows, challengeeRows, challengerId, challengeeId));
  }

  let challengerWins = 0;
  let challengeeWins = 0;
  let ties           = 0;
  for (const r of perCategory) {
    if      (r.outcome === 'challenger') challengerWins++;
    else if (r.outcome === 'challengee') challengeeWins++;
    else if (r.outcome === 'tie')        ties++;
  }
  const decided = challengerWins + challengeeWins;

  const winnerId =
    challengerWins > challengeeWins ? challengerId :
    challengeeWins > challengerWins ? challengeeId :
    null; // overall tie (equal wins, or all categories were nodata/tie)

  return {
    perCategory,
    summary: { challengerWins, challengeeWins, ties, decided },
    winnerId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOLUTION — loads data, computes, writes, transfers coins
// ─────────────────────────────────────────────────────────────────────────────

interface ChallengeRow {
  id:           string;
  challengerId: string;
  challengeeId: string;
  wager:        number;
  status:       string;
  categories:   unknown;
  type:         string | null;
  startDate:    string | null;
  endDate:      string | null;
}

/**
 * Load DayRecord rows for a single user across a date window.
 * Uses the same untyped escape hatch as other routes that read DayRecord
 * (the Prisma client typing doesn't pick up the model from schema reliably
 *  in this codebase — same pattern as app/api/sync/route.ts).
 */
async function loadWindow(userId: string, startDate: string, endDate: string): Promise<DayRow[]> {
  const rows = await (prisma as unknown as {
    dayRecord: {
      findMany: (args: unknown) => Promise<Array<{ date: string; data: unknown }>>;
    };
  }).dayRecord.findMany({
    where:  { userId, date: { gte: startDate, lte: endDate } },
    select: { date: true, data: true },
  });
  return rows.map(r => ({
    date: r.date,
    data: (r.data ?? {}) as Record<string, unknown>,
  }));
}

/**
 * Resolve a typed battle: compute per-category scores, mark resolved, transfer
 * the pot. Safe to call on a non-resolvable challenge — returns null in that
 * case without mutating state.
 *
 * Coin movement (both wagers were already debited at accept time):
 *   - Winner: +2 × wager  (gets their stake back + opponent's)
 *   - Loser:   nothing
 *   - Tie:    each refunded their own wager
 */
export async function resolveBattle(challengeId: string): Promise<BattleResolution | null> {
  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } }) as ChallengeRow | null;
  if (!challenge)                          return null;
  if (challenge.status !== 'active')       return null;
  if (challenge.type === 'classic')        return null;          // legacy badge-count battle
  if (!challenge.startDate || !challenge.endDate) return null;
  const slugs = Array.isArray(challenge.categories) ? (challenge.categories as string[]) : [];
  if (slugs.length === 0) return null;

  // 1. Load both sides' day records in the window (parallel — independent reads).
  const [challengerRows, challengeeRows] = await Promise.all([
    loadWindow(challenge.challengerId, challenge.startDate, challenge.endDate),
    loadWindow(challenge.challengeeId, challenge.startDate, challenge.endDate),
  ]);

  // 2. Compute the resolution (pure function).
  const resolution = computeResolution(
    challenge.challengerId,
    challenge.challengeeId,
    slugs,
    challengerRows,
    challengeeRows,
  );

  // 3. Atomic write: mark resolved, transfer pot, write coin transactions.
  //    updateMany guards against a concurrent second resolution attempt.
  await prisma.$transaction(async tx => {
    const claimed = await tx.challenge.updateMany({
      where: { id: challenge.id, status: 'active' },
      data: {
        status:     'resolved',
        winnerId:   resolution.winnerId ?? null,
        resolution: resolution as unknown as object,
        resolvedAt: new Date(),
      },
    });
    if (claimed.count === 0) throw new Error('ALREADY_RESOLVED');

    const pot = challenge.wager * 2;

    if (resolution.winnerId) {
      // Winner takes the pot (2× wager — gets their stake back + opponent's).
      const winnerWallet = await tx.coinWallet.upsert({
        where:  { userId: resolution.winnerId },
        create: { userId: resolution.winnerId, balance: 0 },
        update: {},
      });
      await tx.coinWallet.update({
        where: { id: winnerWallet.id },
        data:  { balance: { increment: pot } },
      });
      await tx.coinTransaction.create({
        data: { walletId: winnerWallet.id, amount: pot, reason: 'battle_win', refId: challenge.id },
      });
    } else {
      // Overall tie — refund each side their own wager.
      for (const uid of [challenge.challengerId, challenge.challengeeId]) {
        const w = await tx.coinWallet.upsert({
          where:  { userId: uid },
          create: { userId: uid, balance: 0 },
          update: {},
        });
        await tx.coinWallet.update({
          where: { id: w.id },
          data:  { balance: { increment: challenge.wager } },
        });
        await tx.coinTransaction.create({
          data: { walletId: w.id, amount: challenge.wager, reason: 'refund', refId: challenge.id },
        });
      }
    }
  });

  return resolution;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS used by the API routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes [startDate, endDate] given a window kind and a start date (YYYY-MM-DD).
 * 'day'  → both equal startDate
 * 'week' → 7-day window starting at startDate, inclusive (startDate ... startDate+6)
 */
export function windowBounds(startDate: string, windowKind: 'day' | 'week'): { startDate: string; endDate: string } {
  if (windowKind === 'day') return { startDate, endDate: startDate };
  // Parse YYYY-MM-DD and add 6 days. Use UTC math to avoid local-DST drift.
  const [y, m, d] = startDate.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d));
  end.setUTCDate(end.getUTCDate() + 6);
  const endDate = end.toISOString().slice(0, 10);
  return { startDate, endDate };
}

/** True if endDate (YYYY-MM-DD) is strictly before today (UTC). */
export function isWindowComplete(endDate: string, todayStr: string): boolean {
  return endDate < todayStr;
}

/** YYYY-MM-DD for today in UTC. Used as the server's "now" for window math. */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Re-export so route code only needs one import. */
export { BATTLE_CATEGORIES, getCategory } from '@/lib/battle-categories';

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE STATS
// ─────────────────────────────────────────────────────────────────────────────

export interface BattleRecord {
  wins:   number;
  losses: number;
  ties:   number;
}

/**
 * Counts a user's resolved-battle record (wins / losses / ties).
 * One indexed query — used by /api/user and /api/user/[userId].
 */
export async function getBattleRecord(userId: string): Promise<BattleRecord> {
  const resolved = await prisma.challenge.findMany({
    where: {
      status: 'resolved',
      OR: [
        { challengerId: userId },
        { challengeeId: userId },
      ],
    },
    select: { winnerId: true },
  });

  let wins = 0, losses = 0, ties = 0;
  for (const c of resolved) {
    if      (c.winnerId === userId) wins++;
    else if (c.winnerId === null)   ties++;
    else                            losses++;
  }
  return { wins, losses, ties };
}
