import type { games } from '@cockatrice/datatrice';
import type { PlaymatSettings } from '@app/hooks';

/**
 * What desktop's DeckViewContainer keeps per match for #7101: the deck's own
 * playmat, the last playmat resolved and sent, and the round-robin cursor
 * (deck_view_container.h). The web Game route unmounts whenever the user
 * leaves `/game/:id` (Settings included), so this lives outside the component,
 * keyed by game, and is dropped once the game leaves the store.
 */
export interface PlaymatSyncState {
  /** The deck the playmat below was read for; empty before a deck select. */
  deckHash: string;
  deckPlaymat: games.Playmat | null;
  /** What was last sent with Command_SetPlaymat; undefined before the first send. */
  lastSent: games.Playmat | null | undefined;
  /** The previous pick, which random mode never repeats. */
  lastResolved: games.Playmat | null;
  /** Round-robin cursor, advanced when a game of the match ends (TabGame::stopGame). */
  rotation: number;
  wasStarted: boolean;
  wasReady: boolean;
  /** The collection settings last resolved with; visibility is not part of the pick. */
  settings: Pick<PlaymatSettings, 'mode' | 'fallbackBehavior' | 'fallbackList'> | undefined;
}

const states = new Map<number, PlaymatSyncState>();

export function getPlaymatSyncState(gameId: number): PlaymatSyncState {
  let state = states.get(gameId);
  if (!state) {
    state = {
      deckHash: '',
      deckPlaymat: null,
      lastSent: undefined,
      lastResolved: null,
      rotation: 0,
      wasStarted: false,
      wasReady: false,
      settings: undefined,
    };
    states.set(gameId, state);
  }
  return state;
}

/** Forgets every game not in `liveGameIds` (left, closed or kicked). */
export function prunePlaymatSyncState(liveGameIds: readonly number[]): void {
  for (const gameId of states.keys()) {
    if (!liveGameIds.includes(gameId)) {
      states.delete(gameId);
    }
  }
}

/** S1 registration seam: the later session pass registers this with onSessionEnd. */
export function clearPlaymatSyncState(): void {
  states.clear();
}
