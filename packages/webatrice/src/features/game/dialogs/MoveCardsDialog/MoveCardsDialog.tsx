import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ZoneName } from '@cockatrice/sockatrice';
import type { ServerInfo_Card } from '@cockatrice/sockatrice/generated';
import { games } from '@cockatrice/datatrice';

import { DialogShell } from '@app/dialogs';
import { usePreference } from '@app/hooks';
import { useAppSelector } from '@app/store';

import { useGameId } from '../../components/ui/GameIdContext';
import { useBattlefieldGeometryRegistry, type BattlefieldGeometry } from '../../components/ui/BattlefieldGeometryContext';
import { BATTLEFIELD_MIN_COLS } from '../../components/battlefield/Battlefield/battlefieldLayout';
import { ROW_COUNT, getStackColumn, nextAvailableColumn } from '../../components/battlefield/Battlefield/gridMath';
import { cardFocusFallback } from '../../components/ui/SeatCard/useCardFocus';
import { seatDragOwner, type SeatDragSource, type SeatDropTarget } from '../../hooks/seatDropPlan';
import {
  battlefieldRows,
  moveDestinations,
  moveTarget,
  positionCount,
  type MoveBoard,
  type MoveDestination,
} from './moveCardsTarget';

export interface MoveCardsRequest {
  /** The cards to move, as a drag of them would carry them. */
  source: SeatDragSource;
  /** The card's name when one card moves. */
  name: string;
}

const SUBMIT_BUTTON_CLASS =
  'px-3 py-1.5 rounded-md text-sm font-semibold bg-accent text-white hover:bg-accent-hover '
  + 'shadow-glow board-motion transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

const FIELD_CLASS = [
  'w-full bg-bg-base border border-border-subtle rounded-md',
  'px-3 py-2 text-sm text-text-primary',
  'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent',
].join(' ');

/** A board with no published grid (not on screen): its rows' columns as
 *  the layout reserves them, one past the last card, at least the minimum. */
function fallbackGeometry(cards: readonly ServerInfo_Card[]): BattlefieldGeometry {
  const colsByWireRow = Array.from({ length: ROW_COUNT }, (_, row) => {
    const last = Math.max(-1, ...cards.filter((c) => (c.y ?? 0) === row).map((c) => getStackColumn(c.x ?? 0)));
    return Math.max(BATTLEFIELD_MIN_COLS, last + 2);
  });
  return { rows: ROW_COUNT, cols: Math.max(...colsByWireRow), colsByWireRow };
}

const destinationKey = (d: MoveDestination) => (d.zone === 'battlefield' ? `battlefield:${d.playerId}` : d.zone);

/** The board as the dialog needs it: seated players, the owner's hand order
 *  and zone sizes, and each battlefield's drop grid as its board publishes
 *  it (the grid a drop resolves against). */
function useMoveBoard(ownerId: number): MoveBoard & { firstFreeColumn: (playerId: number, row: number) => number } {
  const gameId = useGameId();
  const geometry = useBattlefieldGeometryRegistry();
  const seated = useAppSelector((state) => (gameId != null ? games.Selectors.getSeatedPlayers(state, gameId) : undefined));
  const zones = useAppSelector((state) => (gameId != null ? games.Selectors.getGame(state, gameId)?.players : undefined));
  return useMemo(() => {
    const zoneOf = (playerId: number, name: string) => zones?.[playerId]?.zones[name];
    const tableCards = (playerId: number): ServerInfo_Card[] => {
      const table = zoneOf(playerId, ZoneName.TABLE);
      return table ? table.order.map((id) => table.byId[id]).filter((c): c is ServerInfo_Card => c != null) : [];
    };
    return {
      players: (seated ?? []).map((p) => ({
        playerId: p.properties.playerId,
        name: p.properties.userInfo?.name ?? `Player ${p.properties.playerId}`,
      })),
      // The hand strip shows the hand in its zone order (zoneToSeatCards).
      handOrder: (zoneOf(ownerId, ZoneName.HAND)?.order ?? []).map(String),
      stackSize: zoneOf(ownerId, ZoneName.STACK)?.cardCount ?? 0,
      deckSize: zoneOf(ownerId, ZoneName.DECK)?.cardCount ?? 0,
      geometry: (playerId) => geometry?.get(playerId) ?? fallbackGeometry(tableCards(playerId)),
      // Where a new column starts in a row, 1-based: the default column.
      firstFreeColumn: (playerId, row) => nextAvailableColumn(tableCards(playerId), row) + 1,
    };
  }, [seated, zones, ownerId, geometry]);
}

/**
 * "Move to…" from the keyboard (M on a card): every move a drag can make,
 * with the zone, a battlefield of any player, and the position chosen in
 * fields instead of by the pointer. Desktop has no keyboard move; its drag
 * is the reference for what may go where (planSeatMove), and the chosen
 * move is sent as a drop there would be. Built on DialogShell: focus starts
 * in the destination, Escape cancels and focus goes back to the card.
 */
