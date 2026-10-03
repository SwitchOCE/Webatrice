import { useMemo } from 'react';

import { isCommanderFormat, type BracketAssessment } from '@app/types';

import { computeDeckStats } from '../../deckStats';
import type { DeckCard } from '../../types';
import { BracketSection } from './BracketSection';
import { SectionHeader, StatCard } from './BreakdownBlocks';
import { ColorPie } from './ColorPie';
import { ManaCurve } from './ManaCurve';
import { TypeBreakdown } from './TypeBreakdown';

/**
 * Deck statistics under the editor's card list (MTG decks only): totals,
 * the commander bracket estimate (commander-family formats), mana curve,
 * colour distribution and card types.
 */
export function DeckBreakdown({
  cards,
  format,
  cachedAssessment,
  onAssessmentComputed,
}: {
  cards: DeckCard[];
  /** Deck format. Bracket section only renders for Commander proper
   *  (not Pauper Commander, Oathbreaker, etc. — brackets are a
   *  Commander-format concept). */
  format: string;
  /** Previously-persisted bracket assessment from the .cod. When its
   *  fingerprint matches the current deck we skip the Scryfall +
   *  Spellbook fetches and render the cached signals directly. */
  cachedAssessment?: BracketAssessment;
  /** Optional callback fired after bracket assessment resolves.
   *  DeckEditor forwards this to `setBracketAssessment` so the full
   *  assessment (level + flagged cards + fingerprint) lands in the
   *  `<bracketAssessment>` XML element, and its level mirrors into
   *  `meta.bracketLevel` for legacy consumers. */
  onAssessmentComputed?: (assessment: BracketAssessment | undefined) => void;
}) {
  const stats = useMemo(() => computeDeckStats(cards), [cards]);
  // Brackets are a Commander concept. Include Pauper Commander since
  // it shares commander-designation UX; if it turns out brackets read
  // weirdly for pauper we can tighten to `format === 'commander'` only.
  const showBracket = isCommanderFormat(format) && stats.totalCards > 0;

  if (stats.totalCards === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <section>
        <SectionHeader>Overview</SectionHeader>
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Total" value={stats.totalCards} />
          <StatCard label="Nonland" value={stats.nonlandCards} />
          <StatCard label="Lands" value={stats.landCount} />
          <StatCard label="Avg CMC" value={stats.avgNonlandCmc.toFixed(2)} />
        </div>
      </section>

      {showBracket && (
        <section>
          <SectionHeader>Bracket estimate</SectionHeader>
          <BracketSection
            cards={cards}
            cachedAssessment={cachedAssessment}
            onAssessmentComputed={onAssessmentComputed}
          />
        </section>
      )}

      <section>
        <SectionHeader>Mana curve</SectionHeader>
        <ManaCurve curve={stats.curve} />
      </section>

      <section>
        <SectionHeader>Color distribution</SectionHeader>
        <ColorPie pips={stats.pips} />
      </section>

      <section>
        <SectionHeader>Card types</SectionHeader>
        <TypeBreakdown counts={stats.typeCounts} />
      </section>
    </div>
  );
}
