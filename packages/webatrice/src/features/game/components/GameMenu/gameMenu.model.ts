import type { ActionId } from '@app/feature-widgets/shortcuts';

export type GameMenuItemId =
  | 'nextPhase'
  | 'nextPhaseAction'
  | 'nextTurn'
  | 'reverseTurn'
  | 'rotateViewCW'
  | 'rotateViewCCW';

export type GameMenuEntry =
  | {
      kind: 'item';
      id: GameMenuItemId;
      /** The shortcut whose binding the item shows as a hint. */
      shortcut: ActionId;
      disabled: boolean;
      onClick: () => void;
    }
  | { kind: 'divider'; id: string };

export interface GameMenuModelArgs {
  canAdvancePhase: boolean;
  canPassTurn: boolean;
  canRunNextPhaseAction: boolean;
  onNextPhase: () => void;
  onNextPhaseAction: () => void;
  onNextTurn: () => void;
  onReverseTurn: () => void;
  onRotateViewCW: () => void;
  onRotateViewCCW: () => void;
}

/**
 * The game menu, in desktop's TabGame::createMenuItems order: the phase
 * actions, the turn actions, then the view rotation. Desktop enables every
 * item and lets the server refuse; here each server item is disabled when the
 * server would refuse it (see webatrice-game.instructions.md "Phase model" for
 * the two gates). Rotation is local, so it is always available, spectators
 * included.
 */
export function buildGameMenuItems(args: GameMenuModelArgs): GameMenuEntry[] {
  return [
    { kind: 'item', id: 'nextPhase', shortcut: 'game.nextPhase', disabled: !args.canAdvancePhase, onClick: args.onNextPhase },
    {
      kind: 'item',
      id: 'nextPhaseAction',
      shortcut: 'game.nextPhaseAction',
      disabled: !args.canRunNextPhaseAction,
      onClick: args.onNextPhaseAction,
    },
    { kind: 'divider', id: 'phases' },
    { kind: 'item', id: 'nextTurn', shortcut: 'game.endTurn', disabled: !args.canPassTurn, onClick: args.onNextTurn },
    { kind: 'item', id: 'reverseTurn', shortcut: 'game.reverseTurn', disabled: !args.canPassTurn, onClick: args.onReverseTurn },
    { kind: 'divider', id: 'turns' },
    { kind: 'item', id: 'rotateViewCW', shortcut: 'game.rotateViewCW', disabled: false, onClick: args.onRotateViewCW },
    { kind: 'item', id: 'rotateViewCCW', shortcut: 'game.rotateViewCCW', disabled: false, onClick: args.onRotateViewCCW },
  ];
}
