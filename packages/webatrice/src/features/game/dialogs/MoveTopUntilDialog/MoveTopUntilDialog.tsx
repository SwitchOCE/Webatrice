import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ZoneName } from '@cockatrice/sockatrice';
import { games } from '@cockatrice/datatrice';

import { DialogShell } from '@app/dialogs';
import { useAppSelector } from '@app/store';

import { useGameDialogsContext } from '../../components/ui/GameDialogsContext';
import { useGameId } from '../../components/ui/GameIdContext';
import type { MoveTopUntilRequest } from '../../hooks/useMoveTopUntil';

const SUBMIT_BUTTON_CLASS =
  'px-3 py-1.5 rounded-md text-sm font-semibold bg-accent text-white hover:bg-accent-hover '
  + 'shadow-glow transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const FIELD_CLASS = [
  'w-full bg-bg-base border border-border-subtle rounded-md',
  'px-3 py-2 text-sm text-text-primary',
  'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
].join(' ');

/**
 * "Put top cards on stack until…" (desktop aMoveTopCardsUntil,
 * dlg_move_top_cards_until.cpp): a card name or search expression, the
 * number of hits (1–99) and whether to auto play them. Opened by a seat
 * through the game dialogs; submitting starts that seat's loop
 * (useMoveTopUntil). Start stays disabled while the local library is empty.
 * Built on DialogShell, so focus starts in the filter, Tab stays inside,
 * Escape cancels and focus returns to where it was.
 */
export default function MoveTopUntilDialog() {
  const { moveTopUntil, closeMoveTopUntil } = useGameDialogsContext();
  if (!moveTopUntil) {
    return null;
  }
  return <MoveTopUntilForm onCancel={closeMoveTopUntil} onConfirm={moveTopUntil.onSubmit} />;
}

function MoveTopUntilForm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (request: MoveTopUntilRequest) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const filterId = useId();
  const hitsId = useId();
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
  const parsedHits = parseInt(hitsDraft, 10);
  const validHits = Number.isFinite(parsedHits) && parsedHits >= 1 && parsedHits <= 99;
  const validFilter = filter.trim().length > 0;
  const canSubmit = validHits && validFilter && deckSize > 0;
  return (
    <DialogShell
      isOpen
      handleClose={onCancel}
      title={t('MoveTopUntilDialog.title')}
      description={t('MoveTopUntilDialog.librarySize', { count: Math.max(0, deckSize) })}
      maxWidth="max-w-sm"
      footer={(
        <>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-sm font-medium text-text-secondary hover:bg-bg-base transition-colors"
          >
            {t('MoveTopUntilDialog.cancel')}
          </button>
          <button type="submit" form={formId} disabled={!canSubmit} className={SUBMIT_BUTTON_CLASS}>
            {t('MoveTopUntilDialog.start')}
          </button>
        </>
      )}
    >
      <form
        id={formId}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) {
            return;
          }
          onConfirm({ filter: filter.trim(), hits: parsedHits, autoPlay });
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={filterId} className="text-xs text-text-secondary">
            {t('MoveTopUntilDialog.filter')}
          </label>
          <input
            id={filterId}
            autoFocus
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={FIELD_CLASS}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={hitsId} className="text-xs text-text-secondary">{t('MoveTopUntilDialog.hits')}</label>
          <input
            id={hitsId}
            type="number"
            min={1}
            max={99}
            step={1}
            value={hitsDraft}
            onChange={(e) => setHitsDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className={FIELD_CLASS}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={autoPlay}
            onChange={(e) => setAutoPlay(e.target.checked)}
          />
          {t('MoveTopUntilDialog.autoPlay')}
        </label>
      </form>
    </DialogShell>
  );
}
