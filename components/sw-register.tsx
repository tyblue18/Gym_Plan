'use client';

import { useEffect } from 'react';

export function SWRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(reg => {
          // Check for updates every 60 seconds while the app is open
          setInterval(() => reg.update(), 60_000);
        })
        .catch(err => {
          console.error('[SW] Registration failed:', err);
        });
    });
  }, []);

  return null;
}
