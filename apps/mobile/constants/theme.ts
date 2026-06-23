export const COLORS = {
  background: '#0A0E1A',
  surface: '#141B2D',
  surfaceLight: '#1E2740',
  surfaceHover: '#253352',
  primary: '#3B82F6',
  primaryLight: '#60A5FA',
  riskGreen: '#10B981',
  riskYellow: '#F59E0B',
  riskRed: '#EF4444',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  border: '#1E293B',
  borderLight: '#334155',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
} as const;

export const SPACING = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
} as const;

export const FONT_SIZES = {
  xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, display: 32,
} as const;

export const BORDER_RADIUS = {
  sm: 8, md: 12, lg: 16, xl: 20, full: 9999,
} as const;

export function riskColor(riskClass: 'green' | 'yellow' | 'red'): string {
  switch (riskClass) {
    case 'green': return COLORS.riskGreen;
    case 'yellow': return COLORS.riskYellow;
    case 'red': return COLORS.riskRed;
  }
}

export function riskLabel(riskClass: 'green' | 'yellow' | 'red'): string {
  switch (riskClass) {
    case 'green': return 'Düşük Risk';
    case 'yellow': return 'Orta Risk';
    case 'red': return 'Yüksek Risk';
  }
}
