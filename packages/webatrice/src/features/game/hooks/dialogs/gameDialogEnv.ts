import type { WebClient } from '@cockatrice/sockatrice';
import type { GameEntry, PlayerEntry } from '@cockatrice/datatrice';

/**
 * What every dialog action hook needs from the game, built once by the
 * `useGameDialogs` façade.
 *
 * `readGame` / `readLocalPlayer` read the store at CALL time, never at render
 * time, so handlers don't churn on every game-state update (store-read
 * precedent: useReduxEffect).
 */
export interface GameDialogEnv {
  gameId: number | undefined;
  webClient: WebClient;
  readGame: () => GameEntry | undefined;
  readLocalPlayer: () => PlayerEntry | undefined;
  /** The judge-wrap target for a card owner; undefined for the local player's own cards. See useJudgeTarget. */
  judgeTarget: (ownerPlayerId: number) => number | undefined;
}
