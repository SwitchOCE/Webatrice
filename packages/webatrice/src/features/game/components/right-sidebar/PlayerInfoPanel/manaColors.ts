// The seat mana pool, in desktop order: one pip per Servatrice player counter
// (w/u/b/r/g/x/storm, server_player.cpp:96-102).
export const MANA_COLORS: Array<{
  symbol: 'W' | 'U' | 'B' | 'R' | 'G' | 'C' | 'O';
  label: string;
  tint: string;
}> = [
  { symbol: 'W', label: 'White', tint: '#f9f1c8' },
  { symbol: 'U', label: 'Blue', tint: '#3b82f6' },
  { symbol: 'B', label: 'Black', tint: '#4b5563' },
  { symbol: 'R', label: 'Red', tint: '#ef4444' },
  { symbol: 'G', label: 'Green', tint: '#10b981' },
  { symbol: 'C', label: 'Colorless', tint: '#9ca3af' },
  // 7th slot — Cockatrice's server pre-creates a "storm" counter
  // (id=7) with orange makeColor(255, 150, 30) at server_player.cpp:102;
  // the desktop UI labels it "Other" and slots it after the colorless
  // pip. We mirror both the position and the tint so muscle memory
  // carries over.
  { symbol: 'O', label: 'Other', tint: '#f97316' },
];
