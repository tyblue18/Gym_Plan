'use client';

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, Copy, Check, QrCode, Gift } from 'lucide-react';
import { buildInviteUrl, INVITE_REWARD_INVITER } from '@/lib/invite';
import { trackEvent } from '@/lib/telemetry';

/**
 * Invite card shown in the Social tab. Builds the user's invite link
 * (origin + their username), shares it via the native share sheet (copy
 * fallback), and can show a QR code for in-person invites at the gym.
 * `referralCount` is how many friends have already joined via this user.
 */
export function InviteFriends({
  username,
  referralCount = 0,
}: {
  username: string;
  referralCount?: number;
}) {
  const [url,    setUrl]    = useState('');
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') setUrl(buildInviteUrl(window.location.origin, username));
  }, [username]);

  const copy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackEvent('invite_shared', { method: 'copy' });
    } catch { /* clipboard blocked — ignore */ }
  }, [url]);

  const share = useCallback(async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join me on Que',
          text:  "I track my workouts and calories on Que — join me and let's compete.",
          url,
        });
        trackEvent('invite_shared', { method: 'native' });
      } catch { /* user dismissed the share sheet */ }
    } else {
      await copy();
    }
  }, [url, copy]);

  return (
    <div className="que-card mb-4">
      <div className="px-5 pt-5 pb-4">
        <h2 className="que-section-label">
          <span className="dot" style={{ background: 'var(--accent)' }} />
          INVITE FRIENDS
        </h2>

        <p className="font-mono text-[10px] text-[var(--ink-2)] leading-relaxed mb-3">
          Share your link. When a friend joins, you both earn coins and you&apos;re instantly
          connected so you can battle.
        </p>

        <div className="flex items-center gap-1.5 mb-3 font-mono text-[10px]" style={{ color: '#FFB547' }}>
          <Gift size={12} /> +{INVITE_REWARD_INVITER} coins for every friend who joins
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={share}
            disabled={!url}
            className="que-btn-primary flex-1 flex items-center justify-center gap-1.5 py-2.5 disabled:opacity-40"
          >
            <Share2 size={14} /> Share invite
          </button>
          <button
            type="button"
            onClick={copy}
            disabled={!url}
            aria-label="Copy invite link"
            className="px-3 rounded border border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-1)] hover:border-[var(--accent)] transition-all flex items-center justify-center disabled:opacity-40"
          >
            {copied ? <Check size={15} className="text-[var(--positive)]" /> : <Copy size={15} />}
          </button>
          <button
            type="button"
            onClick={() => setShowQR(v => !v)}
            aria-label="Show QR code"
            aria-pressed={showQR}
            className={[
              'px-3 rounded border transition-all flex items-center justify-center',
              showQR
                ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-12)]'
                : 'border-[var(--line-2)] bg-[var(--bg-2)] text-[var(--ink-1)] hover:border-[var(--accent)]',
            ].join(' ')}
          >
            <QrCode size={15} />
          </button>
        </div>

        {url && <p className="font-mono text-[9px] text-[var(--ink-3)] mt-2 truncate">{url}</p>}

        {showQR && url && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="bg-white p-3 rounded-lg">
              <QRCodeSVG value={url} size={164} level="M" />
            </div>
            <p className="font-mono text-[9px] text-[var(--ink-3)]">Scan to join — perfect for the gym</p>
          </div>
        )}

        {referralCount > 0 && (
          <p className="font-mono text-[9px] text-[var(--ink-3)] mt-3">
            🎉 {referralCount} {referralCount === 1 ? 'friend has' : 'friends have'} joined with your invite
          </p>
        )}
      </div>
    </div>
  );
}
