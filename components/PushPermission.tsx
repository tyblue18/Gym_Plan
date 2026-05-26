'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff }               from 'lucide-react';

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function registerSubscription(reg: ServiceWorkerRegistration): Promise<boolean> {
  try {
    // Get existing subscription or create a new one
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      if (!VAPID_KEY) return false;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      });
    }
    // Always upsert to server — handles re-installs, server-side loss, key rotation
    const res = await fetch('/api/push/subscribe', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(sub.toJSON()),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function getUnsupportedReason(): string {
  const ua  = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;

  if (ios && !isStandalone) {
    return 'Add to Home Screen for notifications';
  }
  return 'Notifications not supported';
}

export function PushPermission() {
  const [status,  setStatus]  = useState<'unsupported' | 'denied' | 'granted' | 'default'>('default');
  const [loading, setLoading] = useState(false);
  const [unsupportedMsg, setUnsupportedMsg] = useState('Install as app for notifications');
  const didRegister = useRef(false);

  useEffect(() => {
    const hasSW   = 'serviceWorker' in navigator;
    const hasNotif = 'Notification' in window;
    const hasPush  = hasSW && 'PushManager' in window;

    if (!hasSW || !hasNotif || !hasPush) {
      setUnsupportedMsg(getUnsupportedReason());
      setStatus('unsupported');
      return;
    }
    const perm = Notification.permission as typeof status;
    setStatus(perm);

    // If already granted, silently ensure the subscription is live on the server.
    // This recovers from: PWA reinstall, browser-data clear, failed first-subscribe POST.
    if (perm === 'granted' && !didRegister.current) {
      didRegister.current = true;
      navigator.serviceWorker.ready.then(reg => registerSubscription(reg)).catch(() => {});
    }
  }, []);

  if (status === 'unsupported') {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[9px] text-[var(--ink-3)] opacity-60 px-0.5">
        <BellOff size={10} />
        {unsupportedMsg}
      </span>
    );
  }

  if (status === 'granted') {
    return (
      <div className="flex items-center justify-between w-full gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold px-0.5" style={{ color: 'var(--positive)' }}>
          <Bell size={10} />
          Notifications on
        </span>
        <button
          onClick={async () => {
            await fetch('/api/push/test', { method: 'POST', credentials: 'include' });
          }}
          className="font-mono text-[8px] font-bold tracking-[0.5px] uppercase px-2 py-1 rounded border border-[var(--line-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:border-[var(--line)] transition-colors"
        >
          Send test
        </button>
      </div>
    );
  }

  async function enable() {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setStatus(permission as typeof status);
      if (permission !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;
      await registerSubscription(reg);
    } catch {
      setStatus('denied');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={enable}
      disabled={loading || status === 'denied'}
      className="flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[1px] uppercase px-2.5 py-1.5 rounded border transition-all
        border-[var(--accent)]/50 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-ink)]
        disabled:opacity-40 disabled:cursor-not-allowed"
      title={status === 'denied' ? 'Notifications blocked in browser settings' : 'Enable push notifications'}
    >
      {status === 'denied' ? <BellOff size={10} /> : <Bell size={10} />}
      {loading ? 'Enabling…' : status === 'denied' ? 'Blocked' : 'Notifications'}
    </button>
  );
}
