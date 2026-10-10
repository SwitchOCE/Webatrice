import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { History, Redo2, Undo2 } from 'lucide-react';

import { deckHistoryRows, type DeckHistory, type DeckHistoryReason } from '../../deckHistory';

export interface DeckHistoryControlsProps {
  history: DeckHistory;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: (steps?: number) => void;
  onRedo: (steps?: number) => void;
}

export function DeckHistoryControls({ history, canUndo, canRedo, onUndo, onRedo }: DeckHistoryControlsProps) {
  const { t } = useTranslation();
  const [listOpen, setListOpen] = useState(false);
  const rows = deckHistoryRows(history);

  return (
    <div>
      <div className="flex items-center gap-1">
        <IconButton label={t('DeckHistory.undo')} disabled={!canUndo} onClick={() => onUndo()}>
          <Undo2 size={13} />
        </IconButton>
        <IconButton label={t('DeckHistory.redo')} disabled={!canRedo} onClick={() => onRedo()}>
          <Redo2 size={13} />
        </IconButton>
        <IconButton
          label={t('DeckHistory.history')}
          pressed={listOpen}
          disabled={!canUndo && !canRedo}
          onClick={() => setListOpen((open) => !open)}
        >
          <History size={13} />
        </IconButton>
      </div>

      {listOpen && (canUndo || canRedo) && (
        <div className="mt-2 rounded-md border border-border-subtle bg-bg-elevated text-xs">
          <p className="px-2 py-1.5 text-text-muted border-b border-border-subtle">{t('DeckHistory.hint')}</p>
          <ul className="max-h-48 overflow-y-auto py-1" aria-label={t('DeckHistory.history')}>
            {rows.redo.map((row) => (
              <li key={`redo-${row.steps}`}>
                <button
                  type="button"
                  onClick={() => onRedo(row.steps)}
                  className="w-full text-left px-2 py-0.5 text-text-muted hover:bg-border-subtle"
                >
                  {t('DeckHistory.redoEntry', { reason: reasonText(row.reason, t) })}
                </button>
              </li>
            ))}
            {rows.redo.length > 0 && rows.undo.length > 0 && (
              <li role="separator" className="my-1 border-t border-border-subtle" />
            )}
            {rows.undo.map((row) => (
              <li key={`undo-${row.steps}`}>
                <button
                  type="button"
                  onClick={() => onUndo(row.steps)}
                  className="w-full text-left px-2 py-0.5 text-text-primary hover:bg-border-subtle"
                >
                  {t('DeckHistory.undoEntry', { reason: reasonText(row.reason, t) })}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type Translate = ReturnType<typeof useTranslation>['t'];

export function reasonText(reason: DeckHistoryReason, t: Translate): string {
  const zone = (z: 'main' | 'sideboard') => t(`DeckHistory.zone.${z}`);
  switch (reason.kind) {
    case 'adjustCard':
      return reason.delta > 0
        ? t('DeckHistory.reason.added', { count: reason.delta, name: reason.name })
        : t('DeckHistory.reason.removed', { count: -reason.delta, name: reason.name });
    case 'addCard':
      return t('DeckHistory.reason.addCard', { zone: zone(reason.zone), name: reason.name });
    case 'moveCard':
      return t('DeckHistory.reason.moveCard', { count: reason.count, name: reason.name, zone: zone(reason.zone) });
    default: {
      const { kind, ...values } = reason;
      return t(`DeckHistory.reason.${kind}`, values);
    }
  }
}

function IconButton({ label, disabled, pressed, onClick, children }: {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={[
        'p-1.5 rounded-md border border-border-subtle text-text-secondary transition-colors',
        'hover:bg-bg-elevated hover:text-text-primary disabled:opacity-40 disabled:pointer-events-none',
        pressed ? 'bg-bg-elevated text-text-primary' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
