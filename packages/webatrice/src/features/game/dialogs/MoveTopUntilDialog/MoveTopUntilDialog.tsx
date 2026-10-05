import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ZoneName } from '@cockatrice/sockatrice';
import { games } from '@cockatrice/datatrice';

import { useAppSelector } from '@app/store';

import { useGameDialogsContext } from '../../components/ui/GameDialogsContext';
import { useGameId } from '../../components/ui/GameIdContext';
import type { MoveTopUntilRequest } from '../../hooks/useMoveTopUntil';

const SUBMIT_BUTTON_CLASS =
  'px-3 py-1.5 rounded-md text-sm font-semibold bg-accent text-white hover:bg-accent-hover '
  + 'shadow-glow board-motion transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * "Put top cards on stack until…" (desktop aMoveTopCardsUntil): a card name
 * or search expression, the number of hits (1–99) and whether to auto play
 * them. Opened by a seat through the game dialogs; submitting starts that
 * seat's loop (useMoveTopUntil). Start stays disabled while the local
 * library is empty.
 */
export default function MoveTopUntilDialog() {
  const { moveTopUntil, closeMoveTopUntil } = useGameDialogsContext();
  if (!moveTopUntil) {
    return null;
  }
  return createPortal(
    <MoveTopUntilForm onCancel={closeMoveTopUntil} onConfirm={moveTopUntil.onSubmit} />,
    document.body,
  );
}

function MoveTopUntilForm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (request: MoveTopUntilRequest) => void;
}) {
  const gameId = useGameId();
  const deckSize = useAppSelector((state) => {
    if (gameId == null) {
      return 0;
    }
    const localPlayerId = games.Selectors.getLocalPlayerId(state, gameId);
    return localPlayerId != null
      ? games.Selectors.getZone(state, gameId, localPlayerId, ZoneName.DECK)?.cardCount ?? 0
      : 0;
  });
  const [filter, setFilter] = useState('');
  const [hitsDraft, setHitsDraft] = useState('1');
  const [autoPlay, setAutoPlay] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const parsedHits = parseInt(hitsDraft, 10);
  const validHits = Number.isFinite(parsedHits) && parsedHits >= 1 && parsedHits <= 99;
  const validFilter = filter.trim().length > 0;
  const canSubmit = validHits && validFilter && deckSize > 0;
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Put top cards on stack until"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />
      <div className="relative w-full max-w-sm rounded-lg bg-bg-surface border border-border-subtle shadow-glow overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <h2 className="font-modern text-base font-semibold text-text-primary">
            Put top cards on stack until…
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Library size: {Math.max(0, deckSize)}
          </p>
        </div>
        <form
          className="px-4 py-3 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) {
              return;
            }
            onConfirm({ filter: filter.trim(), hits: parsedHits, autoPlay });
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">
              Card name (or search expressions)
            </label>
            <input
              autoFocus
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={[
                'w-full bg-bg-base border border-border-subtle rounded-md',
                'px-3 py-2 text-sm text-text-primary',
                'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
              ].join(' ')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-text-secondary">Number of hits</label>
            <input
              type="number"
              min={1}
              max={99}
              step={1}
              value={hitsDraft}
              onChange={(e) => setHitsDraft(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className={[
                'w-full bg-bg-base border border-border-subtle rounded-md',
                'px-3 py-2 text-sm text-text-primary',
                'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
              ].join(' ')}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={autoPlay}
              onChange={(e) => setAutoPlay(e.target.checked)}
            />
            Auto play hits
          </label>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md text-sm font-medium text-text-secondary hover:bg-bg-base board-motion transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={SUBMIT_BUTTON_CLASS}
            >
              Start
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
