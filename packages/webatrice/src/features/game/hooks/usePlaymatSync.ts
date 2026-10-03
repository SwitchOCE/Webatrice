import { useEffect } from 'react';

import { ServerCapability, games, server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { usePlaymatSettings } from '@app/hooks';
import { useAppSelector } from '@app/store';

import { resolvePlaymat, samePlaymat } from '../utils/resolvePlaymat';
import { getPlaymatSyncState, prunePlaymatSyncState } from './playmatSyncState';

/**
 * Announces the local player's playmat (Cockatrice #7101), the web side of
 * desktop DeckViewContainer::resolveAndSendPlaymat.
 *
 * Desktop resolves right after Command_DeckSelect from the deck file it just
 * sent. The web client may select a server-stored deck it never parsed, so the
 * deck's own playmat is read back instead: Servatrice answers a deck select
 * with Event_PlayerPropertiesChanged carrying the new deck_hash together with
 * the deck's playmat_params. A new deck hash, or a playmat this client did not
 * send (reselecting the same deck), is taken as the deck's playmat.
 *
 * The playmat is resolved against the user's collection and sent after a deck
 * select and when the settings change; the round-robin cursor advances when a
 * game ends (TabGame::stopGame). Nothing is sent when the result is already announced.
 * The per-game state lives in playmatSyncState, so it survives leaving the
 * game route.
 */
export function usePlaymatSync(gameId: number | undefined): void {
  const webClient = useWebClient();
  const settings = usePlaymatSettings();
  const supported = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.PLAYMATS));
  const liveGameIds = useAppSelector((state) => Object.keys(games.Selectors.getGames(state)).join(','));
  const game = useAppSelector((state) => (gameId == null ? undefined : games.Selectors.getGame(state, gameId)));
  const local = game && !game.spectator ? game.players[game.localPlayerId] : undefined;
  const playerId = local?.properties.playerId;
  const deckHash = local?.properties.deckHash ?? '';
  const announced = useAppSelector((state) =>
    gameId == null || playerId == null ? null : games.Selectors.getPlayerPlaymat(state, gameId, playerId));
  const started = game?.started ?? false;

  useEffect(() => {
    prunePlaymatSyncState(liveGameIds ? liveGameIds.split(',').map(Number) : []);
  }, [liveGameIds]);

  useEffect(() => {
    if (!supported || gameId == null || playerId == null) {
      return;
    }
    const sync = getPlaymatSyncState(gameId);
    if (sync.wasStarted && !started) {
      sync.rotation++;
    }
    sync.wasStarted = started;
    if (!deckHash) {
      return;
    }
    const deckSelected = deckHash !== sync.deckHash
      || sync.lastSent === undefined
      || !samePlaymat(announced, sync.lastSent);
    const settingsChanged = sync.settings !== settings;
    if (!deckSelected && !settingsChanged) {
      return;
    }
    if (deckSelected) {
      sync.deckHash = deckHash;
      sync.deckPlaymat = announced;
    }
    sync.settings = settings;
    const resolved = resolvePlaymat(sync.deckPlaymat, settings, sync.rotation, sync.lastResolved);
    sync.lastResolved = resolved;
    sync.lastSent = resolved;
    if (samePlaymat(resolved, announced)) {
      return;
    }
    webClient.request.game.setPlaymat(gameId, {
      playmatParams: resolved
        ? { cardName: resolved.cardName, cardProviderId: resolved.cardProviderId, ...resolved.params }
        : { cardName: '' },
    });
  }, [supported, gameId, playerId, deckHash, started, announced, settings, webClient]);
}
