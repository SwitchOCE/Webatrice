import { memo, useCallback, useEffect, useId, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, LayoutGrid, List, Loader2, Plus, Search, X } from 'lucide-react';

import { Kbd, ManaSymbols, Segmented } from '@app/components';
import { useMenuShortcut } from '@app/feature-widgets/shortcuts';
import { cx } from '@app/utils';

import {
  searchCardArt,
  searchCardImage,
  searchCardManaCost,
  searchCardTypeLine,
  searchCardUsd,
  type ScryfallSearchCard,
} from '../../search';
import type { DeckCard } from '../../types';
import { DockFilters } from './DockFilters';
import type { DockView, DockZone, GameChangerNote } from './dockModel';
import { useCardSearchDock } from './useCardSearchDock';

export type CardSearchDockZone = DockZone;

export interface CardSearchDockProps {
  onAdd: (cardName: string, zone: CardSearchDockZone, providerId?: string) => void;
  onSelect?: (cardName: string) => void;
  onPreview?: (card: ScryfallSearchCard, providerId?: string) => void;
  onHoverPreview?: (card: ScryfallSearchCard | null, providerId?: string) => void;
  onReady?: (api: CardSearchDockApi) => void;
  colorIdentity?: readonly string[];
  format?: string;
  deckCards?: readonly DeckCard[];
  className?: string;
  headerAction?: ReactNode;
}

export interface CardSearchDockApi {
  focusSearch: () => void;
  choosePrinting: (cardName: string, scryfallId: string | undefined) => void;
}

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent';

export interface DockShortcuts {
  main?: string;
  side?: string;
}

function ShortcutTip({ label, shortcut, children }: { label: string; shortcut?: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        aria-hidden
        className={cx(
          'pointer-events-none absolute bottom-full right-0 z-30 mb-1 hidden items-center gap-2 whitespace-nowrap rounded-ui-sm',
          'border border-border-subtle bg-bg-sunken py-1 pl-2 pr-1.5 text-[11.5px] text-text-primary shadow-pop',
          'group-hover/tip:flex group-focus-within/tip:flex',
        )}
      >
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </span>
    </span>
  );
}

function AddButtons({
  card,
  onAdd,
  onFocus,
  onArt,
  disabled,
  shortcuts,
}: {
  card: ScryfallSearchCard;
  onAdd: (zone: DockZone) => void;
  onFocus: () => void;
  onArt?: boolean;
  disabled: boolean;
  shortcuts: DockShortcuts;
}) {
  const { t } = useTranslation();
  const tone = onArt
    ? 'border-transparent bg-bg-base/85 text-text-primary hover:bg-bg-elevated'
    : 'border-border-strong text-text-secondary hover:bg-bg-elevated hover:text-text-primary';
  return (
    <span className="flex shrink-0 gap-1">
      <ShortcutTip label={t('CardSearchDock.tip.main')} shortcut={shortcuts.main}>
        <button
          type="button"
          onClick={() => onAdd('main')}
          onFocus={onFocus}
          disabled={disabled}
          aria-label={t('CardSearchDock.addMain', { name: card.name })}
          className={cx('inline-flex h-7 w-7 items-center justify-center rounded-ui-sm border disabled:opacity-45', tone, FOCUS)}
        >
          <Plus size={14} aria-hidden />
        </button>
      </ShortcutTip>
      <ShortcutTip label={t('CardSearchDock.tip.side')} shortcut={shortcuts.side}>
        <button
          type="button"
          onClick={() => onAdd('side')}
          onFocus={onFocus}
          disabled={disabled}
          aria-label={t('CardSearchDock.addSide', { name: card.name })}
          className={cx(
            'inline-flex h-7 min-w-7 items-center justify-center rounded-ui-sm border px-1 text-[10.5px] font-semibold disabled:opacity-45',
            tone,
            FOCUS,
          )}
        >
          {t('CardSearchDock.sideShort')}
        </button>
      </ShortcutTip>
    </span>
  );
}

function ResultMeta({ card, inDeck }: { card: ScryfallSearchCard; inDeck: number }) {
  const { t } = useTranslation();
  const usd = searchCardUsd(card);
  return (
    <span className="truncate text-[11.5px] text-text-muted">
      {searchCardTypeLine(card)}
      {usd != null && <span className="tabular-nums"> · ${usd.toFixed(2)}</span>}
      {inDeck > 0 && <span className="text-accent"> · {t('CardSearchDock.inDeck', { count: inDeck })}</span>}
    </span>
  );
}

