'use client';

import { useEffect } from 'react';
import { applyAccent, applyBg, ACCENT_KEY, BG_KEY, BG_PRESETS } from '@/lib/colorScheme';

export function ColorSchemeLoader() {
  useEffect(() => {
    const accent = localStorage.getItem(ACCENT_KEY);
    if (accent) applyAccent(accent);

    const bgLabel = localStorage.getItem(BG_KEY);
    if (bgLabel) {
      const preset = BG_PRESETS.find(p => p.label === bgLabel);
      if (preset) applyBg(preset);
    }
  }, []);

  return null;
}
