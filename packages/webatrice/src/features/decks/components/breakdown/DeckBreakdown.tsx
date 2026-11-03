import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CommanderSpellbookIntegration, isCommanderFormat } from '@app/types';

import { useBracketLookupsMode } from '../../bracketConsent';
import { computeDeckStats } from '../../deckStats';
import type { DeckCard } from '../../types';
import { SectionHeader, StatCard } from './BreakdownBlocks';
import { ColorBar } from './ColorBar';
import { ManaCurve } from './ManaCurve';
import { TypeBreakdown } from './TypeBreakdown';

export function useShowsBracket(cards: readonly DeckCard[], format: string): boolean {
  const [bracketMode] = useBracketLookupsMode();
  return isCommanderFormat(format) && cards.length > 0 && bracketMode !== CommanderSpellbookIntegration.Disabled;
}

export function DeckBreakdown({ cards }: { cards: DeckCard[] }) {
  const { t } = useTranslation();
  const stats = useMemo(() => computeDeckStats(cards), [cards]);

  if (stats.totalCards === 0) {
    return <p className="text-[12px] italic text-text-muted">{t('DeckBreakdown.noCards')}</p>;
  }

  return (
    <div className="flex flex-wrap gap-8">
      <div className="grid min-w-[13rem] flex-1 grid-cols-2 content-start gap-1.5">
        <StatCard label={t('DeckBreakdown.stat.total')} value={stats.totalCards} />
        <StatCard label={t('DeckBreakdown.stat.nonland')} value={stats.nonlandCards} />
        <StatCard label={t('DeckBreakdown.stat.lands')} value={stats.landCount} />
        <StatCard label={t('DeckBreakdown.stat.avgCmc')} value={stats.avgNonlandCmc.toFixed(2)} />
      </div>

      <section className="min-w-[16rem] flex-[1.4]">
        <SectionHeader>{t('DeckBreakdown.manaCurve')}</SectionHeader>
        <ManaCurve curve={stats.curve} />
      </section>

      <section className="min-w-[13rem] flex-1">
        <SectionHeader>{t('DeckBreakdown.colorDistribution')}</SectionHeader>
        <ColorBar pips={stats.pips} />
      </section>

      <section className="min-w-[13rem] flex-1">
        <SectionHeader>{t('DeckBreakdown.cardTypes')}</SectionHeader>
        <TypeBreakdown counts={stats.typeCounts} />
      </section>
    </div>
  );
}
