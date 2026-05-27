import webPush from 'web-push';
import { prisma } from '@/lib/prisma';

type PushSubClient = {
  findMany: (args: { where: { userId: string } }) => Promise<Array<{ id: string; endpoint: string; p256dh: string; auth: string }>>;
  delete:   (args: { where: { id: string } })     => Promise<unknown>;
};
const ps = () => (prisma as unknown as { pushSubscription: PushSubClient }).pushSubscription;

let vapidSet = false;

function ensureVapid() {
  if (vapidSet) return;
  // NEXT_PUBLIC_VAPID_PUBLIC_KEY is the env var defined in Vercel — the old
  // VAPID_PUBLIC_KEY alias was only present in .env.local, causing production
  // to silently skip VAPID setup and drop every outgoing push.
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  if (!pub || !process.env.VAPID_PRIVATE_KEY) return;
  webPush.setVapidDetails(
    'mailto:tanishqsomania21@gmail.com',
    pub,
    process.env.VAPID_PRIVATE_KEY,
  );
  vapidSet = true;
}

export interface PushPayload {
  title: string;
  body:  string;
  url?:  string;
  /** Notification tag — same tag replaces a prior notification of that kind
   *  instead of stacking. Defaults to 'que' in the service worker. */
  tag?:  string;
}

/** Outcome of a send attempt — lets callers (e.g. the test endpoint) report
 *  exactly why a push did or didn't go out instead of failing silently. */
export interface PushSendResult {
  configured: boolean;  // VAPID keys present on the server
  total:      number;   // subscriptions found for the user
  sent:       number;   // pushes the push service accepted
  failed:     number;   // pushes that errored (expired subs are pruned)
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushSendResult> {
  ensureVapid();
  if (!vapidSet) return { configured: false, total: 0, sent: 0, failed: 0 };

  const subs = await ps().findMany({ where: { userId } });
  if (subs.length === 0) return { configured: true, total: 0, sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  await Promise.allSettled(
    subs.map(async sub => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (err: unknown) {
        failed++;
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          await ps().delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    })
  );
  return { configured: true, total: subs.length, sent, failed };
}
