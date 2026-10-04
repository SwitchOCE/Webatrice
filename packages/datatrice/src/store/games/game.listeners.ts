import { ZoneName } from '@cockatrice/sockatrice';
import { create, isFieldSet } from '@bufbuild/protobuf';
import type { ListenerMiddlewareInstance } from '@reduxjs/toolkit';

import { Event_DeleteArrowSchema, Event_SetCardAttrSchema } from '@cockatrice/sockatrice/generated';
import { GamesState } from './game.interfaces';
import { Actions } from './game.actions';
import { Selectors } from './game.selectors';
import {
  buildMovedCard,
  cardMovedLogEntry,
  planAttachmentReparent,
  planMovePlacement,
  planOptimisticReconcile,
  planZoneViewSync,
  resolveMoveIdentity,
  sweepsArrows,
} from './cardMove';
import { attrOpKey, consumeOptimistic, moveOpKey } from './optimistic';
import {
  buildTokenCard,
  cardAttachFields,
  cardAttrFields,
  carryForwardResyncState,
  formatLeaveMessage,
  gameInfoUpdateFrom,
  mergeCardCounter,
  normalizePlayers,
} from './game.reducer.helpers';
import {
  EVENT_PLAYER_ID_SYSTEM,
  diffPlayerProperties,
  formatActivePhaseSet,
  formatActivePlayerSet,
  formatArrowCreated,
  formatCardAttached,
  formatCardsRevealed,
  formatCardPeeked,
  formatCardAttrChanged,
  formatCardAttrChangedBulk,
  formatCardCounterChanged,
  formatCardDestroyed,
  formatCardFlipped,
  formatCardsDrawn,
  formatCounterSet,
  formatGameStart,
  formatPlayerJoined,
  formatPropertyDiff,
  formatTokenCreated,
  formatTurnReversed,
} from './messageLog';

