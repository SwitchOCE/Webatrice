import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, useNavigate } from 'react-router-dom';

import { games, rooms, server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { ServerInfo_Game } from '@cockatrice/sockatrice/generated';
import { AlertDialog, ConfirmDialog, PromptDialog } from '@app/dialogs';
import { useReduxEffect } from '@app/hooks';
import { useAppDispatch, useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';
import { gameLinkServer, isSameServerHost, parseGameJoinLink, type GameJoinLink } from '@app/utils';

import { clearGameLinkRequest, useGameLinkRequest } from './gameLinkRequests';

/** Desktop IntentJoinServerGame::waitForGame gives the room's game list 15 s to show the game. */
export const GAME_LINK_WAIT_MS = 15_000;

type Flow =
  | { step: 'idle' }
  | { step: 'notice'; title: string; message: string }
  | { step: 'confirm'; link: GameJoinLink }
  | { step: 'awaitGame'; link: GameJoinLink }
  | { step: 'confirmSpectate'; link: GameJoinLink; game: ServerInfo_Game }
  | { step: 'password'; link: GameJoinLink; game: ServerInfo_Game; spectator: boolean }
  | { step: 'joining'; link: GameJoinLink };

const IDLE: Flow = { step: 'idle' };

/**
 * Runs a clicked game link through desktop's join chain
 * (url_parser.cpp createJoinGameIntent → IntentJoinServerGame →
 * GameSelector::joinGame): validate, confirm, join the room if needed, wait
 * for the game to be listed, offer spectating when it is full, ask for the
 * password, then send Command_JoinGame and open the game.
 *
 * Desktop can also log in to another server first; a browser session holds
 * one connection, so a link for another server explains that instead.
 * Mounted once in AppShell, inside the router.
 */
export default function GameLinkJoinHost() {
  const { t } = useTranslation();
  const webClient = useWebClient();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const request = useGameLinkRequest();
  const [flow, setFlow] = useState<Flow>(IDLE);

  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  const joinedRoomIds = useAppSelector(rooms.Selectors.getJoinedRoomIds);
  const activeGameIds = useAppSelector(games.Selectors.getActiveGameIds);
  const joinError = useAppSelector(rooms.Selectors.getJoinGameError);
  const roomId = flow.step === 'idle' || flow.step === 'notice' ? undefined : flow.link.roomId;
  const room = useAppSelector((state) => (roomId != null ? rooms.Selectors.getRoom(state, roomId) : undefined));
  const awaitedGame = flow.step === 'awaitGame' ? room?.games[flow.link.gameId]?.info : undefined;

  const target = webClient.connectTarget;
  const serverLabel = (link: GameJoinLink) => `${link.hostname}:${link.port}`;
  const close = useCallback(() => setFlow(IDLE), []);

  // A click on a game link: validate it like desktop, then ask.
  useEffect(() => {
    if (!request) {
      return;
    }
    clearGameLinkRequest();
    const parsed = parseGameJoinLink(request.url);
    if (parsed.ok === false) {
      setFlow({ step: 'notice', title: t('GameLink.invalid.title'), message: t(`GameLink.invalid.${parsed.error}`) });
      return;
    }
    setFlow({ step: 'confirm', link: parsed.link });
  }, [request, t]);

  const sendJoin = useCallback(
    (link: GameJoinLink, spectator: boolean, password: string) => {
      setFlow({ step: 'joining', link });
      webClient.request.rooms.joinGame(link.roomId, {
        gameId: link.gameId,
        password,
        spectator,
        overrideRestrictions: false,
        joinAsJudge: false,
      });
    },
    [webClient],
  );

  // GameSelector::joinGame, minus the room-tab lookup the caller already did.
  const beginGameJoin = useCallback(
    (link: GameJoinLink, game: ServerInfo_Game, spectator: boolean) => {
      if (game.withPassword && !(spectator && !game.spectatorsNeedPassword)) {
        setFlow({ step: 'password', link, game, spectator });
        return;
      }
      sendJoin(link, spectator, '');
    },
    [sendJoin],
  );

  const joinListedGame = useCallback(
    (link: GameJoinLink, game: ServerInfo_Game) => {
      if (activeGameIds.includes(link.gameId)) {
        setFlow(IDLE);
        navigate(generatePath(RouteEnum.GAME, { gameId: String(link.gameId) }));
        return;
      }
      if (game.playerCount >= game.maxPlayers) {
        setFlow({ step: 'confirmSpectate', link, game });
        return;
      }
      beginGameJoin(link, game, false);
    },
    [activeGameIds, navigate, beginGameJoin],
  );

  const confirmJoin = useCallback(
    (link: GameJoinLink) => {
      if (!isConnected || !target || !isSameServerHost(gameLinkServer(target).hostname, link.hostname)) {
        setFlow({
          step: 'notice',
          title: t('GameLink.confirm.title'),
          message: t('GameLink.otherServer', { server: serverLabel(link) }),
        });
        return;
      }
      if (!joinedRoomIds[link.roomId]) {
        webClient.request.session.joinRoom(link.roomId);
      }
      setFlow({ step: 'awaitGame', link });
    },
    [isConnected, target, joinedRoomIds, webClient, t],
  );

  // IntentJoinServerGame::tryJoinGame / waitForGame.
  useEffect(() => {
    if (flow.step !== 'awaitGame') {
      return;
    }
    if (awaitedGame) {
      joinListedGame(flow.link, awaitedGame);
      return;
    }
    const timer = setTimeout(() => {
      setFlow({
        step: 'notice',
        title: t('GameLink.invalid.title'),
        message: t('GameLink.notFound', { gameId: flow.link.gameId }),
      });
    }, GAME_LINK_WAIT_MS);
    return () => clearTimeout(timer);
  }, [flow, awaitedGame, joinListedGame, t]);

  useReduxEffect<{ data: { gameInfo?: { gameId: number } } }>(
    ({ payload }) => {
      if (flow.step === 'joining' && payload.data.gameInfo?.gameId === flow.link.gameId) {
        setFlow(IDLE);
        navigate(generatePath(RouteEnum.GAME, { gameId: String(flow.link.gameId) }));
      }
    },
    games.Types.GAME_JOINED,
    [flow, navigate],
  );

  const joinFailed = flow.step === 'joining' && joinError !== null;
  const dismissJoinError = () => {
    dispatch(rooms.Actions.clearJoinGameError());
    setFlow(IDLE);
  };

  const confirmMessage = (link: GameJoinLink) => {
    const roomName = joinedRoomIds[link.roomId] ? room?.info.name : undefined;
    const args = { description: link.description, gameId: link.gameId, room: roomName, server: serverLabel(link) };
    if (link.description) {
      return roomName ? t('GameLink.confirm.descriptionInRoom', args) : t('GameLink.confirm.description', args);
    }
    return roomName ? t('GameLink.confirm.idInRoom', args) : t('GameLink.confirm.id', args);
  };

  return (
    <>
      <ConfirmDialog
        isOpen={flow.step === 'confirm'}
        title={t('GameLink.confirm.title')}
        message={flow.step === 'confirm' ? confirmMessage(flow.link) : ''}
        confirmLabel={t('GameLink.yes')}
        cancelLabel={t('GameLink.no')}
        onConfirm={() => flow.step === 'confirm' && confirmJoin(flow.link)}
        onCancel={close}
      />
      <ConfirmDialog
        isOpen={flow.step === 'confirmSpectate'}
        title={t('GameLink.confirm.title')}
        message={t('GameLink.full')}
        confirmLabel={t('GameLink.yes')}
        cancelLabel={t('GameLink.no')}
        onConfirm={() => flow.step === 'confirmSpectate' && beginGameJoin(flow.link, flow.game, true)}
        onCancel={close}
      />
      <PromptDialog
        isOpen={flow.step === 'password'}
        title={t('GameLink.confirm.title')}
        label={
          flow.step === 'password' && flow.game.description
            ? t('GameLink.password.description', { description: flow.game.description })
            : t('GameLink.password.id', { gameId: flow.step === 'password' ? flow.link.gameId : 0 })
        }
        submitLabel={t('GameLink.join')}
        onSubmit={(password) => flow.step === 'password' && sendJoin(flow.link, flow.spectator, password)}
        onCancel={close}
      />
      <AlertDialog
        isOpen={flow.step === 'notice'}
        title={flow.step === 'notice' ? flow.title : ''}
        message={flow.step === 'notice' ? flow.message : ''}
        onDismiss={close}
      />
      <AlertDialog
        isOpen={joinFailed}
        title={t('GameLink.confirm.title')}
        message={joinError?.message ?? ''}
        onDismiss={dismissJoinError}
      />
    </>
  );
}
