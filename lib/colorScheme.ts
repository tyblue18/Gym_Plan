// Storage keys live in lib/constants — re-exported here so existing imports
// from '@/lib/colorScheme' keep working.
export { ACCENT_KEY, BG_KEY, LIGHT_BG_KEY, THEME_KEY } from '@/lib/constants';
export type  Theme         = 'dark' | 'light';

export interface AccentSwatch { label: string; hex: string; }
export interface BgPreset     { label: string; bg0: string; bg1: string; bg2: string; bg3: string; }

export const ACCENT_SWATCHES: AccentSwatch[] = [
  { label: 'Ice Blue', hex: '#4FC3F7' },
  { label: 'Cyan',     hex: '#22D3EE' },
  { label: 'Indigo',   hex: '#818CF8' },
  { label: 'Purple',   hex: '#C084FC' },
  { label: 'Rose',     hex: '#FB7185' },
  { label: 'Amber',    hex: '#FBBF24' },
  { label: 'Lime',     hex: '#A3E635' },
  { label: 'Emerald',  hex: '#34D399' },
];

export const BG_PRESETS: BgPreset[] = [
  { label: 'Charcoal', bg0: '#07080A', bg1: '#0E0F12', bg2: '#16181D', bg3: '#1F2229' },
  { label: 'Abyss',    bg0: '#000000', bg1: '#080808', bg2: '#111111', bg3: '#1A1A1A' },
  { label: 'Warm',     bg0: '#090805', bg1: '#100F0C', bg2: '#181612', bg3: '#211E18' },
  { label: 'Navy',     bg0: '#05060F', bg1: '#090B19', bg2: '#101323', bg3: '#181C2F' },
];

export const LIGHT_BG_PRESETS: BgPreset[] = [
  { label: 'Frost',  bg0: '#F4F5F7', bg1: '#FFFFFF', bg2: '#ECEEF2', bg3: '#E0E2E8' },
  { label: 'Paper',  bg0: '#F5F1EB', bg1: '#FDFAF7', bg2: '#EDE8E1', bg3: '#E0D9CF' },
  { label: 'Slate',  bg0: '#EFF2F7', bg1: '#FFFFFF', bg2: '#E4EAF3', bg3: '#D5DDE9' },
  { label: 'Stone',  bg0: '#F4F3F0', bg1: '#FAFAF8', bg2: '#EBEBEA', bg3: '#DDDCDB' },
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shiftHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const c = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  return `#${[c(r + amount), c(g + amount), c(b + amount)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

export function applyTheme(theme: Theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#F4F5F7');
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#07080A');
  }
}

export function applyAccent(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  const lum     = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const d = document.documentElement;
  d.style.setProperty('--accent',      hex);
  d.style.setProperty('--accent-hi',   shiftHex(hex, 40));
  d.style.setProperty('--accent-lo',   shiftHex(hex, -40));
  d.style.setProperty('--accent-ink',  lum > 0.55 ? '#07080A' : '#F4F4F5');
  d.style.setProperty('--accent-12',   `rgba(${r},${g},${b},0.12)`);
  d.style.setProperty('--accent-24',   `rgba(${r},${g},${b},0.24)`);
  d.style.setProperty('--accent-40',   `rgba(${r},${g},${b},0.40)`);
  d.style.setProperty('--accent-glow', isLight
    ? `0 0 14px rgba(${r},${g},${b},0.22)`
    : `0 0 24px rgba(${r},${g},${b},0.35)`);
}

export function applyBg(preset: BgPreset) {
  const [r, g, b] = hexToRgb(preset.bg1);
  const isLight   = document.documentElement.getAttribute('data-theme') === 'light';
  const alpha     = isLight ? 0.92 : 0.86;
  const d = document.documentElement;
  d.style.setProperty('--bg-0',     preset.bg0);
  d.style.setProperty('--bg-1',     preset.bg1);
  d.style.setProperty('--bg-2',     preset.bg2);
  d.style.setProperty('--bg-3',     preset.bg3);
  d.style.setProperty('--bg-glass', `rgba(${r},${g},${b},${alpha})`);
}
