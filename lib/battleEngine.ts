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
// TEAM BATTLES (group 2v2 … NvN)
// ─────────────────────────────────────────────────────────────────────────────

export interface TeamCategoryResult {
  slug:       string;
  label:      string;
  group:      BattleCategory['group'];
  direction:  BattleCategory['direction'];
  unit:       string;
  team0Score: number | null;
  team1Score: number | null;
  outcome:    'team0' | 'team1' | 'tie' | 'nodata';
}

export interface TeamBattleResolution {
  perCategory: TeamCategoryResult[];
  summary: { team0Wins: number; team1Wins: number; ties: number; decided: number };
  /** 0 | 1 winning team, or null on overall tie. */
  winningTeam: 0 | 1 | null;
}

// ── FFA (free-for-all) ──────────────────────────────────────────────────────

export interface FFACategoryResult {
  slug:      string;
  label:     string;
  group:     BattleCategory['group'];
  direction: BattleCategory['direction'];
  unit:      string;
  scores:    Array<{ userId: string; score: number | null }>;
  /** Single winner of this category, or null on tie/no-data. */
  winnerId:  string | null;
}

export interface FFABattleResolution {
  perCategory: FFACategoryResult[];
  perUser:     Array<{ userId: string; categoryWins: number }>;
  /** Player with the most category wins. Null on overall tie → refund all. */
  winnerId:    string | null;
}

/** Discriminated by mode so the cron can branch on the same return value. */
export type ResolvedBattle =
  | ({ mode: 'teams' } & TeamBattleResolution)
  | ({ mode: 'ffa'   } & FFABattleResolution);

/** Per-category FFA score: nulls auto-lose; single top scorer wins; ties skip. */
function scoreCategoryFFA(cat: BattleCategory, parts: Array<{ userId: string; rows: DayRow[] }>): FFACategoryResult {
  const scores = parts.map(p => ({ userId: p.userId, score: cat.score(p.rows) }));
  const valid  = scores.filter((s): s is { userId: string; score: number } => s.score !== null);
  let winnerId: string | null = null;
  if (valid.length > 0) {
    const top = valid.reduce(
      (best, s) => (cat.direction === 'higher' ? s.score > best : s.score < best) ? s.score : best,
      valid[0].score,
    );
    const winners = valid.filter(s => s.score === top);
    winnerId = winners.length === 1 ? winners[0].userId : null;   // tied at top → no winner this category
  }
  return { slug: cat.slug, label: cat.label, group: cat.group, direction: cat.direction, unit: cat.unit, scores, winnerId };
}

/**
 * A team's score for a category = sum of its members' scores. Null only if
 * EVERY member had no data (a single non-logger just contributes 0, which —
 * because team battles are restricted to 'higher-is-better' categories — hurts
 * their own team). Mirrors the 1v1 "no data loses to anyone with data" rule.
 */
function teamScore(cat: BattleCategory, memberRows: DayRow[][]): number | null {
  const scores  = memberRows.map(rows => cat.score(rows));
  const anyData = scores.some(s => s !== null);
  if (!anyData) return null;
  return scores.reduce<number>((sum, s) => sum + (s ?? 0), 0);
}

/**
 * Resolve a team battle: per-category team sums, majority decides the winning
 * team, then the pot (wager × all participants) is split evenly among the
 * winning team (each winner nets +1 wager, like a duel). Overall tie refunds
 * everyone their ante. Safe to call on a non-active battle — returns null.
 */
