export const colors = {
  bg: '#061821',
  bgMid: '#0A2430',
  bgLift: '#0C2A36',
  line: 'rgba(184, 220, 230, 0.14)',
  text: '#E7F4F7',
  muted: '#8BA8B2',
  accent: '#2EC4A8',
  accentDim: 'rgba(46, 196, 168, 0.16)',
  warn: '#F0A05A',
  warnDim: 'rgba(240, 160, 90, 0.18)',
  danger: '#E86A6A',
  ok: '#7DCF8A',
  input: '#0F3342',
  black: '#000000',
};

/** Advanced-mode chrome: black field, orange mark. Untouched screens keep `colors`. */
export const advancedColors: typeof colors = {
  bg: '#0A0A0A',
  bgMid: '#141414',
  bgLift: '#1A1A1A',
  line: 'rgba(242, 106, 33, 0.22)',
  text: '#F4EDE6',
  muted: '#A89B92',
  accent: '#F26A21',
  accentDim: 'rgba(242, 106, 33, 0.16)',
  warn: '#F0A05A',
  warnDim: 'rgba(240, 160, 90, 0.18)',
  danger: '#E86A6A',
  ok: '#F26A21',
  input: '#1C1410',
  black: '#000000',
};

export function paletteForMode(simpleMode: boolean | undefined): typeof colors {
  return simpleMode === false ? advancedColors : colors;
}

/** Text sitting on the accent pill (Add / Follow / empty CTA). */
export function onAccent(simpleMode: boolean | undefined): string {
  return simpleMode === false ? '#1A0800' : '#042018';
}

export const space = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
};
