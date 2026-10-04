import type { ReactElement } from 'react';

import type { GroupMode, SortMode } from './zoneViewSort';

const TOOLBAR_SELECT_CLASS =
  'px-3 py-2 rounded-md bg-bg-base border border-border-subtle text-sm text-text-primary '
  + 'focus:outline-none focus:border-accent';

export interface ZoneViewSortControlsProps {
  groupBy: GroupMode;
  sortBy: SortMode;
  onGroupByChange: (groupBy: GroupMode) => void;
  onSortByChange: (sortBy: SortMode) => void;
}

/** Desktop's group and sort boxes (view_zone_widget.cpp:234-250). */
export function ZoneViewSortControls({ groupBy, sortBy, onGroupByChange, onSortByChange }: ZoneViewSortControlsProps): ReactElement {
  return (
    <>
      <select
        value={groupBy}
        onChange={(e) => onGroupByChange(e.target.value as GroupMode)}
        className={TOOLBAR_SELECT_CLASS}
        title="Group by"
      >
        <option value="none">Ungrouped</option>
        <option value="type">Group by Type</option>
        <option value="cmc">Group by Mana Value</option>
        <option value="color">Group by Color</option>
      </select>
      <select
        value={sortBy}
        onChange={(e) => onSortByChange(e.target.value as SortMode)}
        className={TOOLBAR_SELECT_CLASS}
        title="Sort by"
      >
        <option value="none">Unsorted</option>
        <option value="name">Sort by Name</option>
        <option value="cmc">Sort by Mana Cost</option>
        <option value="type">Sort by Type</option>
        <option value="color">Sort by Color</option>
        <option value="set">Sort by Set</option>
        <option value="pt">Sort by P/T</option>
      </select>
    </>
  );
}

export interface PileViewToggleProps {
  groupBy: GroupMode;
  pileView: boolean;
  onChange: (pileView: boolean) => void;
}

/** Desktop's pile view box, which it disables while ungrouped (view_zone_widget.cpp:197). */
export function PileViewToggle({ groupBy, pileView, onChange }: PileViewToggleProps): ReactElement {
  const ungrouped = groupBy === 'none';
  return (
    <label
      className={[
        'flex items-center gap-1.5 text-xs select-none',
        ungrouped ? 'text-text-disabled cursor-not-allowed' : 'text-text-muted cursor-pointer',
      ].join(' ')}
      title={ungrouped ? 'Pile view requires a grouping' : 'Stack cards within each group'}
    >
      <input
        type="checkbox"
        checked={pileView && !ungrouped}
        disabled={ungrouped}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent"
      />
      pile view
    </label>
  );
}
