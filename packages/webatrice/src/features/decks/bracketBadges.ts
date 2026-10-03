import type { BracketSignals } from './bracket';

export type SignalTone = 'muted' | 'warn' | 'hot';

/** One of the bracket section's signal badges: its count and contributing cards. */
export interface SignalBadgeSpec {
  label: string;
  count: number;
  tone: SignalTone;
  items: string[];
}

/**
 * The five bracket-signal badges in display order, with edhpowerlevel's
 * warning thresholds: more than three Game Changers or extra turns (or
 * any chain-able extra turn) is hot; any mass land denial or early combo
 * is hot; late combos only warn.
 */
export function bracketSignalBadges(signals: BracketSignals): SignalBadgeSpec[] {
  const gcHot = signals.gameChangers.matches.length > 3;
  const gcWarn = !gcHot && signals.gameChangers.matches.length > 0;

  const turnsHot = signals.turns.matches.length > 3 || signals.turns.restricted.length > 0;
  const turnsWarn = !turnsHot && signals.turns.matches.length > 2;

  const denialHot = signals.denial.matches.length > 0 || signals.denial.restricted.length > 0;

  const earlyHot = signals.earlyCombos.length > 0;
  const lateHot = signals.lateCombos.length > 0;

  return [
    {
      label: 'Game Changers',
      count: signals.gameChangers.matches.length,
      tone: gcHot ? 'hot' : gcWarn ? 'warn' : 'muted',
      items: signals.gameChangers.matches,
    },
    {
      label: 'MLD',
      count: signals.denial.matches.length + signals.denial.restricted.length,
      tone: denialHot ? 'hot' : 'muted',
      items: [...signals.denial.matches, ...signals.denial.restricted],
    },
    {
      label: 'Extra turns',
      count: signals.turns.matches.length,
      tone: turnsHot ? 'hot' : turnsWarn ? 'warn' : 'muted',
      items: [
        ...signals.turns.matches,
        ...(signals.turns.restricted.length > 0 ? ['— chain-able:', ...signals.turns.restricted] : []),
      ],
    },
    {
      label: 'Early combos',
      count: signals.earlyCombos.length,
      tone: earlyHot ? 'hot' : 'muted',
      items: signals.earlyCombos.map((c) => c.cardNames.join(' + ')),
    },
    {
      label: 'Late combos',
      count: signals.lateCombos.length,
      tone: lateHot ? 'warn' : 'muted',
      items: signals.lateCombos.map((c) => c.cardNames.join(' + ')),
    },
  ];
}
