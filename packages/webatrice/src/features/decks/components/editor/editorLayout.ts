import type { CSSProperties } from 'react';

export const WIDE_EDITOR_QUERY = '(min-width: 1340px)';
export const DECK_DOCK_WIDTH = '300px';
export const DECK_INSPECTOR_WIDTH_VAR = '--deck-inspector-w';
export const DECK_INSPECTOR_DEFAULT_WIDTH = 'clamp(320px, 26vw, 420px)';

export function deckEditorGridStyle(inspectorColumn: boolean, inspectorWidth = DECK_INSPECTOR_DEFAULT_WIDTH): CSSProperties {
  return {
    [DECK_INSPECTOR_WIDTH_VAR]: inspectorWidth,
    gridTemplateColumns: inspectorColumn
      ? `${DECK_DOCK_WIDTH} minmax(0,1fr) var(${DECK_INSPECTOR_WIDTH_VAR})`
      : `${DECK_DOCK_WIDTH} minmax(0,1fr)`,
  } as CSSProperties;
}
