import { create } from '@bufbuild/protobuf';
import {
  Command_MoveCard_ext,
  Command_MoveCardSchema,
  Command_Shuffle_ext,
  Command_ShuffleSchema,
  type MoveCardParams,
  type ShuffleParams,
} from '../../generated';
import { WebClient } from '../../WebClient';

// Command_MoveCard plus a Command_Shuffle in ONE CommandContainer, as desktop
// sends moving several cards to the top or bottom of a library so their order
// stays hidden (cmMoveToTopLibrary / cmMoveToBottomLibrary,
// player_actions.cpp:1853-1888). The shuffle comes first: Servatrice runs a
// container's game commands last to first (server_protocolhandler.cpp:302),
// so the move lands before the shuffle.
export function moveCardAndShuffle(gameId: number, move: MoveCardParams, shuffle: ShuffleParams): void {
  WebClient.instance.protobuf.sendGameCommands(gameId, [
    { ext: Command_Shuffle_ext, value: create(Command_ShuffleSchema, shuffle) },
    { ext: Command_MoveCard_ext, value: create(Command_MoveCardSchema, move) },
  ]);
}
