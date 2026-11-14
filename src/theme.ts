/** Remit North visual tokens: the icon's calculator navy with maple-red accents. */
export interface Palette {
  dark: boolean;
  bg: string;
  surface: string;
  surface2: string;
  line: string;
  text: string;
  dim: string;
  faint: string;
  accent: string;
  accentText: string;
  blue: string;
  violet: string;
  amber: string;
  pink: string;
  maple: string;
  good: string;
  heroFrom: string;
  heroTo: string;
  scrim: string;
}

export const DARK: Palette = {
  dark: true,
  bg: '#0A0F1C',
  surface: '#121A2B',
  surface2: '#1A2438',
  line: '#243049',
  text: '#EEF2FA',
  dim: '#93A0BA',
  faint: '#5C6884',
  accent: '#FF4D55',
  accentText: '#FFFFFF',
  blue: '#6B95FF',
  violet: '#A98BFA',
  amber: '#FFB547',
  pink: '#F472B6',
  maple: '#FF5A5F',
  good: '#2EE6A8',
  heroFrom: '#24345E',
  heroTo: '#0E1530',
  scrim: 'rgba(3, 6, 14, 0.72)',
};

export const LIGHT: Palette = {
  dark: false,
  bg: '#F4F6FB',
  surface: '#FFFFFF',
  surface2: '#EEF1F8',
  line: '#E1E6F0',
  text: '#0E1525',
  dim: '#5E6A82',
  faint: '#98A2B6',
  accent: '#E8343A',
  accentText: '#FFFFFF',
  blue: '#3D6BFF',
  violet: '#7C5CF0',
  amber: '#E59A1A',
  pink: '#E04F96',
  maple: '#E5484D',
  good: '#0FA36F',
  heroFrom: '#1F2D52',
  heroTo: '#0B1122',
  scrim: 'rgba(14, 21, 37, 0.45)',
};

export const F = {
  display: 'Unbounded_700Bold',
  displayMedium: 'Unbounded_500Medium',
  ui: 'Figtree_500Medium',
  uiSemi: 'Figtree_600SemiBold',
  uiBold: 'Figtree_700Bold',
} as const;

export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
export const RADIUS = { s: 10, m: 16, l: 22, xl: 28 } as const;
