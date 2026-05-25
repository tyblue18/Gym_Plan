/**
 * lib/validators.ts
 *
 * Zod schemas for every API route that accepts a request body or query param.
 * Import the schema in the route, call .safeParse(), and return 400 on failure.
 */

import { z } from 'zod';

// ── Reusable primitives ───────────────────────────────────────────────────────

/** Cuid / nanoid IDs used as Prisma primary keys */
const id = z.string().min(1).max(128);

/** Arbitrary JSON object (top-level only — we don't deep-validate blobs) */
const jsonObject = z.record(z.string(), z.unknown());

// ── /api/sync POST ────────────────────────────────────────────────────────────

export const syncPostSchema = z.object({
  localDB:  jsonObject.optional(),
  profile:  jsonObject.optional(),
  settings: jsonObject.optional(),
});

// ── /api/friends POST ─────────────────────────────────────────────────────────

export const friendPostSchema = z.object({
  username: z.string().min(1).max(50),
});

// ── /api/friends DELETE ───────────────────────────────────────────────────────

export const friendDeleteSchema = z.object({
  friendshipId: id,
});

// ── /api/friends/respond POST ─────────────────────────────────────────────────

export const friendRespondSchema = z.object({
  friendshipId: id,
  accept:       z.boolean(),
});

// ── /api/challenges POST ──────────────────────────────────────────────────────

export const challengePostSchema = z.object({
  friendId: id,
  wager:    z.number().int().min(1).max(100_000),
});

// ── /api/challenges/[id] POST ─────────────────────────────────────────────────

export const challengeActionSchema = z.object({
  action: z.enum(['accept', 'decline']),
});

// ── /api/user PATCH ───────────────────────────────────────────────────────────

export const userPatchSchema = z.object({
  username:       z.string().min(3).max(20).optional(),
  status:         z.string().max(60).nullable().optional(),
  statusDuration: z.enum(['24h', 'forever', 'clear']).optional(),
  showcaseBadges: z.array(z.string().max(100)).max(8).optional(),
});

// ── /api/wallet POST (coin import) ────────────────────────────────────────────

export const walletImportSchema = z.object({
  balance: z.number().int().min(0).max(100_000),
});

// ── /api/push/subscribe POST ──────────────────────────────────────────────────

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(500),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth:   z.string().min(1).max(100),
  }),
});

// ── /api/push/subscribe DELETE ────────────────────────────────────────────────

export const pushDeleteSchema = z.object({
  endpoint: z.string().min(1).max(500),
});

// ── /api/food/search GET (?q=) ────────────────────────────────────────────────

export const foodSearchSchema = z.object({
  q: z.string().min(1).max(200),
});
