import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Check, CircleAlert, FolderOpen, Image as ImageIcon, LayoutTemplate, Loader2, MoreHorizontal, Pencil, Plus, Share2, Tag, Upload,
  Wallpaper,
} from 'lucide-react';

import { Chip, IconButton, IdentityPips, Menu, MenuItem, MenuSeparator, type MenuAnchor } from '@app/components';
import { DialogShell } from '@app/dialogs';
import { RouteEnum } from '@app/types';

import { tagSuggestions, type BannerCandidate } from '../../deckTags';
import type { SaveState } from '../../hooks/useDeckAutosave';
import type { PriceLookup } from '../../pricing';
import type { HydratedDeck } from '../../types';
import { FormatPicker } from '../FormatPicker';
import { BRACKET_CHIP_TONE } from '../breakdown/BracketSection';
import { ChipPicker } from './ChipPicker';
import { DeckBannerPicker } from './DeckBannerPicker';
import { DeckBuyButton } from './DeckBuyButton';
import { DeckOnlineServiceItems } from './DeckOnlineServices';
import { DeckTagsEditor } from './DeckTagsEditor';
import { useOpenDeck, type OpenDeckFlowProps } from './OpenDeckButton';

export interface DeckEditorHeaderProps {
  deck: HydratedDeck;
  saveState: SaveState;
  onRetrySave: () => void;
  totalMainboardCount: number;
  totalSideboardCount: number;
  tags: readonly string[];
  colors?: string;
  onNameChange: (name: string) => void;
  onFormatChange: (format: string) => void;
  onTagsChange: (tags: string[]) => void;
  onBannerChange: (banner: BannerCandidate | null) => void;
  onEditPlaymat: () => void;
  onExport: () => void;
  onShare?: () => void;
  openDeck: OpenDeckFlowProps;
  history: ReactNode;
  legality: ReactNode;
  prices: PriceLookup;
  pricesLoading: boolean;
  isMtg: boolean;
  bracketLevel?: number;
  trailing?: ReactNode;
  onResetLayout?: () => void;
}

