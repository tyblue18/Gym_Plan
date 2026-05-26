'use client';

import { useEffect } from 'react';
import {
  applyAccent, applyBg, applyTheme,
  ACCENT_KEY, BG_KEY, LIGHT_BG_KEY, THEME_KEY,
  BG_PRESETS, LIGHT_BG_PRESETS,
  type Theme,
} from '@/lib/colorScheme';

export function ColorSchemeLoader() {
  useEffect(() => {
    // Theme must be applied first — accent glow and bg-glass alpha depend on it
    const theme = (localStorage.getItem(THEME_KEY) ?? 'dark') as Theme;
    applyTheme(theme);

    const accent = localStorage.getItem(ACCENT_KEY);
    if (accent) applyAccent(accent);

    const isLight = theme === 'light';
    const bgKey   = isLight ? LIGHT_BG_KEY : BG_KEY;
    const presets = isLight ? LIGHT_BG_PRESETS : BG_PRESETS;
    const bgLabel = localStorage.getItem(bgKey);
    const preset  = presets.find(p => p.label === bgLabel) ?? (isLight ? presets[0] : undefined);
    if (preset) applyBg(preset);
  }, []);

  return null;
}
