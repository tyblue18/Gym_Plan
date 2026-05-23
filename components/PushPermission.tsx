'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff }       from 'lucide-react';

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const pad  = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64  = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw  = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export function PushPermission() {
  const [status, setStatus] = useState<'unsupported' | 'denied' | 'granted' | 'default'>('default');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setStatus('unsupported');
      return;
    }
    setStatus(Notification.permission as typeof status);
  }, []);

  if (status === 'unsupported' || status === 'granted') return null;

  async function enable() {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setStatus(permission as typeof status);
      if (permission !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      });

      await fetch('/api/push/subscribe', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(sub.toJSON()),
      });
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
