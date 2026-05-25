'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useApp } from '@/lib/AppContext';
import { CloudUpload, X } from 'lucide-react';

const DISMISSED_KEY = 'queSyncNudgeDismissed';
const RESHOW_DAYS   = 7;

function isDismissed(): boolean {
  try {
    const ts = localStorage.getItem(DISMISSED_KEY);
    if (!ts) return false;
    return Date.now() - parseInt(ts) < RESHOW_DAYS * 86_400_000;
  } catch { return false; }
}

function dismiss() {
  try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* noop */ }
}

function hasLocalData(localDB: Record<string, unknown>): boolean {
  return Object.keys(localDB).length > 0;
}

export function SyncNudge() {
  const { status }   = useSession();
  const { localDB }  = useApp();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (status !== 'unauthenticated') return;
    if (isDismissed()) return;
    if (!hasLocalData(localDB as Record<string, unknown>)) return;
    setShow(true);
  }, [status, localDB]);

  if (!show) return null;

  return (
    <div className="sync-nudge" role="status">
      <CloudUpload size={15} className="sync-nudge-icon" aria-hidden="true" />
      <p className="sync-nudge-text">
        <strong>Back up your data</strong> — sign in to sync across devices and never lose your logs.
      </p>
      <a href="/auth/signin" className="sync-nudge-cta">Sign in</a>
      <button
        type="button"
        className="sync-nudge-close"
        aria-label="Dismiss"
        onClick={() => { dismiss(); setShow(false); }}
      >
        <X size={13} />
      </button>
    </div>
  );
}
