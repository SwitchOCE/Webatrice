import { memo, useMemo } from 'react';

import { cx } from '@app/utils';

import { BoardCell } from '../../../hooks/useGameBoardLayout';
import { BoardCellProvider } from '../BoardCellContext';
import PlayerBoard from '../PlayerBoard/PlayerBoard';
import { useOpenDeckInEditor } from './useOpenDeckInEditor';
import { usePlayerCardCommands } from './usePlayerCardCommands';
import { usePlayerCounterCommands } from './usePlayerCounterCommands';
import { usePlayerSeatViewModel } from './usePlayerSeatViewModel';
import { usePlayerTargetCommands } from './usePlayerTargetCommands';
import { usePlayerZoneCommands } from './usePlayerZoneCommands';

import './GameBoardCell.css';

export interface GameBoardCellProps {
  cell: BoardCell;
  /** Total seated player count. Used to decide whether opponent
   *  hand card backs render rotated 180° — flipped for 2 / 4+
   *  player layouts (opponent conceptually "across the table"),
   *  normal for 3-player (opponents on the sides, flipping looks
   *  off). */
  totalPlayers: number;
}

/**
 * One seat in the adaptive board grid: composes the seat model
 * (usePlayerSeatViewModel) and the grouped command ports (usePlayer*Commands)
 * and hands them to the seat view.
 */
function GameBoardCell({ cell, totalPlayers }: GameBoardCellProps) {
  const cellInfo = useMemo(
    () => ({ playerId: cell.playerId, mirrored: cell.mirrored, isLocal: cell.isLocal }),
    [cell.playerId, cell.mirrored, cell.isLocal],
  );

  const model = usePlayerSeatViewModel(cell, totalPlayers);
  const zone = usePlayerZoneCommands(cell.playerId);
  const card = usePlayerCardCommands(cell.playerId, cell.isLocal);
  const counter = usePlayerCounterCommands(cell.playerId);
  const target = usePlayerTargetCommands(cell.playerId);
  const onOpenDeckInEditor = useOpenDeckInEditor(cell.playerId, cell.isLocal);

  // Every port is undefined while the game id is unknown; there is no seat to
  // command until then.
  const commands = useMemo(
    () => (zone && card && counter && target ? { zone, card, counter, target } : undefined),
    [zone, card, counter, target],
  );

  return (
    <div
      className={cx('game__board-cell', { 'game__board-cell--mirrored': cell.mirrored })}
      style={{ gridColumn: cell.col + 1, gridRow: cell.row + 1 }}
    >
      <BoardCellProvider value={cellInfo}>
        {commands && <PlayerBoard model={model} commands={commands} onOpenDeckInEditor={onOpenDeckInEditor} />}
      </BoardCellProvider>
    </div>
  );
}

export default memo(GameBoardCell);
