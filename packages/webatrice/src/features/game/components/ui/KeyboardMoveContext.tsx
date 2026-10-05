import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import MoveCardsDialog, { type MoveCardsRequest } from '../../dialogs/MoveCardsDialog/MoveCardsDialog';
import type { SeatDragSource, SeatDropTarget } from '../../hooks/seatDropPlan';
import { BattlefieldGeometryContext, createBattlefieldGeometryRegistry } from './BattlefieldGeometryContext';

export type RequestKeyboardMove = (request: MoveCardsRequest) => void;

const KeyboardMoveContext = createContext<RequestKeyboardMove | null>(null);

/**
 * The game's keyboard move (M on a card, MoveCardsDialog). Game provides it
 * with the drop path's mover (useGameDnd), so a keyboard move sends what a
 * drop on the chosen place would. It also holds each battlefield's drop
 * grid (BattlefieldGeometryContext), which the boards inside publish, so the
 * dialog sends the slot and grid a drop resolves. Outside a game (a seat
 * rendered alone) there is none and M does nothing.
 */
export function KeyboardMoveProvider({
  moveSeatCards,
  children,
}: {
  moveSeatCards: (source: SeatDragSource, target: SeatDropTarget) => void;
  children: ReactNode;
}) {
  const [request, setRequest] = useState<MoveCardsRequest | null>(null);
  const close = useCallback(() => setRequest(null), []);
  const geometry = useMemo(createBattlefieldGeometryRegistry, []);
  return (
    <BattlefieldGeometryContext.Provider value={geometry}>
      <KeyboardMoveContext.Provider value={setRequest}>
        {children}
        {request && (
          <MoveCardsDialog
            request={request}
            onCancel={close}
            onMove={(target) => {
              close();
              moveSeatCards(request.source, target);
            }}
          />
        )}
      </KeyboardMoveContext.Provider>
    </BattlefieldGeometryContext.Provider>
  );
}

/** Opens the keyboard move for some cards; null outside a game. */
export function useKeyboardMove(): RequestKeyboardMove | null {
  return useContext(KeyboardMoveContext);
}
