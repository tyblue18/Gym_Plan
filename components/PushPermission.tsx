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
    if (!VAPID_KEY) return false;
    const want = urlBase64ToUint8Array(VAPID_KEY);

    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      // A subscription created with a DIFFERENT VAPID public key can never
      // receive pushes (the server signs with the matching private key). This
      // happens after the server key is rotated/corrected. Detect the mismatch
      // and drop the stale subscription so we resubscribe with the current key.
      const curBuf = sub.options?.applicationServerKey;
      const cur    = curBuf ? new Uint8Array(curBuf as ArrayBuffer) : new Uint8Array();
      const matches = cur.length === want.length && cur.every((b, i) => b === want[i]);
      if (!matches) {
        try { await sub.unsubscribe(); } catch { /* ignore */ }
        sub = null;
      }
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: want,
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

/**
 * Resolve the active SW registration, but never hang. `serviceWorker.ready`
 * can stall on mobile when no worker is controlling the page yet, which would
 * leave the enable flow stuck in its loading state forever. Race it against a
 * timeout and fall back to whatever registration already exists.
 */
async function swReady(timeoutMs = 8000): Promise<ServiceWorkerRegistration | null> {
  try {
    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs));
    const reg = await Promise.race([navigator.serviceWorker.ready, timeout]);
    return reg ?? (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
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
  // True when permission is granted but we couldn't register the push
  // subscription on the server — surfaces the failure instead of falsely
  // showing "Notifications on".
  const [error,   setError]   = useState(false);
  // Transient feedback for the "Send test" button so it isn't a silent no-op.
  const [testMsg, setTestMsg] = useState('');
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

    // If already granted, ensure the subscription is live on the server.
    // This recovers from: PWA reinstall, browser-data clear, failed first-subscribe POST.
    // If it can't re-subscribe, flag it so the UI shows a retry instead of a
    // false "Notifications on".
    if (perm === 'granted' && !didRegister.current) {
      didRegister.current = true;
      swReady()
        .then(reg => (reg ? registerSubscription(reg) : false))
        .then(ok => { if (!ok) setError(true); })
        .catch(() => setError(true));
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
    // Permission granted but the server subscription didn't take — show a retry
    // rather than a misleading "Notifications on".
    if (error) {
      return (
        <div className="flex items-center justify-between w-full gap-2">
          <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold px-0.5" style={{ color: 'var(--warn)' }}>
            <BellOff size={10} />
            Couldn&apos;t subscribe
          </span>
          <button
            onClick={retry}
            disabled={loading}
            className="font-mono text-[8px] font-bold tracking-[0.5px] uppercase px-2 py-1 rounded border border-[var(--line-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:border-[var(--line)] transition-colors disabled:opacity-40"
          >
            {loading ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between w-full gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[9px] font-bold px-0.5" style={{ color: 'var(--positive)' }}>
          <Bell size={10} />
          Notifications on
        </span>
        <button
          onClick={sendTest}
          disabled={testMsg === 'Sending…'}
          className="font-mono text-[8px] font-bold tracking-[0.5px] uppercase px-2 py-1 rounded border border-[var(--line-2)] text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:border-[var(--line)] transition-colors disabled:opacity-40"
        >
          {testMsg || 'Send test'}
        </button>
      </div>
    );
  }

  async function enable() {
    setLoading(true);
    setError(false);
    try {
      const permission = await Notification.requestPermission();
      setStatus(permission as typeof status);
      if (permission !== 'granted') return;

      // swReady() can't hang — it races serviceWorker.ready against a timeout,
      // so loading is always cleared and the button never gets stuck disabled.
      const reg = await swReady();
      const ok  = reg ? await registerSubscription(reg) : false;
      setError(!ok);
    } catch {
      // A thrown error here is a subscription failure, not a permission denial —
      // keep the real permission status and surface a retry.
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  // Re-attempt the server subscription after a failure (permission already granted).
  async function retry() {
    setLoading(true);
    setTestMsg('');
    try {
      const reg = await swReady();
      const ok  = reg ? await registerSubscription(reg) : false;
      setError(!ok);
    } finally {
      setLoading(false);
    }
  }

  // Fire a test push and report the real outcome instead of failing silently.
  // A missing subscription flips to the retry state; other failures show why.
  async function sendTest() {
    setTestMsg('Sending…');
    try {
      const res = await fetch('/api/push/test', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        setTestMsg('Sent ✓');
      } else {
        const reason = await res.json().then(d => d?.reason).catch(() => null);
        if (reason === 'no_subscription') {
          // The browser thinks it's subscribed but the server has nothing — drop
          // into the retry flow so the user can re-register.
          setError(true);
        } else if (reason === 'not_configured') {
          setTestMsg('Server not set up');
        } else {
          setTestMsg('Send failed');
        }
      }
    } catch {
      setTestMsg('Send failed');
    }
    // Clear transient messages after a few seconds so the button resets.
    setTimeout(() => setTestMsg(''), 4000);
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
