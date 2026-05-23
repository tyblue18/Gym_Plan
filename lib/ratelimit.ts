import { Ratelimit } from '@upstash/ratelimit';
import { Redis }     from '@upstash/redis';

const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
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