export async function resolveTeamBattle(battleId: string): Promise<ResolvedBattle | null> {
  const tb = await prisma.teamBattle.findUnique({
    where:   { id: battleId },
    include: { participants: { select: { userId: true, team: true } } },
  });
  if (!tb || tb.status !== 'active') return null;
  if (!tb.startDate || !tb.endDate)  return null;
  const slugs = Array.isArray(tb.categories) ? (tb.categories as string[]) : [];
  if (slugs.length === 0) return null;

  // ── FFA branch ────────────────────────────────────────────────────────────
  if (tb.mode === 'ffa') {
    const rowsByUser = new Map<string, DayRow[]>();
    await Promise.all(tb.participants.map(async p => {
      rowsByUser.set(p.userId, await loadWindow(p.userId, tb.startDate, tb.endDate));
    }));

    const perCategory: FFACategoryResult[] = [];
    const wins: Record<string, number> = {};
    for (const p of tb.participants) wins[p.userId] = 0;

    for (const slug of slugs) {
      const cat = getCategory(slug);
      if (!cat) continue;
      const inputs = tb.participants.map(p => ({ userId: p.userId, rows: rowsByUser.get(p.userId) ?? [] }));
      const r = scoreCategoryFFA(cat, inputs);
      perCategory.push(r);
      if (r.winnerId) wins[r.winnerId]++;
    }

    // Top scorer wins; ties at the top → no winner (refund all).
    let winnerId: string | null = null;
    const sorted = Object.entries(wins).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0 && sorted[0][1] > 0) {
      const top = sorted[0][1];
      const tied = sorted.filter(([, v]) => v === top);
      winnerId = tied.length === 1 ? tied[0][0] : null;
    }

    const perUser    = Object.entries(wins).map(([userId, categoryWins]) => ({ userId, categoryWins }));
    const resolution = { perCategory, perUser, winnerId };

    await prisma.$transaction(async tx => {
      const claimed = await tx.teamBattle.updateMany({
        where: { id: tb.id, status: 'active' },
        data:  { status: 'resolved', resolution: resolution as unknown as object, resolvedAt: new Date() },
      });
      if (claimed.count === 0) throw new Error('ALREADY_RESOLVED');
      if (tb.wager <= 0) return;
      const pot = tb.wager * tb.participants.length;
      if (winnerId) {
        const w = await tx.coinWallet.upsert({ where: { userId: winnerId }, create: { userId: winnerId, balance: 0 }, update: {} });
        await tx.coinWallet.update({ where: { id: w.id }, data: { balance: { increment: pot } } });
        await tx.coinTransaction.create({ data: { walletId: w.id, amount: pot, reason: 'battle_win', refId: tb.id } });
      } else {
        for (const p of tb.participants) {
          const w = await tx.coinWallet.upsert({ where: { userId: p.userId }, create: { userId: p.userId, balance: 0 }, update: {} });
          await tx.coinWallet.update({ where: { id: w.id }, data: { balance: { increment: tb.wager } } });
          await tx.coinTransaction.create({ data: { walletId: w.id, amount: tb.wager, reason: 'refund', refId: tb.id } });
        }
      }
    });

    return { mode: 'ffa', ...resolution };
  }

  // ── Teams branch ──────────────────────────────────────────────────────────
  const team0 = tb.participants.filter(p => p.team === 0);
  const team1 = tb.participants.filter(p => p.team === 1);
  if (team0.length === 0 || team1.length === 0) return null;

  // Load every participant's window rows in parallel.
  const loadTeam = (members: { userId: string }[]) =>
    Promise.all(members.map(m => loadWindow(m.userId, tb.startDate, tb.endDate)));
  const [t0Rows, t1Rows] = await Promise.all([loadTeam(team0), loadTeam(team1)]);

  const perCategory: TeamCategoryResult[] = [];
  for (const slug of slugs) {
    const cat = getCategory(slug);
    if (!cat) continue;
    const s0 = teamScore(cat, t0Rows);
    const s1 = teamScore(cat, t1Rows);
    let outcome: TeamCategoryResult['outcome'];
    if (s0 === null && s1 === null) outcome = 'nodata';
    else if (s0 === null)           outcome = 'team1';
    else if (s1 === null)           outcome = 'team0';
    else {
      const cmp = compare(s0, s1, cat.direction);
      outcome = cmp === 1 ? 'team0' : cmp === -1 ? 'team1' : 'tie';
    }
    perCategory.push({ slug: cat.slug, label: cat.label, group: cat.group, direction: cat.direction, unit: cat.unit, team0Score: s0, team1Score: s1, outcome });
  }

  let team0Wins = 0, team1Wins = 0, ties = 0;
  for (const r of perCategory) {
    if      (r.outcome === 'team0') team0Wins++;
    else if (r.outcome === 'team1') team1Wins++;
    else if (r.outcome === 'tie')   ties++;
  }
  const winningTeam: 0 | 1 | null = team0Wins > team1Wins ? 0 : team1Wins > team0Wins ? 1 : null;
  const resolution: TeamBattleResolution = {
    perCategory,
    summary: { team0Wins, team1Wins, ties, decided: team0Wins + team1Wins },
    winningTeam,
  };

  await prisma.$transaction(async tx => {
    const claimed = await tx.teamBattle.updateMany({
      where: { id: tb.id, status: 'active' },
      data:  { status: 'resolved', winningTeam, resolution: resolution as unknown as object, resolvedAt: new Date() },
    });
    if (claimed.count === 0) throw new Error('ALREADY_RESOLVED');

    if (tb.wager <= 0) return; // friendly battle — no coins move

    const pot = tb.wager * tb.participants.length;
    if (winningTeam !== null) {
      const winners = tb.participants.filter(p => p.team === winningTeam);
      const share   = Math.floor(pot / winners.length); // equal teams → wager × 2
      for (const p of winners) {
        const w = await tx.coinWallet.upsert({ where: { userId: p.userId }, create: { userId: p.userId, balance: 0 }, update: {} });
        await tx.coinWallet.update({ where: { id: w.id }, data: { balance: { increment: share } } });
        await tx.coinTransaction.create({ data: { walletId: w.id, amount: share, reason: 'battle_win', refId: tb.id } });
      }
    } else {
      // Overall tie — refund each participant their ante.
      for (const p of tb.participants) {
        const w = await tx.coinWallet.upsert({ where: { userId: p.userId }, create: { userId: p.userId, balance: 0 }, update: {} });
        await tx.coinWallet.update({ where: { id: w.id }, data: { balance: { increment: tb.wager } } });
        await tx.coinTransaction.create({ data: { walletId: w.id, amount: tb.wager, reason: 'refund', refId: tb.id } });
      }
    }
  });

  return { mode: 'teams', ...resolution };
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE STANDINGS — read-only mid-battle leaderboard (no DB writes, no payout)
// ─────────────────────────────────────────────────────────────────────────────