interface ResultProps {
  results: ScryfallSearchCard[];
  highlight: number;
  quantities: Map<string, number>;
  idFor: (i: number) => string;
  onHighlight: (i: number) => void;
  onHover?: (card: ScryfallSearchCard | null) => void;
  onAdd: (i: number, zone: DockZone) => void;
  stale: boolean;
  shortcuts: DockShortcuts;
}

interface ResultCardProps extends Pick<ResultProps, 'onHighlight' | 'onHover' | 'onAdd' | 'stale' | 'shortcuts'> {
  card: ScryfallSearchCard;
  index: number;
  id: string;
  highlighted: boolean;
  inDeck: number;
}

const ResultRow = memo(function ResultRow({
  card, index, id, highlighted, inDeck, onHighlight, onHover, onAdd, stale, shortcuts,
}: ResultCardProps) {
  const art = searchCardArt(card);
  return (
    <li
      id={id}
      aria-current={highlighted || undefined}
      onPointerEnter={onHover && (() => onHover(card))}
      onPointerLeave={onHover && (() => onHover(null))}
      className={cx(
        'flex h-[calc(var(--row-h)+14px)] items-center gap-2.5 rounded-ui-sm px-1.5',
        highlighted ? 'bg-accent/15 ring-1 ring-inset ring-accent/50' : 'hover:bg-bg-elevated',
      )}
    >
      <span className="relative h-8 w-11 shrink-0 overflow-hidden rounded-ui-sm bg-bg-sunken" aria-hidden>
        {art && <img src={art} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />}
      </span>
      <button
        type="button"
        onClick={() => onHighlight(index)}
        onFocus={() => onHighlight(index)}
        className={cx('flex min-w-0 flex-1 flex-col rounded-ui-sm text-left', FOCUS)}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-text-primary">{card.name}</span>
          <ManaSymbols cost={searchCardManaCost(card)} size={12} className="shrink-0" />
        </span>
        <ResultMeta card={card} inDeck={inDeck} />
      </button>
      <AddButtons
        card={card}
        onAdd={(zone) => onAdd(index, zone)}
        onFocus={() => onHighlight(index)}
        disabled={stale}
        shortcuts={shortcuts}
      />
    </li>
  );
});

const ResultList = memo(function ResultList({
  results, highlight, quantities, idFor, onHighlight, onHover, onAdd, stale, shortcuts,
}: ResultProps) {
  return (
    <ul className="flex flex-col gap-0.5 p-1.5">
      {results.map((card, index) => (
        <ResultRow
          key={card.id}
          card={card}
          index={index}
          id={idFor(index)}
          highlighted={index === highlight}
          inDeck={quantities.get(card.name) ?? 0}
          onHighlight={onHighlight}
          onHover={onHover}
          onAdd={onAdd}
          stale={stale}
          shortcuts={shortcuts}
        />
      ))}
    </ul>
  );
});

const ResultTile = memo(function ResultTile({
  card, index, id, highlighted, inDeck, onHighlight, onHover, onAdd, stale, shortcuts,
}: ResultCardProps) {
  const { t } = useTranslation();
  const img = searchCardImage(card);
  return (
    <li
      id={id}
      aria-current={highlighted || undefined}
      onPointerEnter={onHover && (() => onHover(card))}
      onPointerLeave={onHover && (() => onHover(null))}
      className={cx('relative overflow-hidden rounded-ui', highlighted ? 'ring-2 ring-accent' : 'ring-1 ring-border-subtle')}
    >
      <button
        type="button"
        onClick={() => onHighlight(index)}
        onFocus={() => onHighlight(index)}
        aria-label={card.name}
        className={cx('block aspect-[5/7] w-full bg-bg-sunken', FOCUS)}
      >
        {img ? (
          <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
        ) : (
          <span className="flex h-full items-center justify-center p-2 text-center text-[12px] text-text-secondary">{card.name}</span>
        )}
      </button>
      {inDeck > 0 && (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-on-accent">
          {t('CardSearchDock.inDeck', { count: inDeck })}
        </span>
      )}
      <span className="absolute bottom-1.5 right-1.5">
        <AddButtons
          card={card}
          onAdd={(zone) => onAdd(index, zone)}
          onFocus={() => onHighlight(index)}
          onArt
          disabled={stale}
          shortcuts={shortcuts}
        />
      </span>
    </li>
  );
});