export default function MoveCardsDialog({
  request,
  onCancel,
  onMove,
}: {
  request: MoveCardsRequest;
  onCancel: () => void;
  onMove: (target: SeatDropTarget) => void;
}) {
  const { t } = useTranslation();
  const formId = useId();
  const destinationId = useId();
  const rowId = useId();
  const positionId = useId();
  const { source } = request;
  const board = useMoveBoard(seatDragOwner(source));
  const gameId = useGameId();
  const judge = useAppSelector((state) => (gameId != null ? games.Selectors.getJudge(state, gameId) : false));
  const inverted = usePreference('invertVerticalCoordinate');
  const rows = battlefieldRows(inverted);
  const destinations = moveDestinations(source, board.players, { judge });

  const [destinationChoice, setDestinationChoice] = useState<string | null>(null);
  const destination = destinations.find((d) => destinationKey(d) === destinationChoice) ?? destinations[0];
  const startRow = source.zone === 'battlefield' ? source.cards[0]?.slot?.row : undefined;
  const [row, setRow] = useState(startRow ?? rows.find((r) => r.kind === 'creatures')!.row);
  const max = destination ? positionCount(destination, source, board, row) : 0;
  // A battlefield defaults to the row's first free column, the hand and the
  // stack to the end, the library to its top.
  const [positionDraft, setPositionDraft] = useState<string | null>(null);
  const defaultPosition = destination?.zone === 'library'
    ? 1
    : destination?.zone === 'battlefield'
      ? Math.min(max, board.firstFreeColumn(destination.playerId, row))
      : max;
  const position = positionDraft == null ? defaultPosition : parseInt(positionDraft, 10);
  const hasPosition = max > 0;
  const validPosition = !hasPosition || (Number.isInteger(position) && position >= 1 && position <= max);
  const playerName = (playerId: number) => board.players.find((p) => p.playerId === playerId)?.name ?? '';

  const label = (d: MoveDestination) => (d.zone === 'battlefield'
    ? t('MoveCardsDialog.battlefieldOf', { name: playerName(d.playerId) })
    : t(`MoveCardsDialog.zone.${d.zone}`));

  const positionLabel = (() => {
    switch (destination?.zone) {
      case 'battlefield':
        return t('MoveCardsDialog.column', { max });
      case 'library':
        return t('MoveCardsDialog.libraryPosition', { max });
      default:
        return t('MoveCardsDialog.position', { max });
    }
  })();

  return (
    <DialogShell
      isOpen
      handleClose={onCancel}
      title={t('MoveCardsDialog.title', { count: source.cards.length, name: request.name })}
      maxWidth="max-w-sm"
      // The card has usually gone when this closes: focus goes to its zone's
      // nearest card that stayed, else the next tab stop.
      returnFocusTo={cardFocusFallback}
      footer={(
        <>
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-md text-sm font-medium text-text-secondary hover:bg-bg-base board-motion transition-colors"
          >
            {t('MoveCardsDialog.cancel')}
          </button>
          <button type="submit" form={formId} disabled={!destination || !validPosition} className={SUBMIT_BUTTON_CLASS}>
            {t('MoveCardsDialog.move')}
          </button>
        </>
      )}
    >
      <form
        id={formId}
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!destination || !validPosition) {
            return;
          }
          onMove(moveTarget(destination, board, { position, row }));
        }}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={destinationId} className="text-xs text-text-secondary">{t('MoveCardsDialog.destination')}</label>
          <select
            id={destinationId}
            data-autofocus
            value={destination ? destinationKey(destination) : ''}
            onChange={(e) => {
              setDestinationChoice(e.target.value);
              setPositionDraft(null);
            }}
            className={FIELD_CLASS}
          >
            {destinations.map((d) => (
              <option key={destinationKey(d)} value={destinationKey(d)}>{label(d)}</option>
            ))}
          </select>
        </div>
        {destination?.zone === 'battlefield' && (
          <div className="flex flex-col gap-1">
            <label htmlFor={rowId} className="text-xs text-text-secondary">{t('MoveCardsDialog.row')}</label>
            <select
              id={rowId}
              value={row}
              onChange={(e) => {
                setRow(Number(e.target.value));
                setPositionDraft(null);
              }}
              className={FIELD_CLASS}
            >
              {rows.map((r) => (
                <option key={r.kind} value={r.row}>{t(`MoveCardsDialog.rows.${r.kind}`)}</option>
              ))}
            </select>
          </div>
        )}
        {hasPosition && (
          <div className="flex flex-col gap-1">
            <label htmlFor={positionId} className="text-xs text-text-secondary">{positionLabel}</label>
            <input
              id={positionId}
              type="number"
              min={1}
              max={max}
              value={positionDraft ?? String(defaultPosition)}
              onChange={(e) => setPositionDraft(e.target.value)}
              aria-invalid={!validPosition || undefined}
              className={FIELD_CLASS}
            />
          </div>
        )}
      </form>
    </DialogShell>
  );
}
