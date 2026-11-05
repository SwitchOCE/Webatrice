import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Crown, ImageOff, Layers, Minus, Plus, Trash2 } from 'lucide-react';

import { ManaSymbols, SymbolText } from '@app/components';
import { usePreference } from '@app/hooks';
import { imageCandidatesOf, selectCardFace, type PrintingSummary } from '@app/services';
import { cx } from '@app/utils';

import { describeCardDetail } from '../../cardDetail';
import { useCardDetail } from '../../hooks/useCardDetail';
import { useCardPrintings } from '../../hooks/useCardPrintings';
import { priceForCard, type PriceLookup } from '../../pricing';
import { bumpPrintingsInDeck } from '../../printingOrder';
import { upgradeScryfallImageSize } from '../../scryfallImage';
import type { DeckCard } from '../../types';
import { PrintingStrip } from '../CardSearchDock/PrintingStrip';
import { inspectedCardTargets, type InspectedCard } from './editorSelection';
import { DeckCardImage } from './DeckCardImage';

export interface DeckInspectorProps {
  selected: InspectedCard | null;
  index: number;
  deckCards: DeckCard[];
  prices: PriceLookup;
  isCommanderDeck: boolean;
  previewOnly?: boolean;
  onInc: (index: number, delta: number) => void;
  onDelete: (index: number) => void;
  onSetCommander: (index: number, isCommander: boolean) => void;
  onSetPrinting: (index: number, printing: PrintingSummary) => void;
  onChoosePreviewPrinting: (scryfallId: string | undefined) => void;
  onAdd: (name: string, zone: 'main' | 'side', scryfallId?: string) => void;
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent';

export function DeckInspector({
  selected,
  index,
  deckCards,
  prices,
  isCommanderDeck,
  previewOnly = false,
  onInc,
  onDelete,
  onSetCommander,
  onSetPrinting,
  onChoosePreviewPrinting,
  onAdd,
}: DeckInspectorProps) {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [printingsOpen, setPrintingsOpen] = useState(false);

  if (!selected) {
    return <p className="text-[12px] italic text-text-muted">{t('DeckInspector.empty')}</p>;
  }

  const row = index >= 0 ? deckCards[index] ?? null : null;
  const { card, mainIndex, sideIndex, printingIndex } = inspectedCardTargets(deckCards, selected);
  const mainCard = mainIndex >= 0 ? deckCards[mainIndex] : null;
  const price = priceForCard(prices, card);
  const imageUris = imageCandidatesOf(card)
    .map(upgradeScryfallImageSize)
    .filter((url): url is string => Boolean(url));
  const step = (zoneIndex: number, zone: 'main' | 'side', delta: number) => {
    if (zoneIndex >= 0) {
      onInc(zoneIndex, delta);
    } else {
      onAdd(card.name, zone, card.scryfallId);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-label={t('DeckInspector.title')}>
      <div
        className="aspect-[5/7] w-full overflow-hidden border border-border-subtle bg-bg-elevated"
        style={{ borderRadius: '4.75% / 3.4%' }}
      >
        <DeckCardImage urls={imageUris} alt={card.name}>
          <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-[12px] text-text-muted">
            <ImageOff size={20} />
            {t('DeckInspector.noImage')}
          </div>
        </DeckCardImage>
      </div>

      <Disclosure
        title={t('DeckInspector.cardDetails')}
        open={detailsOpen}
        onToggle={() => setDetailsOpen((open) => !open)}
        className="bg-bg-surface"
      >
        <CardDetails card={card} usd={price?.usd} previewOnly={previewOnly} />
      </Disclosure>

      <div className="flex flex-col gap-2">
        <ZoneStepper
          label={t('DeckInspector.mainDeck')}
          quantity={mainCard?.quantity ?? 0}
          decLabel={t('DeckInspector.decreaseMain', { card: card.name })}
          incLabel={t('DeckInspector.increaseMain', { card: card.name })}
          onDec={() => step(mainIndex, 'main', -1)}
          onInc={() => step(mainIndex, 'main', 1)}
        />
        <ZoneStepper
          label={t('DeckInspector.sideboard')}
          quantity={sideIndex >= 0 ? deckCards[sideIndex].quantity : 0}
          decLabel={t('DeckInspector.decreaseSide', { card: card.name })}
          incLabel={t('DeckInspector.increaseSide', { card: card.name })}
          disabled={!!mainCard?.isCommander && sideIndex < 0}
          onDec={() => step(sideIndex, 'side', -1)}
          onInc={() => step(sideIndex, 'side', 1)}
        />
      </div>

      {isCommanderDeck && mainCard && (
        <button
          type="button"
          role="switch"
          aria-checked={!!mainCard.isCommander}
          onClick={() => onSetCommander(mainIndex, !mainCard.isCommander)}
          className={cx(
            'flex h-[39px] items-center justify-between gap-2 rounded-ui-sm border border-border-subtle bg-bg-elevated px-3',
            'text-[12px] text-text-primary',
            FOCUS,
          )}
        >
          <span className="flex items-center gap-2">
            <Crown size={14} aria-hidden className={mainCard.isCommander ? 'text-warning' : 'text-text-secondary'} />
            {t('DeckEditor.rowActions.markCommander')}
          </span>
          <span
            aria-hidden
            className={cx(
              'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors',
              mainCard.isCommander ? 'bg-accent' : 'bg-bg-elevated ring-1 ring-inset ring-border-control',
            )}
          >
            <span
              className={cx(
                'absolute top-0.5 h-4 w-4 rounded-full shadow transition-all',
                mainCard.isCommander ? 'left-[18px] bg-on-accent' : 'left-0.5 bg-text-muted',
              )}
            />
          </span>
        </button>
      )}

      {price?.usd != null && price.tcgplayer && (
        <a
          href={price.tcgplayer}
          target="_blank"
          rel="noopener noreferrer"
          className={cx(
            'flex h-[35px] items-center justify-between gap-2 rounded-ui-sm border px-3',
            'border-accent/40 bg-accent-secondary/85 text-white shadow-glow hover:border-accent hover:bg-accent-secondary',
            FOCUS,
          )}
        >
          <span className="text-[14px] font-medium">{t('CardDetailDialog.buy')}</span>
          <span className="text-[14px] font-semibold tabular-nums">{t('DeckInspector.price', { price: price.usd.toFixed(2) })}</span>
        </a>
      )}

      <div className="flex flex-col gap-1.5">
        <PrintingsDisclosure
          card={card}
          deckCards={deckCards}
          open={printingsOpen}
          previewOnly={previewOnly}
          onToggle={() => setPrintingsOpen((open) => !open)}
          onChoose={(printing) => {
            if (printingIndex < 0) {
              onChoosePreviewPrinting(printing?.scryfallId);
            } else if (printing) {
              onSetPrinting(printingIndex, printing);
            }
          }}
        />
        {row && (
          <button
            type="button"
            onClick={() => onDelete(index)}
            className={cx(
              'flex h-7 items-center justify-center gap-2 rounded-ui border border-danger/50 px-3',
              'text-[12px] font-medium text-danger hover:bg-danger/10',
              FOCUS,
            )}
          >
            <Trash2 size={13} aria-hidden />
            {t(isCommanderDeck && row.isCommander ? 'DeckInspector.removeCommander' : 'DeckInspector.remove')}
          </button>
        )}
      </div>
    </section>
  );
}

function Disclosure({
  title,
  aside,
  open,
  onToggle,
  className,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  open: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  const bodyId = useId();
  return (
    <div className={cx('overflow-hidden rounded-ui border border-border-subtle', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={onToggle}
        className={cx(
          'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] font-medium text-text-secondary',
          FOCUS,
        )}
      >
        <span className="min-w-0 flex-1 text-text-primary">{title}</span>
        {aside}
        {open ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
      </button>
      {open && (
        <div id={bodyId} className="border-t border-border-subtle">
          {children}
        </div>
      )}
    </div>
  );
}

function CardDetails({ card, usd, previewOnly }: { card: DeckCard; usd?: number; previewOnly: boolean }) {
  const { t } = useTranslation();
  const { detail } = useCardDetail(previewOnly ? null : card);
  const face = selectCardFace(detail, card.name);
  const view = describeCardDetail({
    detail,
    face,
    activeName: card.name,
    liveCard: card,
    fallback: card,
  });
  const power = face?.power ?? detail?.power ?? card.power;
  const toughness = face?.toughness ?? detail?.toughness ?? card.toughness;
  const stats = power != null && toughness != null ? `${power}/${toughness}` : undefined;
  const set = (view.setCode ?? card.set)?.toUpperCase();

  return (
    <div className="flex flex-col gap-2.5 px-3 pb-3 pt-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 text-[15px] font-semibold leading-snug text-text-primary">{view.name}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums text-text-muted">
            {view.manaCost && <ManaSymbols cost={view.manaCost} size={14} />}
            {typeof view.cmc === 'number' && t('CardDetailDialog.cmc', { cmc: view.cmc })}
          </span>
        </div>
        {view.typeLine && <span className="text-[12px] leading-snug text-text-secondary">{view.typeLine}</span>}
        {(set || stats || usd != null) && (
          <div className="flex items-baseline justify-between gap-2 text-[12px] text-text-muted">
            <span>
              {set}
              {set && stats && ' · '}
              {stats}
            </span>
            {usd != null && (
              <span className="text-[13px] font-semibold tabular-nums text-success">
                {t('DeckInspector.price', { price: usd.toFixed(2) })}
              </span>
            )}
          </div>
        )}
      </div>
      {view.oracle && (
        <div className="whitespace-pre-line text-[12px] leading-relaxed text-text-primary">
          <SymbolText text={view.oracle} size={12} />
        </div>
      )}
      {view.flavor && (
        <div className="whitespace-pre-line border-t border-border-subtle pt-2.5 text-[12px] italic leading-relaxed text-text-secondary">
          <SymbolText text={view.flavor} size={12} />
        </div>
      )}
      {(view.setCode || view.collectorNumber) && (
        <div className="border-t border-border-subtle pt-2.5 text-[11px] uppercase tracking-wider text-text-muted">
          {view.setCode?.toUpperCase() ?? '?'} · #{view.collectorNumber ?? '?'}
        </div>
      )}
    </div>
  );
}

function PrintingsDisclosure({
  card,
  deckCards,
  open,
  previewOnly,
  onToggle,
  onChoose,
}: {
  card: DeckCard;
  deckCards: readonly DeckCard[];
  open: boolean;
  previewOnly: boolean;
  onToggle: () => void;
  onChoose: (printing: PrintingSummary | undefined) => void;
}) {
  const { t } = useTranslation();
  const { printings: allPrintings, loading, prices } = useCardPrintings(open && !previewOnly ? card.name : undefined);
  const bumpSetsInDeck = usePreference('bumpSetsWithCardsInDeckToTop');
  const printings = useMemo(
    () => (bumpSetsInDeck ? bumpPrintingsInDeck(allPrintings, card.name, deckCards) : allPrintings),
    [allPrintings, bumpSetsInDeck, card.name, deckCards],
  );
  return (
    <Disclosure
      title={(
        <span className="flex items-center gap-2">
          <Layers size={13} aria-hidden className="text-text-secondary" />
          {t('DeckInspector.changePrinting')}
        </span>
      )}
      aside={!loading && printings.length > 0 && (
        <span className="shrink-0 text-[11.5px] font-normal tabular-nums text-text-muted">
          {t('CardSearchDock.printings.count', { count: printings.length })}
        </span>
      )}
      open={open}
      onToggle={onToggle}
    >
      <PrintingStrip
        cardName={card.name}
        printings={printings}
        loading={loading}
        prices={prices}
        chosen={card.scryfallId}
        onChoose={(scryfallId) => onChoose(printings.find((p) => p.scryfallId === scryfallId))}
      />
    </Disclosure>
  );
}

function ZoneStepper({
  label,
  quantity,
  decLabel,
  incLabel,
  disabled,
  onDec,
  onInc,
}: {
  label: string;
  quantity: number;
  decLabel: string;
  incLabel: string;
  disabled?: boolean;
  onDec: () => void;
  onInc: () => void;
}) {
  const incrementRef = useRef<HTMLButtonElement>(null);
  const button = cx(
    'inline-flex h-full w-8 items-center justify-center text-text-secondary hover:bg-bg-elevated hover:text-text-primary',
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
    FOCUS,
  );
  return (
    <span
      className="inline-flex h-8 w-[178px] items-center overflow-hidden rounded-ui border border-border-strong"
      role="group"
      aria-label={label}
    >
      <span className="flex h-full flex-1 items-center border-r border-border-strong px-2 text-[12px] font-medium text-text-secondary">
        {label}
      </span>
      <button
        type="button"
        aria-label={decLabel}
        className={button}
        disabled={disabled || quantity === 0}
        onClick={() => {
          if (quantity === 1) {
            incrementRef.current?.focus();
          }
          onDec();
        }}
      >
        <Minus size={14} aria-hidden />
      </button>
      <span className="w-7 text-center text-[13px] font-semibold tabular-nums text-text-primary" aria-live="polite">{quantity}</span>
      <button ref={incrementRef} type="button" aria-label={incLabel} className={button} disabled={disabled} onClick={onInc}>
        <Plus size={14} aria-hidden />
      </button>
    </span>
  );
}