export function registerGameListeners(mw: ListenerMiddlewareInstance<unknown>): void {
  mw.startListening({
    actionCreator: Actions.cardMoved,
    effect: (action, api) => {
      const { gameId, playerId, data, isUndoDraw = false } = action.payload;
      const { startPlayerId, startZone, targetPlayerId, position, x } = data;

      const state = api.getState() as { games: GamesState };
      const game = state.games.games[gameId];
      const sourceZone = game?.players[startPlayerId]?.zones[startZone];
      const targetZoneEntry = game?.players[targetPlayerId]?.zones[data.targetZone || startZone];
      if (!game || !sourceZone || !targetZoneEntry) {
        return;
      }

      const move = resolveMoveIdentity(sourceZone, data);
      const { targetZone } = move;
      const placement = planMovePlacement(move, sourceZone, data);

      if (placement === 'view-reorder') {
        api.dispatch(Actions.zoneViewCardReordered({
          gameId, playerId: startPlayerId, zoneName: startZone, fromPosition: position, toPosition: x,
        }));
      }
      if (move.hidden) {
        // A hidden card has no Server_Card to log by name, so only the counts (or the
        // open view) change. Undo-draw still logs: "X undoes their last draw" needs no
        // name, and an opponent's hand → deck is hidden on both ends. A reorder inside an
        // open view stays unlogged ("moves a card" would add nothing).
        // See datatrice-game.instructions.md#servatrice-game-event-quirks.
        if (placement === 'count-transfer') {
          api.dispatch(Actions.zoneCardCountAdjusted({ gameId, playerId: startPlayerId, zoneName: startZone, delta: -1 }));
          api.dispatch(Actions.zoneCardCountAdjusted({ gameId, playerId: targetPlayerId, zoneName: targetZone, delta: 1 }));
        }
        const message = isUndoDraw && placement !== 'view-reorder'
          ? cardMovedLogEntry(game, playerId, data, move, true)
          : null;
        if (message) {
          api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message }));
        }
        return;
      }

      const movedCard = buildMovedCard(move, data);
      // Planned from the pre-move zones: the move dispatch below changes them.
      const viewSync = planZoneViewSync(move, sourceZone, targetZoneEntry, data);
      const optimisticKey = moveOpKey(startPlayerId, move.cardId);

      if (placement === 'same-zone') {
        // Re-splicing at the same index no-ops, so re-applying over an optimistic
        // pre-dispatch is safe; the marker is consumed to keep the rollback map tidy.
        consumeOptimistic(optimisticKey);
        api.dispatch(Actions.cardMovedInSameZone({
          gameId, playerId: startPlayerId, zoneName: startZone, cardId: move.cardId, toIndex: x, card: movedCard,
        }));
      } else if (placement === 'between-zones') {
        // Cross-zone moves are not idempotent (cardCount drift, duplicate order entries),
        // so the server's confirmation of an optimistic move only reconciles the target.
        const confirmsOptimistic = move.cardId >= 0 && consumeOptimistic(optimisticKey);
        if (!confirmsOptimistic) {
          api.dispatch(Actions.cardMovedBetweenZones({
            gameId,
            fromPlayerId: startPlayerId,
            fromZone: startZone,
            fromCardId: move.cardId,
            toPlayerId: targetPlayerId,
            toZone: targetZone,
            card: movedCard,
          }));
        } else {
          // Read fresh: the optimistic insert postdates the snapshot above.
          const postDispatch = api.getState() as { games: GamesState };
          const reconcile = planOptimisticReconcile(
            postDispatch.games.games[gameId]?.players[targetPlayerId]?.zones[targetZone],
            move.cardId,
            movedCard,
          );
          if (reconcile?.kind === 'migrate') {
            // Remove-then-insert net-zeroes cardCount and leaves only the server id.
            api.dispatch(Actions.cardRemovedFromZone({
              gameId, playerId: targetPlayerId, zoneName: targetZone, cardId: move.cardId,
            }));
            api.dispatch(Actions.cardInsertedIntoZone({
              gameId, playerId: targetPlayerId, zoneName: targetZone, card: reconcile.card,
            }));
          } else if (reconcile?.kind === 'patch') {
            api.dispatch(Actions.cardFieldsUpdated({
              gameId, playerId: targetPlayerId, zoneName: targetZone, cardId: movedCard.id, fields: reconcile.fields,
            }));
          }
        }
      }

      if (viewSync.removeAt !== undefined) {
        api.dispatch(Actions.zoneViewCardRemoved({
          gameId, playerId: startPlayerId, zoneName: startZone, position: viewSync.removeAt,
        }));
      }
      if (viewSync.clearTop) {
        api.dispatch(Actions.topRevealedCardCleared({ gameId, playerId: startPlayerId, zoneName: startZone }));
      }
      if (viewSync.insertAt !== undefined) {
        api.dispatch(Actions.zoneViewCardInserted({
          gameId, playerId: targetPlayerId, zoneName: targetZone, position: viewSync.insertAt, card: movedCard,
        }));
      }

      if (sweepsArrows(move)) {
        const postMove = api.getState() as { games: GamesState };
        for (const { ownerPlayerId, arrowId } of Selectors.getArrowsTouchingCard(
          postMove, gameId, startPlayerId, startZone, move.cardId,
        )) {
          api.dispatch(Actions.arrowDeleted({
            gameId, playerId: ownerPlayerId, data: create(Event_DeleteArrowSchema, { arrowId }),
          }));
        }
      }

      const reparent = planAttachmentReparent(move, data);
      if (reparent) {
        api.dispatch(Actions.cardAttachmentReparented({ gameId, ...reparent }));
      }

      const message = cardMovedLogEntry(game, playerId, data, move, isUndoDraw);
      if (message) {
        api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.gameStateChanged,
    effect: (action, api) => {
      const { gameId, data } = action.payload;
      const state = api.getState() as { games: GamesState };
      const game = state.games.games[gameId];
      if (!game) {
        return;
      }
      const wasStarted = game.started;

      if (data.playerList?.length > 0) {
        const players = normalizePlayers(data.playerList);
        carryForwardResyncState(game.players, players);
        const order = data.playerList.map((p) => p.properties.playerId);
        api.dispatch(Actions.gamePlayersReplaced({ gameId, players, order }));
      }

      const update = gameInfoUpdateFrom(data);
      if (update) {
        api.dispatch(Actions.gameInfoUpdated({ gameId, ...update }));
      }
      const nextStarted = update?.gameStarted ?? wasStarted;

      // Pre-mutation read for the wasStarted→started log edge. See .github/instructions/datatrice-game.instructions.md#listener-patterns.
      if (!wasStarted && nextStarted) {
        api.dispatch(Actions.gameMessageAppended({
          gameId,
          playerId: EVENT_PLAYER_ID_SYSTEM,
          message: formatGameStart(),
        }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.cardAttrChanged,
    effect: (action, api) => {
      const { gameId, playerId, data } = action.payload;
      const { zoneName, cardId, attribute, attrValue } = data;
      const state = api.getState() as { games: GamesState };
      const game = state.games.games[gameId];
      if (!game) {
        return;
      }

      const fields = cardAttrFields(attribute, attrValue);

      if (!isFieldSet(data, Event_SetCardAttrSchema.field.cardId)) {
        // Cockatrice bulk sentinel: server omits card_id when applying to every card in the zone.
        const zone = game.players[playerId]?.zones[zoneName];
        if (!zone) {
          return;
        }
        if (fields) {
          api.dispatch(Actions.cardFieldsUpdatedBulk({ gameId, playerId, zoneName, fields }));
        }
        const bulkMessage = formatCardAttrChangedBulk(game, playerId, data);
        if (bulkMessage) {
          api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message: bulkMessage }));
        }
        return;
      }

      const card = game.players[playerId]?.zones[zoneName]?.byId[cardId];
      if (!card) {
        return;
      }
      const cardName = card.name;

      if (fields) {
        // cardFieldsUpdated is idempotent (fresh clone-with, same
        // input = same output) so the optimistic pre-dispatch can be
        // re-applied here safely. Consume any pending marker so the
        // rollback map doesn't leak entries.
        consumeOptimistic(attrOpKey(playerId, cardId, attribute));
        api.dispatch(Actions.cardFieldsUpdated({ gameId, playerId, zoneName, cardId, fields }));
      }

      const message = formatCardAttrChanged(game, playerId, data, cardName);
      if (message) {
        api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.cardCounterChanged,
    effect: (action, api) => {
      const { gameId, playerId, data } = action.payload;
      const { zoneName, cardId, counterId, counterValue } = data;
      const state = api.getState() as { games: GamesState };
      const game = state.games.games[gameId];
      const card = game?.players[playerId]?.zones[zoneName]?.byId[cardId];
      if (!game || !card) {
        return;
      }
      const cardName = card.name;
      const previousValue = card.counterList.find(c => c.id === counterId)?.value ?? 0;

      const nextCounterList = mergeCardCounter(card.counterList, counterId, counterValue);
      api.dispatch(Actions.cardFieldsUpdated({
        gameId, playerId, zoneName, cardId, fields: { counterList: nextCounterList },
      }));

      const message = formatCardCounterChanged(game, playerId, data, cardName, previousValue);
      if (message) {
        api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.cardsRevealed,
    effect: (action, api) => {
      const { gameId, playerId, data } = action.payload;
      const state = api.getState() as { games: GamesState };
      const game = state.games.games[gameId];
      if (!game) {
        return;
      }

      // Detect Servatrice's auto-reveal from revealTopCardIfNeeded up
      // front — both the chat log and the receiver dialog want to
      // suppress those. Both auto-reveals AND cmdRevealCards "top
      // N=1" emit `cards.length === 1` with `card_id === [0]`, so
      // the only reliable signal is the zone flag already being on
      // in state. Order is safe: Cockatrice enqueues
      // Event_ChangeZoneProperties BEFORE the auto-reveal event
      // (server_player.cpp:576-583), so the flag is up-to-date by
      // the time this listener runs.
      const zone = game.players[playerId]?.zones[data.zoneName];
      const isAutoTopReveal =
        data.cards.length === 1 &&
        (zone?.alwaysRevealTopCard || zone?.alwaysLookAtTopCard);

      // Chat log fires for EVERY recipient (source, target, spectators),
      // EXCEPT for auto-reveals — those are already announced via the
      // zonePropertiesChanged log ("SonicBliss is now revealing the top
      // card of their library") and re-logging every top-card change
      // would spam the chat on every draw.
      if (!isAutoTopReveal) {
        const message = formatCardsRevealed(game, playerId, data);
        if (message) {
          api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message }));
        }
      }

      // Popup the receiver dialog only when we (the recipient) actually
      // got the face-up card list. Spectator-side Event_RevealCards has
      // an empty `cards[]` (server sends the summary via eventOthers)
      // — nothing to display for those.
      if (!data.cards || data.cards.length === 0) {
        return;
      }
      // Auto-reveals render on the pile via zone.topRevealedCard (set
      // by the cardsRevealed reducer's isAutoTopReveal branch), not
      // via the popup — matches Cockatrice's desktop UX.
      if (isAutoTopReveal) {
        return;
      }
      // Peek reveals — any card in the payload flagged `faceDown` means
      // the server is answering an `actPeek` (a hidden card on the
      // battlefield or in an opponent's zone that the source revealed
      // to itself). Cockatrice suppresses the receiver dialog for peeks
      // (player_event_handler.cpp:474-484) and emits one log line per
      // peeked card instead. The general `formatCardsRevealed` above
      // returns null for the peek branch (comment on that function),
      // so we emit peek logs here per-card, then return before the
      // popup dispatch.
      const isPeek = data.cards.some((c) => c.faceDown);
      if (isPeek) {
        for (const card of data.cards) {
          if (!card.faceDown) {
            continue;
          }
          const peekMessage = formatCardPeeked(game, playerId, card.id, card.name ?? '');
          api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message: peekMessage }));
        }
        return;
      }
      // Also seed the source's zone.revealedCards on OUR client, so the
      // existing zoneViewCardRemoved / zoneViewCardReordered auto-prune
      // paths keep the reveal snapshot in sync when we (or anyone) move
      // cards out of the source zone. Without this, a lend recipient
      // could "Move to my hand" a card from the lender's deck and the
      // dialog would still show it. isReversed=false because
      // Event_RevealCards doesn't carry the reveal direction — reveals
      // are always top-first (server iterates cards[] in list order at
      // server_abstract_player.cpp:1532).
      api.dispatch(Actions.zoneViewRevealed({
        gameId,
        playerId,
        zoneName: data.zoneName,
        cards: data.cards,
        isReversed: false,
      }));
      // A replay has no viewer to reveal to; the reveal is already logged and
      // seeded into the zone view above.
      if (game.replay) {
        return;
      }
      api.dispatch(Actions.incomingRevealShown({
        gameId,
        sourceOwnerId: playerId,
        zoneName: data.zoneName,
        cards: data.cards,
        grantWriteAccess: data.grantWriteAccess,
      }));
    },
  });

  mw.startListening({
    actionCreator: Actions.cardAttached,
    effect: (action, api) => {
      const { gameId, playerId, data } = action.payload;
      const { startZone, cardId } = data;
      const state = api.getState() as { games: GamesState };
      const game = state.games.games[gameId];
      const card = game?.players[playerId]?.zones[startZone]?.byId[cardId];
      if (!game || !card) {
        return;
      }
      const sourceCardName = card.name;

      const fields = cardAttachFields(data);
      api.dispatch(Actions.cardFieldsUpdated({
        gameId, playerId, zoneName: startZone, cardId, fields,
      }));

      const message = formatCardAttached(game, playerId, data, sourceCardName);
      if (message) {
        api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.cardsDrawn,
    effect: (action, api) => {
      const { gameId, playerId, data } = action.payload;
      const { number: drawCount, cards } = data;
      const state = api.getState() as { games: GamesState };
      const game = state.games.games[gameId];
      const player = game?.players[playerId];
      const handZone = player?.zones[ZoneName.HAND];
      if (!game || !player || !handZone) {
        return;
      }

      if (player.zones[ZoneName.DECK]) {
        api.dispatch(Actions.zoneCardCountAdjusted({
          gameId, playerId, zoneName: ZoneName.DECK, delta: -drawCount,
        }));
        // Draw removes the top card — the previously-revealed face on
        // the pile is now stale. If auto-reveal is still on, Servatrice
        // re-emits Event_RevealCards immediately after this event (via
        // revealTopCardIfNeeded, server_abstract_player.cpp:329-333)
        // and the cardsRevealed reducer will re-populate topRevealedCard
        // with the new top. If auto-reveal is off, nothing follows and
        // the pile stays cleared — matches Cockatrice's "keep face on
        // toggle-off until top changes" behavior.
        api.dispatch(Actions.topRevealedCardCleared({
          gameId, playerId, zoneName: ZoneName.DECK,
        }));
      }

      for (const card of cards) {
        api.dispatch(Actions.cardInsertedIntoZone({
          gameId, playerId, zoneName: ZoneName.HAND, card,
        }));
      }

      // Opponent draws: bump cardCount for hidden slots.
      // See .github/instructions/datatrice-game.instructions.md#servatrice-game-event-quirks.
      if (drawCount > cards.length) {
        api.dispatch(Actions.zoneCardCountAdjusted({
          gameId, playerId, zoneName: ZoneName.HAND,
          delta: drawCount - cards.length,
        }));
      }

      // Draw beacon: scoped to real Event_DrawCards so a draw animation only fires
      // for Command_DrawCards / Command_Mulligan, not zone→hand drags or reveal-to-hand.
      api.dispatch(Actions.drawBeaconBumped({ gameId, playerId, count: drawCount }));

      api.dispatch(Actions.gameMessageAppended({
        gameId, playerId, message: formatCardsDrawn(game, playerId, drawCount),
      }));
    },
  });

  mw.startListening({
    actionCreator: Actions.playerPropertiesChanged,
    effect: (action, api) => {
      const { gameId, playerId, properties } = action.payload;
      const state = api.getState() as { games: GamesState };
      const game = state.games.games[gameId];
      const player = game?.players[playerId];
      if (!game || !player) {
        return;
      }

      const previous = { ...player.properties };
      api.dispatch(Actions.playerPropertiesUpdated({ gameId, playerId, properties }));

      const nextState = api.getState() as { games: GamesState };
      const nextGame = nextState.games.games[gameId];
      const nextPlayer = nextGame?.players[playerId];
      if (!nextGame || !nextPlayer) {
        return;
      }
      const diff = diffPlayerProperties(previous, nextPlayer.properties);
      for (const message of formatPropertyDiff(nextGame, playerId, diff)) {
        api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.cardDestroyed,
    effect: (action, api) => {
      const { gameId, playerId, data } = action.payload;
      const { zoneName, cardId } = data;
      const state = api.getState() as { games: GamesState };
      const game = state.games.games[gameId];
      const zone = game?.players[playerId]?.zones[zoneName];
      if (!game || !zone) {
        return;
      }
      // Pre-mutation read for log. See .github/instructions/datatrice-game.instructions.md#listener-patterns.
      const destroyedName = zone.byId[cardId]?.name;
      api.dispatch(Actions.cardRemovedFromZone({ gameId, playerId, zoneName, cardId }));

      const message = formatCardDestroyed(game, playerId, destroyedName);
      if (message) {
        api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.tokenCreated,
    effect: (action, api) => {
      const { gameId, playerId, data } = action.payload;
      const { zoneName } = data;
      const state = api.getState() as { games: GamesState };
      const game = state.games.games[gameId];
      const zone = game?.players[playerId]?.zones[zoneName];
      if (!game || !zone) {
        return;
      }
      const newCard = buildTokenCard(data);
      api.dispatch(Actions.cardInsertedIntoZone({ gameId, playerId, zoneName, card: newCard }));

      const message = formatTokenCreated(game, playerId, data);
      if (message) {
        api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.cardFlipped,
    effect: (action, api) => {
      const { gameId, playerId, data } = action.payload;
      const { zoneName, cardId } = data;
      const preState = api.getOriginalState() as { games: GamesState };
      const preGame = preState.games.games[gameId];
      const preCard = preGame?.players[playerId]?.zones[zoneName]?.byId[cardId];
      if (!preGame || !preCard) {
        return;
      }
      const previousName = preCard.name;
      const message = formatCardFlipped(preGame, playerId, data, previousName);
      if (message) {
        api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.counterSet,
    effect: (action, api) => {
      const { gameId, playerId, data } = action.payload;
      const preState = api.getOriginalState() as { games: GamesState };
      const preGame = preState.games.games[gameId];
      const preCounter = preGame?.players[playerId]?.counters[data.counterId];
      if (!preGame || !preCounter) {
        return;
      }
      const previousValue = preCounter.count;
      const message = formatCounterSet(preGame, playerId, data, preCounter.name, previousValue);
      if (message) {
        api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.arrowCreated,
    effect: (action, api) => {
      const { gameId, playerId, data } = action.payload;
      if (!data.arrowInfo) {
        return;
      }
      const preState = api.getOriginalState() as { games: GamesState };
      const preGame = preState.games.games[gameId];
      const prePlayer = preGame?.players[playerId];
      if (!preGame || !prePlayer) {
        return;
      }
      const message = formatArrowCreated(preGame, playerId, data.arrowInfo);
      if (message) {
        api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.activePlayerSet,
    effect: (action, api) => {
      const { gameId, activePlayerId } = action.payload;
      const preState = api.getOriginalState() as { games: GamesState };
      const preGame = preState.games.games[gameId];
      if (!preGame) {
        return;
      }
      // Suppress the turn-change log before the game starts (the initial active-player
      // assignment moves from -1 during setup/resume) and when it didn't change —
      // matching activePhaseSet's `!preGame.started` guard.
      if (preGame.activePlayerId === activePlayerId || !preGame.started) {
        return;
      }
      const postState = api.getState() as { games: GamesState };
      const postGame = postState.games.games[gameId];
      if (!postGame) {
        return;
      }
      const message = formatActivePlayerSet(postGame, activePlayerId);
      if (message) {
        api.dispatch(Actions.gameMessageAppended({ gameId, playerId: activePlayerId, message }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.activePhaseSet,
    effect: (action, api) => {
      const { gameId, phase } = action.payload;
      const preState = api.getOriginalState() as { games: GamesState };
      const preGame = preState.games.games[gameId];
      if (!preGame) {
        return;
      }
      // Suppress the log on initial-phase replay (game not yet started) and
      // when the phase didn't actually change — matching the pre-refactor
      // reducer's `previous !== payload.phase && game.started` guard.
      if (preGame.activePhase === phase || !preGame.started) {
        return;
      }
      const message = formatActivePhaseSet(phase);
      if (message) {
        api.dispatch(Actions.gameMessageAppended({
          gameId, playerId: EVENT_PLAYER_ID_SYSTEM, message,
        }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.turnReversed,
    effect: (action, api) => {
      const { gameId, reversed, playerId } = action.payload;
      const preState = api.getOriginalState() as { games: GamesState };
      const preGame = preState.games.games[gameId];
      if (!preGame) {
        return;
      }
      // The actor is whoever sent Command_ReverseTurn, not the active player
      // (message_log_widget.cpp logReverseTurn). Like desktop's
      // GameEventHandler::eventReverseTurn, log nothing when the actor is
      // absent, the -1 "no actor" sentinel, or not a seated player.
      if (playerId == null || !preGame.players[playerId]) {
        return;
      }
      const message = formatTurnReversed(preGame, playerId, reversed);
      if (message) {
        api.dispatch(Actions.gameMessageAppended({
          gameId, playerId, message,
        }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.playerJoined,
    effect: (action, api) => {
      const { gameId, playerProperties } = action.payload;
      const preState = api.getOriginalState() as { games: GamesState };
      const preGame = preState.games.games[gameId];
      if (!preGame) {
        return;
      }
      const postState = api.getState() as { games: GamesState };
      const postGame = postState.games.games[gameId];
      if (!postGame) {
        return;
      }
      const message = formatPlayerJoined(postGame, playerProperties.playerId);
      if (message) {
        api.dispatch(Actions.gameMessageAppended({
          gameId, playerId: playerProperties.playerId, message,
        }));
      }
    },
  });

  mw.startListening({
    actionCreator: Actions.playerLeft,
    effect: (action, api) => {
      const { gameId, playerId, reason } = action.payload;
      // @critical Pre-mutation read; reducer deletes the player. See .github/instructions/datatrice-game.instructions.md#listener-patterns.
      const preState = api.getOriginalState() as { games: GamesState };
      const preGame = preState.games.games[gameId];
      if (!preGame) {
        return;
      }
      const playerName = preGame.players[playerId]?.properties.userInfo?.name ?? 'Unknown player';
      const message = formatLeaveMessage(playerName, reason);
      api.dispatch(Actions.gameMessageAppended({ gameId, playerId, message }));
    },
  });
}
