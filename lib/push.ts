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
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  webPush.setVapidDetails(
    'mailto:tanishqsomania21@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  vapidSet = true;
}

export interface PushPayload {
  title: string;
  body:  string;
  url?:  string;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  ensureVapid();
  if (!vapidSet) return;

  const subs = await ps().findMany({ where: { userId } });
  if (subs.length === 0) return;

  await Promise.allSettled(
    subs.map(async sub => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          await ps().delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    })
  );
}
