import { memo, useMemo } from 'react';

import { cx } from '@app/utils';

import { BoardCell } from '../../../hooks/useGameBoardLayout';
import PlayerBox from '../../PlayerBox/PlayerBox';
import { BoardCellProvider } from '../BoardCellContext';
import { useOpenDeckInEditor } from './useOpenDeckInEditor';
import { usePlayerBoxCommandProps, usePlayerBoxSeatProps } from './usePlayerBoxProps';
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
 * and hands them to the seat view. PlayerBox still takes flat props, so
 * usePlayerBoxProps adapts both halves until PlayerBoard renders the seat.
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

  const seatProps = usePlayerBoxSeatProps(model);
  const commandProps = usePlayerBoxCommandProps({ zone, card, counter, target }, model.counters.life);

  return (
    <div
      className={cx('game__board-cell', { 'game__board-cell--mirrored': cell.mirrored })}
      style={{ gridColumn: cell.col + 1, gridRow: cell.row + 1 }}
    >
      <BoardCellProvider value={cellInfo}>
        <PlayerBox
          {...seatProps}
          {...commandProps}
          onOpenDeckInEditor={onOpenDeckInEditor}
        />
      </BoardCellProvider>
    </div>
  );
}

export default memo(GameBoardCell);
