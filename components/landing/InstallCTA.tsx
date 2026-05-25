'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Share, Plus, MoreHorizontal } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface Props {
  className?: string;
  label?: string;
}

const STEPS = [
  {
    icon: Share,
    text: (
      <>
        Tap the <strong>Share</strong> button at the bottom of Safari{' '}
        <span className="ios-guide-share-icon" aria-hidden="true">
          <ShareBoxIcon />
        </span>
      </>
    ),
  },
  {
    icon: Plus,
    text: (
      <>
        Scroll down and tap <strong>Add to Home Screen</strong>
      </>
    ),
  },
  {
    icon: MoreHorizontal,
    text: (
      <>
        Tap <strong>Add</strong> in the top-right corner
      </>
    ),
  },
] as const;

function ShareBoxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle' }}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function IOSGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="ios-guide-overlay" onClick={onClose}>
      <div className="ios-guide-sheet" onClick={e => e.stopPropagation()}>
        <div className="ios-guide-header">
          <span className="ios-guide-title">Add to Home Screen</span>
          <button type="button" className="ios-guide-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <p className="ios-guide-sub">
          Install Que on your iPhone for the full app experience — open it like any app, works offline.
        </p>

        <ol className="ios-guide-steps">
          {STEPS.map(({ icon: Icon, text }, i) => (
            <li key={i} className="ios-guide-step">
              <div className="ios-guide-step-num">{i + 1}</div>
              <div className="ios-guide-step-icon">
                <Icon size={14} />
              </div>
              <p className="ios-guide-step-text">{text}</p>
            </li>
          ))}
        </ol>

        <div className="ios-guide-note">
          Make sure you&apos;re using <strong>Safari</strong> — Chrome and other browsers on iOS don&apos;t support installation.
        </div>
      </div>
    </div>
  );
}

export function InstallCTA({ className, label = 'Get started free' }: Props) {
  const [prompt, setPrompt]       = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS]         = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }

    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(ios);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) {
    return <Link href="/app" className={className}>Open app</Link>;
  }

  if (prompt) {
    return (
      <button
        type="button"
        className={className}
        onClick={async () => {
          await prompt.prompt();
          const { outcome } = await prompt.userChoice;
          if (outcome === 'accepted') setInstalled(true);
          setPrompt(null);
        }}
      >
        Install app
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button type="button" className={className} onClick={() => setShowGuide(true)}>
          Add to Home Screen
        </button>
        {showGuide && <IOSGuideModal onClose={() => setShowGuide(false)} />}
      </>
    );
  }

  return <Link href="/auth/signin" className={className}>{label}</Link>;
}
