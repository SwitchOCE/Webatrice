import { useEffect, useRef } from 'react';

import { ServerCapability, games, server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { usePlaymatSettings } from '@app/hooks';
import { useAppSelector } from '@app/store';

import { resolvePlaymat, samePlaymat } from '../utils/resolvePlaymat';

/**
 * Announces the local player's playmat (Cockatrice #7101), the web side of
 * desktop DeckViewContainer::resolveAndSendPlaymat.
 *
 * Desktop resolves right after Command_DeckSelect from the deck file it just
 * sent. The web client may select a server-stored deck it never parsed, so the
 * deck's own playmat is read back instead: Servatrice answers a deck select
 * with Event_PlayerPropertiesChanged carrying the new deck_hash together with
 * the deck's playmat_params. Whenever the announced playmat changes to
 * something this hook did not send (a deck select, including reselecting the
 * same deck), it is taken as the deck's playmat, resolved against the user's
 * collection, and Command_SetPlaymat is sent when the result differs. A
 * settings change re-resolves for the loaded deck, and the round-robin cursor
 * advances when a game ends (desktop TabGame::stopGame).
 */
export function usePlaymatSync(gameId: number | undefined): void {
  const webClient = useWebClient();
  const settings = usePlaymatSettings();
  const supported = useAppSelector((state) => server.Selectors.supports(state, ServerCapability.PLAYMATS));
  const game = useAppSelector((state) => (gameId == null ? undefined : games.Selectors.getGame(state, gameId)));
  const local = game && !game.spectator ? game.players[game.localPlayerId] : undefined;
  const deckHash = local?.properties.deckHash ?? '';
  const announced = useAppSelector((state) =>
    gameId == null || !local ? null : games.Selectors.getPlayerPlaymat(state, gameId, local.properties.playerId));
  const started = game?.started ?? false;

  const deckPlaymat = useRef<games.Playmat | null>(null);
  const lastSent = useRef<games.Playmat | null | undefined>(undefined);
  const lastResolved = useRef<games.Playmat | null>(null);
  const rotation = useRef(0);
  const wasStarted = useRef(started);
  const lastSettings = useRef(settings);

  useEffect(() => {
    if (wasStarted.current && !started) {
      rotation.current++;
    }
    wasStarted.current = started;
  }, [started]);

  useEffect(() => {
    if (!supported || gameId == null || !deckHash) {
      return;
    }
    const fromServer = lastSent.current === undefined || !samePlaymat(announced, lastSent.current);
    const settingsChanged = lastSettings.current !== settings;
    lastSettings.current = settings;
    if (!fromServer && !settingsChanged) {
      return;
    }
    if (fromServer) {
      deckPlaymat.current = announced;
    }
    const resolved = resolvePlaymat(deckPlaymat.current, settings, rotation.current, lastResolved.current);
    lastResolved.current = resolved;
    lastSent.current = resolved;
    if (samePlaymat(resolved, announced)) {
      return;
    }
    webClient.request.game.setPlaymat(gameId, {
      playmatParams: resolved
        ? { cardName: resolved.cardName, cardProviderId: resolved.cardProviderId, ...resolved.params }
        : { cardName: '' },
    });
  }, [supported, gameId, deckHash, announced, settings, webClient]);
}
