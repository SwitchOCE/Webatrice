import { create } from '@bufbuild/protobuf';
import { Command_SetPlaymat_ext, Command_SetPlaymatSchema, type SetPlaymatParams } from '../../generated';
import { WebClient } from '../../WebClient';

// Sets the player's playmat independently of the deck (Cockatrice #7101). The
// server reflects it back through Event_PlayerPropertiesChanged.playmat_params.
export function setPlaymat(gameId: number, params: SetPlaymatParams): void {
  WebClient.instance.protobuf.sendGameCommand(
    gameId,
    Command_SetPlaymat_ext,
    create(Command_SetPlaymatSchema, params)
  );
}