const ResultGrid = memo(function ResultGrid({
  results, highlight, quantities, idFor, onHighlight, onHover, onAdd, stale, shortcuts,
}: ResultProps) {
  return (
    <ul className="grid grid-cols-2 gap-2 p-2">
      {results.map((card, index) => (
        <ResultTile
          key={card.id}
          card={card}
          index={index}
          id={idFor(index)}
          highlighted={index === highlight}
          inDeck={quantities.get(card.name) ?? 0}
          onHighlight={onHighlight}
          onHover={onHover}
          onAdd={onAdd}
          stale={stale}
          shortcuts={shortcuts}
        />
      ))}
    </ul>
  );
});

function GameChangerLine({ note }: { note: GameChangerNote }) {
  const { t } = useTranslation();
  if (note.kind === 'none') {
    return null;
  }
  const text = note.kind === 'present'
    ? t('CardSearchDock.gameChanger.present')
    : note.over
      ? t('CardSearchDock.gameChanger.over', { count: note.count })
      : note.count === note.limit
        ? t('CardSearchDock.gameChanger.atLimit', { count: note.count })
        : t('CardSearchDock.gameChanger.under', { count: note.count, limit: note.limit });
  return (
    <p className="mx-pad mb-2 flex gap-2 rounded-ui bg-info/10 px-2.5 py-2 text-[12px] leading-snug text-text-primary">
      <Info size={14} className="mt-px shrink-0 text-info" aria-hidden />
      <span>{text}</span>
    </p>
  );
}

function ViewLabel({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span className="flex items-center" title={text}>
      {icon}
      <span className="sr-only">{text}</span>
    </span>
  );
}

function ListMessage({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] text-text-muted">{children}</div>;
}

