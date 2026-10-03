import { isFieldSet } from '@bufbuild/protobuf';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Command_RevealCards_ext, Command_RevealCardsSchema } from '@cockatrice/sockatrice/generated';
import { GameCommands } from '@cockatrice/sockatrice';
import { makeDialogTestGame, makeSetterSpies } from '../../../../src/features/game/__test-utils__/dialogTestEnv';
import type { RevealState } from '../../../../src/features/game/hooks/dialogs/gameDialogs.types';
import { useHandDialogActions } from '../../../../src/features/game/hooks/dialogs/useHandDialogActions';
import { connectAndLogin, getWebClient } from '../../helpers/setup';
import { findLastGameCommand } from '../../helpers/command-capture';

// Command_RevealCards.player_id is proto2 `optional sint32 [default = -1]` and
// Servatrice's cmdRevealCards answers RespNameNotFound to any PRESENT player_id
// that names no player. "All players" must therefore leave the field off the
// wire, which these specs check on the encoded bytes.
describe('Command_RevealCards wire shape', () => {
  const lastReveal = () => findLastGameCommand(Command_RevealCards_ext).value;

  it('puts an explicitly set -1 on the wire, which is why senders must omit it', () => {
    connectAndLogin();
    GameCommands.revealCards(1, { zoneName: 'hand', playerId: -1 });
    expect(isFieldSet(lastReveal(), Command_RevealCardsSchema.field.playerId)).toBe(true);
  });

  it('omits player_id when the reveal dialog targets all players', () => {
    connectAndLogin();
    const game = makeDialogTestGame({ hand: [7] });
    const set = makeSetterSpies();
    const env = {
      gameId: 1,
      webClient: getWebClient(),
      readGame: () => game,
      readLocalPlayer: () => game.players[1],
      judgeTarget: () => undefined,
    };
    const { result } = renderHook(() =>
      useHandDialogActions({ env, canOpenMenus: true, set, closeAllContextMenus: vi.fn(), openZoneView: vi.fn() }));

    result.current.handleRequestRevealHand();
    const reveal = set.setRevealState.mock.calls[0][0] as RevealState;

    reveal.onSubmit({ targetPlayerId: -1, topCards: -1 });
    const toAll = lastReveal();
    expect(toAll.zoneName).toBe('hand');
    expect(isFieldSet(toAll, Command_RevealCardsSchema.field.playerId)).toBe(false);

    reveal.onSubmit({ targetPlayerId: 2, topCards: -1 });
    const toOne = lastReveal();
    expect(isFieldSet(toOne, Command_RevealCardsSchema.field.playerId)).toBe(true);
    expect(toOne.playerId).toBe(2);
  });
});
