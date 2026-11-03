import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartColumn, ChevronDown, ChevronUp, Gauge, Hand } from 'lucide-react';

import { IconButton } from '@app/components';
import type { BracketAssessment } from '@app/types';
import { cx } from '@app/utils';

import type { DeckCard } from '../../types';
import { BracketSection } from '../breakdown/BracketSection';
import { DeckBreakdown, useShowsBracket } from '../breakdown/DeckBreakdown';
import { SampleHand } from './SampleHandPanel';

type DeckTool = 'stats' | 'bracket' | 'hand';

export interface DeckToolsSheetProps {
  cards: DeckCard[];
  format: string;
  isMtg: boolean;
  cachedAssessment?: BracketAssessment;
  onAssessmentComputed?: (assessment: BracketAssessment | undefined) => void;
}

export function DeckToolsSheet({ cards, format, isMtg, cachedAssessment, onAssessmentComputed }: DeckToolsSheetProps) {
  const { t } = useTranslation();
  const baseId = useId();
  const [expanded, setExpanded] = useState(true);
  const [chosen, setChosen] = useState<DeckTool>('stats');
  const showsBracket = useShowsBracket(cards, format);
  const tools: { id: DeckTool; icon: ReactNode; label: string }[] = [
    ...(isMtg ? [{ id: 'stats' as const, icon: <ChartColumn size={14} aria-hidden />, label: t('DeckEditor.tools.stats') }] : []),
    ...(showsBracket ? [{ id: 'bracket' as const, icon: <Gauge size={14} aria-hidden />, label: t('DeckBreakdown.bracketEstimate') }] : []),
    { id: 'hand', icon: <Hand size={14} aria-hidden />, label: t('SampleHand.title') },
  ];
  const tool = tools.find(({ id }) => id === chosen)?.id ?? tools[0].id;
  const panelId = `${baseId}-panel`;
  const tabId = (id: DeckTool) => `${baseId}-tab-${id}`;

  return (
    <section
      aria-label={t('DeckEditor.tools.label')}
      className="shrink-0 rounded-t-xl border-t border-border-subtle bg-bg-surface"
    >
      <div className={cx('flex h-11 items-center pl-5 pr-3', expanded && 'border-b border-border-subtle')}>
        <div role="tablist" aria-label={t('DeckEditor.tools.label')} className="flex h-full min-w-0 flex-1 gap-6">
          {tools.map(({ id, icon, label }) => {
            const selected = expanded && id === tool;
            return (
              <button
                key={id}
                id={tabId(id)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={expanded ? panelId : undefined}
                tabIndex={id === tool ? 0 : -1}
                onClick={() => {
                  setChosen(id);
                  setExpanded(true);
                }}
                className={cx(
                  'flex h-full shrink-0 items-center gap-1.5 border-b-2 text-[13px] font-medium',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                  selected ? 'border-accent text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary',
                )}
              >
                {icon}
                {label}
              </button>
            );
          })}
        </div>
        <IconButton
          size="sm"
          label={t(expanded ? 'DeckEditor.tools.collapse' : 'DeckEditor.tools.expand')}
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </IconButton>
      </div>
      {expanded && (
        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={tabId(tool)}
          className="max-h-80 overflow-y-auto px-5 pb-5 pt-4"
        >
          {tool === 'stats' && <DeckBreakdown cards={cards} />}
          {tool === 'bracket' && (
            <BracketSection cards={cards} cachedAssessment={cachedAssessment} onAssessmentComputed={onAssessmentComputed} />
          )}
          {tool === 'hand' && <SampleHand cards={cards} showImages={isMtg} />}
        </div>
      )}
    </section>
  );
}
