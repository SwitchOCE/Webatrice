import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, FilterX } from 'lucide-react';

import { Checkbox, IconButton } from '@app/components';
import { isMtgFormat, MTG_FORMAT_LABELS, normalizeFormat } from '@app/types';
import { cx } from '@app/utils';

import {
  FILTER_RARITIES,
  FILTER_TYPES,
  hasActiveFilters,
  toggleFilter,
  type FilterCardType,
  type FilterColorMode,
  type FilterRarity,
  type SearchFiltersState,
} from '../../cardSearchQuery';
import { MANA_COLORS, type ManaColor } from '../../manaSymbols';
import { ChipPicker } from '../editor/ChipPicker';
import { initialDockFilters, shownColours, toggleDockColour } from './dockModel';

const PIP_BG: Record<string, string> = {
  W: 'bg-mana-w',
  U: 'bg-mana-u',
  B: 'bg-mana-b',
  R: 'bg-mana-r',
  G: 'bg-mana-g',
  C: 'bg-mana-c',
};

const COLOUR_KEYS: Record<ManaColor, string> = {
  W: 'CardSearch.color.W',
  U: 'CardSearch.color.U',
  B: 'CardSearch.color.B',
  R: 'CardSearch.color.R',
  G: 'CardSearch.color.G',
  C: 'CardSearch.color.C',
};

const MODE_KEYS: Record<FilterColorMode, string> = {
  withinIdentity: 'CardSearchDock.filter.mode.withinIdentity',
  includes: 'CardSearchDock.filter.mode.includes',
  exactly: 'CardSearchDock.filter.mode.exactly',
  atMost: 'CardSearchDock.filter.mode.atMost',
};

const TYPE_KEYS: Record<FilterCardType, string> = {
  Creature: 'CardSearch.cardType.Creature',
  Instant: 'CardSearch.cardType.Instant',
  Sorcery: 'CardSearch.cardType.Sorcery',
  Enchantment: 'CardSearch.cardType.Enchantment',
  Artifact: 'CardSearch.cardType.Artifact',
  Planeswalker: 'CardSearch.cardType.Planeswalker',
  Land: 'CardSearch.cardType.Land',
};

const RARITY_SHORT_KEYS: Record<FilterRarity, string> = {
  common: 'CardSearch.rarity.common.short',
  uncommon: 'CardSearch.rarity.uncommon.short',
  rare: 'CardSearch.rarity.rare.short',
  mythic: 'CardSearch.rarity.mythic.short',
};

const RARITY_NAME_KEYS: Record<FilterRarity, string> = {
  common: 'CardSearch.rarity.common.name',
  uncommon: 'CardSearch.rarity.uncommon.name',
  rare: 'CardSearch.rarity.rare.name',
  mythic: 'CardSearch.rarity.mythic.name',
};

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent';
const FIELD = 'rounded-ui-sm border border-border-control bg-bg-sunken text-[12px] text-text-primary';
const FILTER_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted';

function FilterChip({ label, title, on, onClick }: { label: string; title?: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={title}
      title={title}
      onClick={onClick}
      className={cx(
        'inline-flex h-6 items-center rounded-ui-sm border px-1.5 text-[11.5px] font-medium transition-colors',
        FOCUS,
        on ? 'border-accent bg-accent text-on-accent' : 'border-border-subtle text-text-secondary hover:bg-bg-elevated',
      )}
    >
      {label}
    </button>
  );
}