export interface TeamsStanding {
  mode: 'teams';
  started: boolean;
  windowEnd: string;
  team0Wins: number;
  team1Wins: number;
  perCategory: Array<{ slug: string; label: string; unit: string; team0Score: number | null; team1Score: number | null; leader: 0 | 1 | null }>;
}
export interface FFAStanding {
  mode: 'ffa';
  started: boolean;
  windowEnd: string;
  leaderboard: Array<{ userId: string; categoryWins: number }>;
  perCategory: Array<{ slug: string; label: string; unit: string; scores: Array<{ userId: string; score: number | null }>; leaderId: string | null }>;
}
export type Standings = TeamsStanding | FFAStanding;

/** Current standings for a battle over the elapsed window [start, min(today,end)]. */
export async function computeStandings(battleId: string): Promise<Standings | null> {
  const tb = await prisma.teamBattle.findUnique({
    where:   { id: battleId },
    include: { participants: { select: { userId: true, team: true } } },
  });
  if (!tb) return null;
  const slugs = Array.isArray(tb.categories) ? (tb.categories as string[]) : [];

  const today = todayUTC();
  const upper = tb.endDate < today ? tb.endDate : today;     // count only days that have happened
  const started = tb.startDate <= upper;

  const rowsByUser = new Map<string, DayRow[]>();
  if (started) {
    await Promise.all(tb.participants.map(async p => {
      rowsByUser.set(p.userId, await loadWindow(p.userId, tb.startDate, upper));
    }));
  }
  const rowsOf = (uid: string) => rowsByUser.get(uid) ?? [];

  if (tb.mode === 'ffa') {
    const wins: Record<string, number> = {};
    for (const p of tb.participants) wins[p.userId] = 0;
    const perCategory: FFAStanding['perCategory'] = [];
    for (const slug of slugs) {
      const cat = getCategory(slug); if (!cat) continue;
      const r = scoreCategoryFFA(cat, tb.participants.map(p => ({ userId: p.userId, rows: rowsOf(p.userId) })));
      if (started && r.winnerId) wins[r.winnerId]++;
      perCategory.push({ slug: cat.slug, label: cat.label, unit: cat.unit, scores: r.scores, leaderId: started ? r.winnerId : null });
    }
    const leaderboard = Object.entries(wins).map(([userId, categoryWins]) => ({ userId, categoryWins })).sort((a, b) => b.categoryWins - a.categoryWins);
    return { mode: 'ffa', started, windowEnd: upper, leaderboard, perCategory };
  }

  const team0 = tb.participants.filter(p => p.team === 0).map(p => rowsOf(p.userId));
  const team1 = tb.participants.filter(p => p.team === 1).map(p => rowsOf(p.userId));
  let team0Wins = 0, team1Wins = 0;
  const perCategory: TeamsStanding['perCategory'] = [];
  for (const slug of slugs) {
    const cat = getCategory(slug); if (!cat) continue;
    const s0 = teamScore(cat, team0);
    const s1 = teamScore(cat, team1);
    let leader: 0 | 1 | null = null;
    if (s0 === null && s1 === null) leader = null;
    else if (s0 === null) leader = 1;
    else if (s1 === null) leader = 0;
    else { const c = compare(s0, s1, cat.direction); leader = c === 1 ? 0 : c === -1 ? 1 : null; }
    if (started) { if (leader === 0) team0Wins++; else if (leader === 1) team1Wins++; }
    perCategory.push({ slug: cat.slug, label: cat.label, unit: cat.unit, team0Score: s0, team1Score: s1, leader: started ? leader : null });
  }
  return { mode: 'teams', started, windowEnd: upper, team0Wins, team1Wins, perCategory };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS used by the API routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes [startDate, endDate] given a window kind and a start date (YYYY-MM-DD).
 * 'day'  → both equal startDate (1 day)
 * '3day' → 3-day window, inclusive (startDate ... startDate+2)
 * 'week' → 7-day window, inclusive (startDate ... startDate+6)
 */
export function windowBounds(startDate: string, windowKind: 'day' | '3day' | 'week'): { startDate: string; endDate: string } {
  const span = windowKind === 'day' ? 0 : windowKind === '3day' ? 2 : 6;
  if (span === 0) return { startDate, endDate: startDate };
  // Parse YYYY-MM-DD and add the span. UTC math avoids local-DST drift.
  const [y, m, d] = startDate.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1, d));
  end.setUTCDate(end.getUTCDate() + span);
  return { startDate, endDate: end.toISOString().slice(0, 10) };
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
