import { ChevronDown, ChevronUp } from 'lucide-react';

import { getScryfallSymbolUrl } from '@app/services';

import {
  FILTER_RARITIES,
  FILTER_TYPES,
  hasActiveFilters,
  toggleFilter,
  type FilterColorMode,
  type SearchFiltersState,
} from '../../cardSearchQuery';
import { MANA_COLORS, MANA_COLOR_LABEL } from '../../manaSymbols';
import { SELECT_CHEVRON_BACKGROUND } from '../../selectChevron';
import { NUMBER_INPUT_CLASS, TEXT_INPUT_CLASS } from '../editor/editorStyles';

export function CardSearchFilters({
  value,
  onChange,
  onReset,
}: {
  value: SearchFiltersState;
  onChange: (next: SearchFiltersState) => void;
  onReset: () => void;
}) {
  const set = <K extends keyof SearchFiltersState>(key: K, v: SearchFiltersState[K]) =>
    onChange({ ...value, [key]: v });

  const hasAny = hasActiveFilters(value);

  return (
    <div className="space-y-2">
      {/* Row 1: colors + mode + clear */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
          Colors
        </span>
        {MANA_COLORS.map((c) => {
          const active = value.colors.includes(c);
          return (
            <button
              key={c}
              type="button"
              onClick={() => set('colors', toggleFilter(value.colors, c))}
              className={[
                'h-6 w-6 rounded-full transition-all',
                active
                  ? 'ring-2 ring-offset-1 ring-offset-bg-surface ring-accent'
                  : 'opacity-40 hover:opacity-80',
              ].join(' ')}
              title={MANA_COLOR_LABEL[c]}
              aria-pressed={active}
            >
              <img
                src={getScryfallSymbolUrl(c)}
                alt={MANA_COLOR_LABEL[c]}
                className="w-full h-full block"
                draggable={false}
              />
            </button>
          );
        })}

        <select
          value={value.colorMode}
          onChange={(e) => set('colorMode', e.target.value as FilterColorMode)}
          className={[
            'appearance-none bg-bg-base border border-border-subtle rounded-md pl-2 pr-6 py-1',
            'text-xs text-text-primary focus:outline-none focus:border-accent transition-colors',
          ].join(' ')}
          title="Color match mode"
          style={{
            backgroundImage: SELECT_CHEVRON_BACKGROUND,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 6px center',
          }}
        >
          <option value="includes">Includes</option>
          <option value="exactly">Exactly</option>
          <option value="atMost">At most</option>
        </select>

        {hasAny && (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Row 2: types */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mr-1">
          Types
        </span>
        {FILTER_TYPES.map((t) => {
          const active = value.types.includes(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => set('types', toggleFilter(value.types, t))}
              className={[
                'px-2 py-1 rounded-md text-xs font-medium border transition-colors',
                active
                  ? 'bg-accent/20 border-accent text-text-primary'
                  : 'bg-bg-base border-border-subtle text-text-muted hover:text-text-primary hover:border-border-strong',
              ].join(' ')}
              aria-pressed={active}
            >
              {t}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => set('showAdvanced', !value.showAdvanced)}
        className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors"
      >
        {value.showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Advanced filters
      </button>

      {value.showAdvanced && (
        <div
          className="grid gap-3 pt-2 pb-1 border-t border-border-subtle"
          style={{ gridTemplateColumns: '1fr 1fr' }}
        >
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-1">
              Mana value
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={20}
                value={value.cmcMin}
                onChange={(e) => set('cmcMin', e.target.value)}
                placeholder="min"
                className={NUMBER_INPUT_CLASS}
              />
              <span className="text-xs text-text-muted">to</span>
              <input
                type="number"
                min={0}
                max={20}
                value={value.cmcMax}
                onChange={(e) => set('cmcMax', e.target.value)}
                placeholder="max"
                className={NUMBER_INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-1">
              Rarity
            </div>
            <div className="flex items-center gap-1">
              {FILTER_RARITIES.map(({ id, label }) => {
                const active = value.rarities.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => set('rarities', toggleFilter(value.rarities, id))}
                    className={[
                      'w-7 h-7 rounded-md text-xs font-semibold border transition-colors',
                      active
                        ? 'bg-accent/20 border-accent text-text-primary'
                        : 'bg-bg-base border-border-subtle text-text-muted hover:text-text-primary hover:border-border-strong',
                    ].join(' ')}
                    title={id[0].toUpperCase() + id.slice(1)}
                    aria-pressed={active}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="col-span-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-1">
              Subtype
            </div>
            <input
              type="text"
              value={value.subtype}
              onChange={(e) => set('subtype', e.target.value)}
              placeholder='e.g. Elemental, or "Human Warrior" for both'
              className={TEXT_INPUT_CLASS}
            />
          </div>

          <div className="col-span-2">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-1">
              Oracle text contains
            </div>
            <input
              type="text"
              value={value.oracle}
              onChange={(e) => set('oracle', e.target.value)}
              placeholder='e.g. "draw a card"'
              className={TEXT_INPUT_CLASS}
            />
          </div>
        </div>
      )}
    </div>
  );
}
