import { Fragment, type ReactElement, type ReactNode } from 'react';

import { CARD_HEIGHT, CARD_WIDTH } from '../../components/ui/SeatCard/cardSize';
import { PILE_STEP_FRACTION, type PilePlace } from './ZoneCardCell';
import type { CardGroup, EnrichedCard } from './zoneViewSort';

export interface ZoneCardGroupsProps {
  groups: readonly CardGroup[];
  /** Desktop's pile view (view_zone_widget.cpp:64,197): one fanned column per group. A wrapping grid per group otherwise. */
  pile: boolean;
  /** Draws one card, usually a `ZoneCardCell`; `pile` is set when it sits in a pile. */
  renderCell: (card: EnrichedCard, group: CardGroup, pile?: PilePlace) => ReactNode;
}

/** A zone view's cards, group by group under each group's label and count. */
export function ZoneCardGroups({ groups, pile, renderCell }: ZoneCardGroupsProps): ReactElement {
  return (
    <div className={pile ? 'flex gap-3 items-start' : 'flex flex-col gap-6'}>
      {groups.map((g) => (
        <div key={g.key} className={pile ? 'shrink-0' : ''} style={pile ? { width: CARD_WIDTH } : undefined}>
          {/* An ungrouped view's single group has no label. */}
          {g.label && (
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5 select-none">
              {g.label} <span className="text-text-muted normal-case">({g.cards.length})</span>
            </div>
          )}
          {pile ? (
            <div
              className="relative"
              style={{
                width: CARD_WIDTH,
                height: `calc(${CARD_HEIGHT} + ${Math.max(0, g.cards.length - 1)} * calc(${CARD_HEIGHT} * ${PILE_STEP_FRACTION}))`,
              }}
            >
              {g.cards.map((c, index) => (
                <Fragment key={c.handCard.id}>
                  {renderCell(c, g, { index, isLast: index === g.cards.length - 1 })}
                </Fragment>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {g.cards.map((c) => <Fragment key={c.handCard.id}>{renderCell(c, g)}</Fragment>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