export function DeckEditorHeader({
  deck,
  saveState,
  onRetrySave,
  totalMainboardCount,
  totalSideboardCount,
  tags,
  colors,
  onNameChange,
  onFormatChange,
  onTagsChange,
  onBannerChange,
  onEditPlaymat,
  onExport,
  onShare,
  openDeck,
  history,
  legality,
  prices,
  pricesLoading,
  isMtg,
  bracketLevel,
  trailing,
  onResetLayout,
}: DeckEditorHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [moreAnchor, setMoreAnchor] = useState<MenuAnchor | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  const openDeckFlow = useOpenDeck(openDeck);

  const tagOption = (tag: string) => ({ value: tag, label: tag });

  return (
    <header className="flex shrink-0 border-b border-border-subtle">
      <div className="flex min-w-0 flex-1 flex-col px-5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-subtle pb-3">
          <div className="flex min-w-0 items-center gap-1">
            <span className="inline-grid min-w-0 max-w-full">
              <span
                aria-hidden
                className={[
                  'invisible col-start-1 row-start-1 overflow-hidden whitespace-pre',
                  'font-display text-[22px] font-semibold leading-tight',
                ].join(' ')}
              >
                {deck.name || t('DeckHeader.namePlaceholder')}
              </span>
              <input
                ref={nameRef}
                type="text"
                size={1}
                value={deck.name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder={t('DeckHeader.namePlaceholder')}
                aria-label={t('DeckHeader.name')}
                className={[
                  'col-start-1 row-start-1 w-full min-w-[4rem] truncate rounded-ui-sm bg-transparent',
                  'font-display text-[22px] font-semibold leading-tight',
                  'text-text-primary placeholder:text-text-muted focus:bg-bg-elevated focus:outline-none',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
                ].join(' ')}
              />
            </span>
            <IconButton
              size="sm"
              label={t('DeckHeader.rename')}
              onClick={() => {
                nameRef.current?.focus();
                nameRef.current?.select();
              }}
            >
              <Pencil size={14} />
            </IconButton>
          </div>
          <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12px] text-text-secondary">
            <button
              type="button"
              onClick={() => navigate(RouteEnum.DECKS)}
              className={[
                'shrink-0 rounded-ui-sm hover:text-accent',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
              ].join(' ')}
            >
              {t('DeckHeader.myDecks')}
            </button>
            <span aria-hidden>·</span>
            <span className="truncate tabular-nums">
              {t('DeckHeader.cardCount', { count: totalMainboardCount })}
              {totalSideboardCount > 0 && <> · {t('DeckHeader.sideboardCount', { count: totalSideboardCount })}</>}
            </span>
            <SaveIndicator state={saveState} onRetry={onRetrySave} />
          </span>
          <div className="flex shrink-0 items-center border-l border-border-subtle pl-3">{history}</div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 pt-3">
          <div className="w-44 shrink-0">
            <FormatPicker value={deck.format} onChange={onFormatChange} variant="sidebar" />
          </div>
          {legality}
          {colors != null && <IdentityPips colours={colors} />}
          {bracketLevel != null && (
            <Chip tone={BRACKET_CHIP_TONE[bracketLevel] ?? 'neutral'} title={t('DeckHeader.bracketHint')}>
              {t('DeckBracket.bracket')} {bracketLevel} · {t(`DeckBracket.level.${bracketLevel}`)}
            </Chip>
          )}
          <div className="flex min-w-0 items-center gap-2 border-l border-border-subtle pl-3">
            <Tag size={14} aria-hidden className="shrink-0 text-text-muted" />
            <ChipPicker
              label={t('DeckTags.label')}
              chosen={tags.map(tagOption)}
              options={tagSuggestions([]).map(tagOption)}
              onAdd={(tag) => onTagsChange([...tags, tag])}
              onRemove={(tag) => onTagsChange(tags.filter((other) => other !== tag))}
              placeholder={t('DeckTags.select')}
              addLabel={t('DeckTags.addTag')}
              removeLabel={(tag) => t('DeckTags.remove', { tag })}
              chosenReason={t('DeckTags.onDeck')}
              extraItems={(close) => (
                <MenuItem
                  icon={<Plus size={13} />}
                  onSelect={() => {
                    close();
                    setTagsOpen(true);
                  }}
                >
                  {t('DeckTags.newTag')}
                </MenuItem>
              )}
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-l border-border-subtle px-5 pb-[15px] pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <IconButton label={t('DeckHeader.export')} className="border border-border-subtle" onClick={onExport}>
            <Upload size={15} />
          </IconButton>
          {onShare && (
            <IconButton label={t('DeckSharing.shareDeck')} className="border border-border-subtle" onClick={onShare}>
              <Share2 size={15} />
            </IconButton>
          )}
          <IconButton
            ref={moreRef}
            label={t('DeckHeader.more')}
            className="border border-border-subtle"
            aria-haspopup="menu"
            aria-expanded={moreAnchor != null}
            active={moreAnchor != null}
            onClick={() => setMoreAnchor(moreAnchor
              ? null
              : { rect: moreRef.current!.getBoundingClientRect(), placement: 'below', align: 'end' })}
          >
            <MoreHorizontal size={15} />
          </IconButton>
          {trailing}
        </div>
        {isMtg && <DeckBuyButton cards={deck.cards} prices={prices} loading={pricesLoading} />}
      </div>

      {moreAnchor && (
        <Menu
          anchor={moreAnchor}
          label={t('DeckHeader.more')}
          onClose={() => setMoreAnchor(null)}
          triggerRef={moreRef}
          className="w-[260px]"
        >
          {openDeck.deckId != null && (
            <MenuItem icon={<FolderOpen size={13} />} onSelect={openDeckFlow.openPicker}>
              {t('OpenDeckButton.label')}
            </MenuItem>
          )}
          <DeckOnlineServiceItems deck={deck} />
          <MenuSeparator />
          <MenuItem icon={<ImageIcon size={13} />} onSelect={() => setBannerOpen(true)}>
            {t('DeckHeader.bannerCard')}
          </MenuItem>
          <MenuItem icon={<Wallpaper size={13} />} onSelect={onEditPlaymat}>
            {t('DeckHeader.playmat')}
          </MenuItem>
          {onResetLayout && (
            <>
              <MenuSeparator />
              <MenuItem icon={<LayoutTemplate size={13} />} onSelect={onResetLayout}>
                {t('DeckHeader.resetLayout')}
              </MenuItem>
            </>
          )}
        </Menu>
      )}

      {openDeckFlow.dialogs}

      <DialogShell isOpen={tagsOpen} handleClose={() => setTagsOpen(false)} title={t('DeckHeader.editTags')}>
        <DeckTagsEditor tags={tags} onChange={onTagsChange} autoFocus />
      </DialogShell>

      <DialogShell isOpen={bannerOpen} handleClose={() => setBannerOpen(false)} title={t('DeckHeader.bannerCard')}>
        <DeckBannerPicker
          cards={deck.cards}
          bannerCard={deck.bannerCard}
          bannerCardProviderId={deck.bannerCardProviderId}
          onChange={onBannerChange}
        />
      </DialogShell>
    </header>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const { t } = useTranslation();
  switch (state) {
    case 'saving':
      return (
        <span className="inline-flex items-center gap-1 text-text-secondary" role="status">
          <Loader2 size={12} className="animate-spin" aria-hidden /> {t('DeckHeader.saving')}
        </span>
      );
    case 'dirty':
      return <span className="text-warning">{t('DeckHeader.dirty')}</span>;
    case 'saved':
      return (
        <span className="inline-flex items-center gap-1 text-success">
          <Check size={13} aria-hidden /> {t('DeckHeader.saved')}
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 text-danger" role="alert" title={t('DeckHeader.saveFailedHint')}>
          <CircleAlert size={12} /> {t('DeckHeader.saveFailed')}
          <button
            type="button"
            onClick={onRetry}
            className="underline hover:text-danger/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            {t('DeckHeader.retrySave')}
          </button>
        </span>
      );
    default:
      return null;
  }
}
