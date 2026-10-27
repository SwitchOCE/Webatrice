export interface BracketTone {
  text: string;
  bg: string;
  border: string;
  solidText: string;
  solidBg: string;
}

export const BRACKET_TONE: Record<number, BracketTone> = {
  1: { text: 'text-success', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', solidText: 'text-emerald-400', solidBg: 'bg-emerald-500/50' },
  2: { text: 'text-success', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', solidText: 'text-emerald-400', solidBg: 'bg-emerald-500/50' },
  3: { text: 'text-warning', bg: 'bg-yellow-500/15', border: 'border-yellow-500/40', solidText: 'text-yellow-400', solidBg: 'bg-yellow-500/50' },
  4: { text: 'text-danger', bg: 'bg-red-500/15', border: 'border-red-500/40', solidText: 'text-red-400', solidBg: 'bg-red-500/50' },
  5: { text: 'text-danger', bg: 'bg-red-500/15', border: 'border-red-500/40', solidText: 'text-red-400', solidBg: 'bg-red-500/50' },
};

const NEUTRAL_TONE_CLASS = 'text-text-secondary bg-bg-elevated border-border-subtle';

export function bracketToneClass(level: number, solid = false): string {
  const tone = BRACKET_TONE[level];
  if (!tone) {
    return NEUTRAL_TONE_CLASS;
  }
  return solid ? `${tone.solidText} ${tone.solidBg} ${tone.border}` : `${tone.text} ${tone.bg} ${tone.border}`;
}
