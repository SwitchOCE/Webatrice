import { memo, useMemo } from 'react';

import { cx } from '@app/utils';

import { BoardCell } from '../../../hooks/useGameBoardLayout';
import { getPickedMockDeck } from '../../../mockDeckStore';
import PlayerBox from '../../PlayerBox/PlayerBox';
import type { DeckCard } from '../../PlayerBox/mockTypes';
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
  // Callbacks kept in the API so Game.tsx's existing wiring compiles
  // through this transitional slice. The ported PlayerBox is
  // wiring-free in step 1; these props will be re-consumed once the
  // ported PlayerBox is wired to og's Cockatrice data model.
  onPlayerContextMenu?: (event: React.MouseEvent) => void;
  onPlayerClick?: (playerId: number) => boolean;
  onHandContextMenu?: (event: React.MouseEvent) => void;
}

// Mock deck — enough cards to fill a Commander library so the
// PlayerBox's zone counts / draw animation / library search look
// real. Every entry uses a Scryfall id we know resolves.
const MOCK_DECK: DeckCard[] = [
  // Commander
  {
    id: 'cmd-1',
    card_scryfall_id: '89ef7247-9c56-4ce0-a3f9-9e7a5b0e6e97',
    name: 'Animar, Soul of Elements',
    mana_cost: '{U}{B}{G}{R}',
    type_line: 'Legendary Creature — Elemental',
    cmc: 4,
    colors: ['U', 'R', 'G'],
    set: null,
    collector_number: null,
    power: '1',
    toughness: '1',
    quantity: 1,
    category: 'main',
  },
  // Main deck fillers — Scryfall resolves all these by name too, so
  // even bad/missing ids fall back gracefully.
  ...[
    'Sol Ring',
    'Arcane Signet',
    'Command Tower',
    'Cultivate',
    'Kodama\'s Reach',
    'Rhystic Study',
    'Mystic Remora',
    'Counterspell',
    'Swords to Plowshares',
    'Lightning Bolt',
    'Brainstorm',
    'Ponder',
    'Sensei\'s Divining Top',
    'Path to Exile',
    'Cyclonic Rift',
    'Beast Whisperer',
    'Eternal Witness',
    'Birds of Paradise',
    'Elvish Mystic',
    'Llanowar Elves',
    'Forest',
    'Island',
    'Mountain',
    'Steam Vents',
    'Stomping Ground',
    'Breeding Pool',
    'Wooded Foothills',
    'Scalding Tarn',
    'Misty Rainforest',
    'Yavimaya Coast',
    'Sulfur Falls',
    'Rootbound Crag',
    'Shivan Reef',
    'Prismatic Vista',
    'Chromatic Orrery',
    'Panharmonicon',
    'Deadeye Navigator',
    'Peregrine Drake',
    'Cloud of Faeries',
    'Fblthp, the Lost',
  ].map(
    (name, i): DeckCard => ({
      id: `main-${i}`,
      card_scryfall_id: `mock-${i}`,
      name,
      mana_cost: null,
      type_line: null,
      cmc: null,
      colors: [],
      set: null,
      collector_number: null,
      power: null,
      toughness: null,
      quantity: 1,
      category: 'main',
    }),
  ),
];

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

  // Card metadata for PlayerBox's library search and play heuristics still
  // comes from the lobby-picked deck (dev tool) or MOCK_DECK; Phase 8 replaces
  // it with the card catalog.
  const cards = useMemo<DeckCard[]>(() => getPickedMockDeck() ?? MOCK_DECK, []);

  return (
    <div
      className={cx('game__board-cell', { 'game__board-cell--mirrored': cell.mirrored })}
      style={{ gridColumn: cell.col + 1, gridRow: cell.row + 1 }}
    >
      <BoardCellProvider value={cellInfo}>
        <PlayerBox
          {...seatProps}
          {...commandProps}
          cards={cards}
          onOpenDeckInEditor={onOpenDeckInEditor}
        />
      </BoardCellProvider>
    </div>
  );
}

export default memo(GameBoardCell);
