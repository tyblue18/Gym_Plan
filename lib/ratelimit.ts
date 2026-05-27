import { Ratelimit } from '@upstash/ratelimit';
import { Redis }     from '@upstash/redis';

const redis = new Redis({
  url:   process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// 15 syncs per user per minute
export const syncLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(15, '1 m'),
  prefix:  'rl:sync',
});

// 30 food searches per IP per minute
export const foodLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix:  'rl:food',
});

// 20 token-based step pushes per IP per minute. Generous for legit external
// clients (iOS Shortcut / Tasker), but stops a brute-force of the step token
// and the per-request DB token lookup from being hammered.
export const stepLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix:  'rl:step',
});

// 30 Sentry tunnel envelopes per IP per minute. Errors are rare in normal use
// (and the client SDK dedupes), so this is plenty — it exists to stop forged
// envelopes from flooding (and exhausting) the Sentry project quota.
export const monitoringLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  prefix:  'rl:monitoring',
});

// 20 friend-graph writes per user per minute (send / cancel / accept / decline).
// Generous enough for legitimate use, prevents scripted spam.
export const friendLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  prefix:  'rl:friend',
});

// 10 challenge writes per user per minute (create / accept / decline).
// Each create deducts coins, so abuse has cost — but a tighter limit prevents
// spam-notification annoyance to friends.
export const challengeLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  prefix:  'rl:challenge',
});
