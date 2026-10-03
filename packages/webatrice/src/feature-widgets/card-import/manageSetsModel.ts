import {
  defaultSetOrder,
  getSetPreference,
  setCode,
  type Set,
  type SetPreference,
  type SetPreferenceMap,
} from '@app/services';

/**
 * Pure model behind the Manage Sets dialog — desktop's `SetsModel` and the
 * move/enable actions of `WndSets` (`dlg_manage_sets.cpp`). Rows are kept in
 * art-priority order; the dialog only writes them back on Save.
 */

export interface SetRow {
  code: string;
  longName: string;
  setType: string;
  releaseDate: string;
  enabled: boolean;
  isKnown: boolean;
}

export type SetSortColumn = 'code' | 'longName' | 'setType' | 'releaseDate';

function toRow(set: Set, pref: SetPreference): SetRow {
  return {
    code: setCode(set),
    longName: set.longname?.value ?? '',
    setType: set.settype?.value ?? '',
    releaseDate: set.releasedate?.value ?? '',
    enabled: pref.enabled,
    isKnown: pref.isKnown,
  };
}

/** Rows in the user's priority order (`CardSetList::sortByKey`). */
export function buildSetRows(sets: readonly Set[], prefs: SetPreferenceMap): SetRow[] {
  return sets
    .map((set, index) => ({ set, index, pref: getSetPreference(prefs, setCode(set)) }))
    .sort((a, b) => a.pref.sortKey - b.pref.sortKey || a.index - b.index)
    .map(({ set, pref }) => toRow(set, pref));
}

/** `SetsModel::save`: sort keys become 1..n in row order. */
export function rowsToPreferences(rows: readonly SetRow[]): SetPreference[] {
  return rows.map((row, i) => ({ code: row.code, sortKey: i + 1, enabled: row.enabled, isKnown: row.isKnown }));
}

/** `SetsModel::restoreOriginalOrder` ("Default order"). */
export function restoreDefaultOrder(rows: readonly SetRow[], sets: readonly Set[]): SetRow[] {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  return defaultSetOrder(sets)
    .map((set) => byCode.get(setCode(set)))
    .filter((row): row is SetRow => Boolean(row));
}

/** `SetsDisplayModel::filterAcceptsRow`: type, long name, code or date contain the text. */
export function filterSetRows(rows: readonly SetRow[], search: string): SetRow[] {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return [...rows];
  }
  return rows.filter((row) => [row.setType, row.longName, row.code, row.releaseDate]
    .some((field) => field.toLowerCase().includes(needle)));
}

export function sortSetRows(rows: readonly SetRow[], column: SetSortColumn, ascending: boolean): SetRow[] {
  const sorted = [...rows].sort((a, b) => a[column].localeCompare(b[column]));
  return ascending ? sorted : sorted.reverse();
}

export function setEnabled(rows: readonly SetRow[], codes: ReadonlySet<string> | 'all', enabled: boolean): SetRow[] {
  return rows.map((row) => (codes === 'all' || codes.has(row.code) ? { ...row, enabled } : row));
}

function swap(rows: SetRow[], a: number, b: number): void {
  [rows[a], rows[b]] = [rows[b], rows[a]];
}

export type MoveDirection = 'top' | 'up' | 'down' | 'bottom';

/**
 * `WndSets::actUp/actDown/actTop/actBottom`. Moves act on the visible
 * (filtered) rows — each selected row swaps with its visible neighbour, as
 * desktop swaps through the display model — and return the new full order.
 */
export function moveSetRows(
  rows: readonly SetRow[],
  visibleCodes: readonly string[],
  selected: ReadonlySet<string>,
  direction: MoveDirection,
): SetRow[] {
  const next = [...rows];
  const position = (code: string) => next.findIndex((r) => r.code === code);
  const visible = [...visibleCodes];
  const selectedVisible = visible.map((code, i) => ({ code, i })).filter(({ code }) => selected.has(code));
  if (!selectedVisible.length) {
    return next;
  }

  const swapVisible = (i: number, j: number) => {
    swap(next, position(visible[i]), position(visible[j]));
    [visible[i], visible[j]] = [visible[j], visible[i]];
  };

  if (direction === 'up' || direction === 'top') {
    let target = 0;
    for (const { code } of selectedVisible) {
      let i = visible.indexOf(code);
      if (direction === 'up') {
        if (i > 0 && !selected.has(visible[i - 1])) {
          swapVisible(i, i - 1);
        }
        continue;
      }
      while (i > target) {
        swapVisible(i, i - 1);
        i -= 1;
      }
      target += 1;
    }
  } else {
    let target = visible.length - 1;
    for (const { code } of [...selectedVisible].reverse()) {
      let i = visible.indexOf(code);
      if (direction === 'down') {
        if (i < visible.length - 1 && !selected.has(visible[i + 1])) {
          swapVisible(i, i + 1);
        }
        continue;
      }
      while (i < target) {
        swapVisible(i, i + 1);
        i += 1;
      }
      target -= 1;
    }
  }
  return next;
}
