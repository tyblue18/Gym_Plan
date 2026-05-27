'use client';

import { useEffect, useState } from 'react';
import { normalizeInviteCode, INVITE_CODE_KEY } from '@/lib/invite';

interface Inviter {
  name:       string | null;
  username:   string | null;
  photo:      string | null;
  badgeCount: number;
}

/**
 * Landing-page banner for visitors who arrived via `?invite=<username>`.
 * Captures the code into localStorage (so it survives the OAuth round-trip and
 * is redeemed by <InviteRedeemer/> once they're signed in) and shows a friendly
 * "X invited you to Que" header. Renders nothing when there's no invite.
 */
export function InviteBanner() {
  const [inviter, setInviter] = useState<Inviter | null>(null);
  const [code,    setCode]    = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = normalizeInviteCode(params.get('invite'));
    const stored  = normalizeInviteCode(localStorage.getItem(INVITE_CODE_KEY));
    const active  = fromUrl ?? stored;
    if (!active) return;

    // Persist so it survives sign-in / OAuth redirect.
    if (fromUrl) localStorage.setItem(INVITE_CODE_KEY, fromUrl);
    setCode(active);

    let cancelled = false;
    fetch(`/api/invite/${encodeURIComponent(active)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: Inviter | null) => { if (!cancelled && d) setInviter(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!code) return null;

  const displayName = inviter?.name ?? (inviter?.username ? `@${inviter.username}` : 'A friend');
  const initial     = displayName.replace('@', '').charAt(0).toUpperCase() || '?';

  return (
    <div
      className="w-full flex items-center justify-center gap-3 px-4 py-2.5"
      style={{ background: 'var(--accent-12)', borderBottom: '1px solid var(--accent-24)' }}
    >
      {inviter?.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={inviter.photo} alt="" width={28} height={28}
          style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--accent)' }} />
      ) : (
        <span
          aria-hidden="true"
          style={{
            width: 28, height: 28, borderRadius: '50%', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent)', color: 'var(--accent-ink)',
            fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
          }}
        >
          {initial}
        </span>
      )}
      <p className="font-mono text-[11px] tracking-[0.3px]" style={{ color: 'var(--ink-1)' }}>
        <strong style={{ color: 'var(--accent)' }}>{displayName}</strong> invited you to Que
        {inviter && inviter.badgeCount > 0 && (
          <span style={{ color: 'var(--ink-3)' }}> · {inviter.badgeCount} badges earned</span>
        )}
      </p>
    </div>
  );
}
