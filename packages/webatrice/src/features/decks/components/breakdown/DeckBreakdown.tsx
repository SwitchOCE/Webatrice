import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CommanderSpellbookIntegration, isCommanderFormat, type BracketAssessment } from '@app/types';

import { useBracketLookupsMode } from '../../bracketConsent';
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
  /** Deck format. The bracket section renders only for the formats
   *  `isCommanderFormat` accepts (Commander and Pauper Commander). */
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
  const { t } = useTranslation();
  const stats = useMemo(() => computeDeckStats(cards), [cards]);
  // Brackets are a Commander concept. Include Pauper Commander since
  // it shares commander-designation UX; if it turns out brackets read
  // weirdly for pauper we can tighten to `format === 'commander'` only.
  // Desktop's Commander Spellbook integration set to Disabled leaves the estimate out.
  const [bracketMode] = useBracketLookupsMode();
  const showBracket = isCommanderFormat(format) && stats.totalCards > 0
    && bracketMode !== CommanderSpellbookIntegration.Disabled;

  if (stats.totalCards === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      <section>
        <SectionHeader>{t('DeckBreakdown.overview')}</SectionHeader>
        <div className="grid grid-cols-4 gap-3">
          <StatCard label={t('DeckBreakdown.stat.total')} value={stats.totalCards} />
          <StatCard label={t('DeckBreakdown.stat.nonland')} value={stats.nonlandCards} />
          <StatCard label={t('DeckBreakdown.stat.lands')} value={stats.landCount} />
          <StatCard label={t('DeckBreakdown.stat.avgCmc')} value={stats.avgNonlandCmc.toFixed(2)} />
        </div>
      </section>

      {showBracket && (
        <section>
          <SectionHeader>{t('DeckBreakdown.bracketEstimate')}</SectionHeader>
          <BracketSection
            cards={cards}
            cachedAssessment={cachedAssessment}
            onAssessmentComputed={onAssessmentComputed}
          />
        </section>
      )}

      <section>
        <SectionHeader>{t('DeckBreakdown.manaCurve')}</SectionHeader>
        <ManaCurve curve={stats.curve} />
      </section>

      <section>
        <SectionHeader>{t('DeckBreakdown.colorDistribution')}</SectionHeader>
        <ColorPie pips={stats.pips} />
      </section>

      <section>
        <SectionHeader>{t('DeckBreakdown.cardTypes')}</SectionHeader>
        <TypeBreakdown counts={stats.typeCounts} />
      </section>
    </div>
  );
}
