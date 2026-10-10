import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, ExternalLink, Printer } from 'lucide-react';

import { openInNewTab, printHtml, submitFormInNewTab } from '../../browserHandoff';
import {
  decklistExportUrl,
  deckPrintHtml,
  deckstatsAnalyzeForm,
  tappedOutAnalyzeForm,
  type DecklistSite,
} from '../../deckServices';
import type { HydratedDeck } from '../../types';

export interface DeckOnlineServicesProps {
  deck: HydratedDeck;
}

const ITEM_CLASS = [
  'w-full text-left inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-sm text-text-secondary',
  'hover:bg-bg-elevated hover:text-text-primary disabled:opacity-40 disabled:pointer-events-none',
].join(' ');

export function DeckOnlineServices({ deck }: DeckOnlineServicesProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const empty = deck.cards.length === 0;

  const exportDecklist = (site: DecklistSite) => {
    const url = decklistExportUrl(deck, site);
    if (url) {
      openInNewTab(url);
    }
  };

  return (
    <div className="space-y-1">
      <button
        type="button"
        className={ITEM_CLASS}
        onClick={() => printHtml(deckPrintHtml(deck, {
          main: t('DeckTools.zone.main'),
          sideboard: t('DeckTools.zone.sideboard'),
        }))}
      >
        <Printer size={13} /> {t('DeckTools.print')}
      </button>
      <button type="button" className={ITEM_CLASS} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {t('DeckTools.sendTo')}
      </button>
      {open && (
        <div className="pl-4 space-y-1">
          {empty && <p className="px-2 text-xs text-text-muted">{t('DeckTools.empty')}</p>}
          <button type="button" className={ITEM_CLASS} disabled={empty} onClick={() => exportDecklist('decklist.org')}>
            <ExternalLink size={12} /> {t('DeckTools.decklistOrg')}
          </button>
          <button type="button" className={ITEM_CLASS} disabled={empty} onClick={() => exportDecklist('decklist.xyz')}>
            <ExternalLink size={12} /> {t('DeckTools.decklistXyz')}
          </button>
          <button
            type="button"
            className={ITEM_CLASS}
            disabled={empty}
            onClick={() => submitFormInNewTab(deckstatsAnalyzeForm(deck))}
          >
            <ExternalLink size={12} /> {t('DeckTools.deckstats')}
          </button>
          <button
            type="button"
            className={ITEM_CLASS}
            disabled={empty}
            onClick={() => submitFormInNewTab(tappedOutAnalyzeForm(deck))}
          >
            <ExternalLink size={12} /> {t('DeckTools.tappedout')}
          </button>
        </div>
      )}
    </div>
  );
}