export default function CardSearchDock({
  onAdd, onSelect, onPreview, onHoverPreview, onReady, colorIdentity, format, deckCards, className, headerAction,
}: CardSearchDockProps) {
  const { t } = useTranslation();
  const dock = useCardSearchDock({ onAdd, onSelect, onPreview, colorIdentity, format, deckCards });
  const menuShortcut = useMenuShortcut();
  const inputRef = useRef<HTMLInputElement>(null);

  const baseId = useId();
  const listId = `${baseId}-results`;
  const idFor = useCallback((i: number) => `${baseId}-result-${i}`, [baseId]);
  const mainKey = menuShortcut('deck.addSearchResult');
  const sideKey = menuShortcut('deck.addSearchResultToSideboard');
  const selectedName = dock.selected?.name;

  const shortcuts = useMemo(() => ({ main: mainKey.shortcut, side: sideKey.shortcut }), [mainKey.shortcut, sideKey.shortcut]);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const { setPrintingChoice } = dock;
  useEffect(() => {
    onReadyRef.current?.({ focusSearch: () => inputRef.current?.focus(), choosePrinting: setPrintingChoice });
  }, [setPrintingChoice]);

  useEffect(() => {
    if (dock.highlight >= 0) {
      document.getElementById(`${baseId}-result-${dock.highlight}`)?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [baseId, dock.highlight]);

  const status = dock.loading
    ? t('CardSearch.searching')
    : dock.error
      ? dock.error.kind === 'badQuery'
        ? t('CardSearch.badQuery', { details: dock.error.details })
        : t('CardSearch.searchFailed')
      : dock.composedQuery
        ? t('CardSearchDock.matches', { count: dock.total })
        : '';

  const views: { value: DockView; label: ReactNode }[] = [
    { value: 'list', label: <ViewLabel icon={<List size={14} aria-hidden />} text={t('CardSearchDock.view.list')} /> },
    { value: 'art', label: <ViewLabel icon={<LayoutGrid size={14} aria-hidden />} text={t('CardSearchDock.view.art')} /> },
  ];

  const printingChoices = dock.printingChoices;
  const hoverResult = useCallback(
    (card: ScryfallSearchCard | null) => onHoverPreview?.(card, card ? printingChoices[card.name] : undefined),
    [onHoverPreview, printingChoices],
  );
  const resultsProps = {
    results: dock.results,
    highlight: dock.highlight,
    quantities: dock.quantities,
    idFor,
    onHighlight: dock.setHighlight,
    onHover: onHoverPreview ? hoverResult : undefined,
    onAdd: dock.add,
    stale: dock.stale,
    shortcuts,
  };

  return (
    <section
      aria-label={t('CardSearchDock.label')}
      className={cx('relative flex h-full min-h-0 flex-col border-r border-border-subtle bg-bg-surface', className)}
    >
      <header className="flex shrink-0 flex-col border-b border-border-subtle">
        <div className="flex h-11 items-center gap-2 px-4 pt-2">
          <h2 className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-text-primary">
            {t('CardSearchDock.title')}
          </h2>
          {headerAction}
        </div>
        <label
          className={cx(
            'mx-4 mt-2 flex h-9 items-center gap-2 rounded-ui border border-border-control bg-bg-sunken px-2.5 text-text-muted',
            'focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25',
          )}
        >
          {dock.loading ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Search size={15} aria-hidden />}
          <input
            ref={inputRef}
            type="text"
            aria-controls={listId}
            aria-keyshortcuts={[mainKey.keyShortcuts, sideKey.keyShortcuts].filter(Boolean).join(' ') || undefined}
            aria-label={t('CardSearch.label')}
            autoComplete="off"
            spellCheck={false}
            value={dock.text}
            onChange={(e) => dock.setText(e.target.value)}
            onKeyDown={dock.onKeyDown}
            placeholder={t('CardSearchDock.placeholder')}
            className={cx(
              'h-full min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-text-primary [font-variant-ligatures:none]',
              'placeholder:font-sans placeholder:text-text-muted focus:outline-none',
            )}
          />
          {dock.text && (
            <button
              type="button"
              onClick={() => {
                dock.setText('');
                inputRef.current?.focus();
              }}
              aria-label={t('CardSearchDock.clear')}
              className={cx('rounded-ui-sm p-0.5 hover:text-text-primary', FOCUS)}
            >
              <X size={13} aria-hidden />
            </button>
          )}
        </label>
        <DockFilters
          value={dock.filters}
          onChange={dock.setFilters}
          onClear={() => inputRef.current?.focus()}
          colorIdentity={colorIdentity}
          format={format}
        />
      </header>

      <div className="shrink-0 px-3">
        <div className="flex min-h-10 items-center gap-2 border-b border-border-subtle py-1.5">
          <span
            role="status"
            className={cx('min-w-0 flex-1 truncate text-[11.5px] tabular-nums', dock.error ? 'text-danger' : 'text-text-muted')}
          >
            {status}
          </span>
          <Segmented
            items={views}
            value={dock.view}
            onChange={dock.setView}
            label={t('CardSearchDock.view.label')}
            className="shrink-0"
          />
        </div>
      </div>

      <div
        id={listId}
        aria-label={t('CardSearchDock.results')}
        aria-busy={dock.stale || undefined}
        role="region"
        className={cx('relative min-h-0 flex-1 overflow-y-auto transition-opacity', dock.stale && dock.results.length > 0 && 'opacity-60')}
      >
        {dock.results.length === 0 ? (
          <ListMessage>
            {dock.loading
              ? t('CardSearch.searching')
              : dock.composedQuery
                ? dock.error ? status : t('CardSearch.noResults')
                : t('CardSearchDock.empty')}
          </ListMessage>
        ) : (
          <>
            {dock.view === 'list' ? <ResultList {...resultsProps} /> : <ResultGrid {...resultsProps} />}
            {dock.hasMore && (
              <div className="px-pad pb-3">
                <button
                  type="button"
                  onClick={dock.loadMore}
                  disabled={dock.loadingMore}
                  className={cx(
                    'flex h-8 w-full items-center justify-center gap-2 rounded-ui border border-border-subtle',
                    'text-[12px] text-text-secondary hover:bg-bg-elevated',
                    FOCUS,
                  )}
                >
                  {dock.loadingMore && <Loader2 size={13} className="animate-spin" aria-hidden />}
                  {t('CardSearchDock.loadMore', { shown: dock.results.length, total: dock.total })}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selectedName && dock.gameChanger.kind !== 'none' && (
        <div className="shrink-0 border-t border-border-subtle pt-2">
          <GameChangerLine note={dock.gameChanger} />
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {selectedName ? t('CardSearchDock.highlighted', { name: selectedName }) : ''}
      </p>
      <p className="sr-only" role="status">
        {dock.lastAdded
          ? t(dock.lastAdded.zone === 'side' ? 'CardSearchDock.addedSide' : 'CardSearchDock.addedMain', { name: dock.lastAdded.name })
          : ''}
      </p>
    </section>
  );
}
