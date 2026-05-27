'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { INVITE_CODE_KEY, normalizeInviteCode } from '@/lib/invite';
import { trackEvent } from '@/lib/telemetry';

/**
 * Mounted inside the authenticated app shell. If the user followed an invite
 * link before signing up (a code is sitting in localStorage), this fires the
 * one-time redemption: it connects them to the inviter and awards coins to
 * both. Shows a brief celebration toast on success.
 *
 * The pending code is cleared whenever the server says it's handled (`ok` or
 * `clear`), so this never loops. A 401 (session not ready yet) keeps the code
 * for the next mount.
 */
export function InviteRedeemer() {
  const { status } = useSession();
  const firedRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated' || firedRef.current) return;

    // An already-signed-in user who followed an invite link arrives at
    // /app?invite=<code> (middleware carries the param through). Capture it into
    // localStorage and strip it from the URL so a refresh doesn't re-trigger.
    const params  = new URLSearchParams(window.location.search);
    const fromUrl = normalizeInviteCode(params.get('invite'));
    if (fromUrl) {
      localStorage.setItem(INVITE_CODE_KEY, fromUrl);
      params.delete('invite');
      const qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }

    const code = localStorage.getItem(INVITE_CODE_KEY);
    if (!code) return;
    firedRef.current = true;

    (async () => {
      try {
        const res = await fetch('/api/invite/redeem', {
          method:      'POST',
          credentials: 'include',
          headers:     { 'Content-Type': 'application/json' },
          body:        JSON.stringify({ code }),
        });
        if (res.status === 401) { firedRef.current = false; return; } // retry next mount

        const data = await res.json().catch(() => null) as
          | { ok?: boolean; clear?: boolean; inviter?: string | null; coins?: number }
          | null;

        // Any handled outcome clears the pending code so we don't retry forever.
        if (data?.ok || data?.clear || res.ok) localStorage.removeItem(INVITE_CODE_KEY);

        if (data?.ok) {
          trackEvent('invite_redeemed');
          const who = data.inviter ? `You're now friends with ${data.inviter}` : "You're connected";
          setToast(`${who}! ${data.coins ? `+${data.coins} coins 🪙` : ''}`.trim());
          setTimeout(() => setToast(null), 5000);
        }
      } catch {
        firedRef.current = false; // network hiccup — allow a later retry
      }
    })();
  }, [status]);

  if (!toast) return null;

  return (
    <div
      role="status"
      className="fixed left-1/2 -translate-x-1/2 z-[600] px-4 py-3 rounded-lg font-mono text-[11px] font-bold tracking-[0.5px] shadow-lg"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
        background: 'var(--accent)',
        color: 'var(--accent-ink)',
        boxShadow: '0 0 0 1px var(--accent), 0 8px 28px var(--accent-24)',
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      {toast}
    </div>
  );
}