export function DockFilters({
  value,
  onChange,
  colorIdentity,
  format,
}: {
  value: SearchFiltersState;
  onChange: (next: SearchFiltersState) => void;
  colorIdentity?: readonly string[];
  format?: string;
}) {
  const { t } = useTranslation();
  const moreId = useId();
  const set = <K extends keyof SearchFiltersState>(key: K, v: SearchFiltersState[K]) => onChange({ ...value, [key]: v });
  const shown = shownColours(value, colorIdentity);
  const formatLabel = MTG_FORMAT_LABELS.find((f) => f.value === normalizeFormat(format))?.label(t);
  const modes: FilterColorMode[] = colorIdentity
    ? ['withinIdentity', 'includes', 'exactly', 'atMost']
    : ['includes', 'exactly', 'atMost'];

  const typeOption = (type: FilterCardType) => ({ value: type, label: t(TYPE_KEYS[type]) });

  return (
    <>
      {isMtgFormat(format) && formatLabel && (
        <div className="flex h-[35px] items-center px-4 pt-2">
          <Checkbox
            checked={value.legalOnly === true}
            onChange={(on) => set('legalOnly', on)}
            label={<span className="text-[12.5px] text-text-secondary">{t('CardSearchDock.filter.legalIn', { format: formatLabel })}</span>}
          />
        </div>
      )}
      <div className="mx-4 flex items-center gap-2 border-b border-border-subtle pb-2.5 pt-2">
        <span role="group" aria-label={t('CardSearchDock.filter.colours')} className="inline-flex items-center gap-1.5">
          {MANA_COLORS.map((c) => {
            const on = shown.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                aria-label={t(COLOUR_KEYS[c])}
                title={t(COLOUR_KEYS[c])}
                onClick={() => onChange(toggleDockColour(value, c, colorIdentity))}
                className={cx(
                  'h-[18px] w-[18px] rounded-full',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  PIP_BG[c],
                  on ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg-surface' : 'opacity-30 ring-1 ring-inset ring-border-strong',
                )}
              />
            );
          })}
        </span>
        <span className="relative ml-auto inline-flex min-w-0">
          <select
            value={value.colorMode === 'withinIdentity' && !colorIdentity ? 'includes' : value.colorMode}
            onChange={(e) => set('colorMode', e.target.value as FilterColorMode)}
            aria-label={t('CardSearchDock.filter.colourMode')}
            className={cx('h-7 min-w-0 max-w-full appearance-none truncate pl-2 pr-6', FIELD, FOCUS)}
          >
            {modes.map((m) => (
              <option key={m} value={m}>
                {t(MODE_KEYS[m])}
              </option>
            ))}
          </select>
          <ChevronDown size={12} aria-hidden className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted" />
        </span>
      </div>

      <div className="flex flex-col gap-1.5 px-4 pb-4 pt-3">
        <div className="flex items-center">
          <span className={FILTER_LABEL}>{t('CardSearchDock.filter.cardType')}</span>
          {hasActiveFilters(value) && (
            <IconButton
              size="sm"
              label={t('CardSearch.filter.clear')}
              onClick={() => onChange({ ...initialDockFilters(colorIdentity, format), showAdvanced: value.showAdvanced })}
              className="ml-auto !h-6 !w-6"
            >
              <FilterX size={13} aria-hidden />
            </IconButton>
          )}
        </div>
        <ChipPicker
          label={t('CardSearchDock.filter.types')}
          chosen={value.types.map(typeOption)}
          options={FILTER_TYPES.map(typeOption)}
          onAdd={(type) => set('types', toggleFilter(value.types, type as FilterCardType))}
          onRemove={(type) => set('types', toggleFilter(value.types, type as FilterCardType))}
          placeholder={t('CardSearchDock.filter.selectType')}
          addLabel={t('CardSearchDock.filter.addType')}
          removeLabel={(type) => t('CardSearchDock.filter.removeType', { type })}
        />
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          aria-expanded={value.showAdvanced}
          aria-controls={value.showAdvanced ? moreId : undefined}
          onClick={() => set('showAdvanced', !value.showAdvanced)}
          className={cx(
            'flex w-full items-center justify-between gap-2 border-t border-border-subtle py-3 pr-[13px]',
            'text-[12px] font-medium text-accent',
            FOCUS,
          )}
        >
          {t('CardSearchDock.filter.more')}
          {value.showAdvanced ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
        </button>

        {value.showAdvanced && (
          <div id={moreId} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className={FILTER_LABEL}>{t('CardSearchDock.filter.manaValue')}</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={value.cmcMin}
                  onChange={(e) => set('cmcMin', e.target.value)}
                  placeholder={t('CardSearchDock.filter.any')}
                  aria-label={t('CardSearchDock.filter.manaValueMin')}
                  className={cx('h-7 w-11 px-2 text-center placeholder:text-text-muted', FIELD, FOCUS)}
                />
                <span className="text-[12px] text-text-muted" aria-hidden>
                  {t('CardSearch.filter.to')}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  value={value.cmcMax}
                  onChange={(e) => set('cmcMax', e.target.value)}
                  placeholder={t('CardSearchDock.filter.any')}
                  aria-label={t('CardSearchDock.filter.manaValueMax')}
                  className={cx('h-7 w-11 px-2 text-center placeholder:text-text-muted', FIELD, FOCUS)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={FILTER_LABEL}>{t('CardSearch.filter.rarity')}</span>
              <span role="group" aria-label={t('CardSearch.filter.rarity')} className="flex gap-1">
                {FILTER_RARITIES.map((r) => (
                  <FilterChip
                    key={r}
                    label={t(RARITY_SHORT_KEYS[r])}
                    title={t(RARITY_NAME_KEYS[r])}
                    on={value.rarities.includes(r)}
                    onClick={() => set('rarities', toggleFilter(value.rarities, r))}
                  />
                ))}
              </span>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className={FILTER_LABEL}>{t('CardSearch.filter.subtype')}</span>
              <input
                type="text"
                value={value.subtype}
                onChange={(e) => set('subtype', e.target.value)}
                placeholder={t('CardSearch.filter.subtypePlaceholder')}
                className={cx('h-7 px-2 placeholder:text-text-muted', FIELD, FOCUS)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={FILTER_LABEL}>{t('CardSearch.filter.oracle')}</span>
              <input
                type="text"
                value={value.oracle}
                onChange={(e) => set('oracle', e.target.value)}
                placeholder={t('CardSearch.filter.oraclePlaceholder')}
                className={cx('h-7 px-2 placeholder:text-text-muted', FIELD, FOCUS)}
              />
            </label>
          </div>
        )}
      </div>
    </>
  );
}
