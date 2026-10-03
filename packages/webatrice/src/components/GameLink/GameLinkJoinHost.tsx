import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { games, rooms, server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { ServerInfo_Game } from '@cockatrice/sockatrice/generated';
import { AlertDialog, ConfirmDialog, PromptDialog } from '@app/dialogs';
import { useJoinGame, useNavigateOnGameJoined } from '@app/hooks';
import { useAppSelector } from '@app/store';
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
  | { step: 'joining'; link: GameJoinLink; game: ServerInfo_Game };

const IDLE: Flow = { step: 'idle' };

/** Routes to the game once the server confirms the join; mounted only while a link join is in flight. */
function NavigateOnLinkJoin({ onJoined }: { onJoined: (gameId: number) => void }) {
  useNavigateOnGameJoined(onJoined);
  return null;
}

/**
 * Runs a clicked game link through desktop's join chain
 * (url_parser.cpp createJoinGameIntent → IntentJoinServerGame →
 * GameSelector::joinGame): validate, confirm, join the room if needed, wait
 * for the game to be listed, offer spectating when it is full, then hand the
 * join to the shared `useJoinGame` flow (password, Command_JoinGame, open
 * the game).
 *
 * Desktop can also log in to another server first; a browser session holds
 * one connection, so a link for another server explains that instead.
 * Mounted once in AppShell, inside the router. The host owns the join it
 * sends, so it reports that join's rejection on every page (useJoinGame shows
 * a rejection only in the flow that sent the join).
 */
export default function GameLinkJoinHost() {
  const { t } = useTranslation();
  const webClient = useWebClient();
  const request = useGameLinkRequest();
  const [flow, setFlow] = useState<Flow>(IDLE);
  const { beginJoin, passwordRequired, submitPassword, cancelPassword, joinError, clearJoinError } = useJoinGame();

  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  const joinedRoomIds = useAppSelector(rooms.Selectors.getJoinedRoomIds);
  const activeGameIds = useAppSelector(games.Selectors.getActiveGameIds);
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

  const startJoin = useCallback(
    (link: GameJoinLink, game: ServerInfo_Game, spectator: boolean) => {
      // useJoinGame routes straight to a game that is already open.
      setFlow(activeGameIds.includes(game.gameId) ? IDLE : { step: 'joining', link, game });
      beginJoin(link.roomId, game, spectator, false);
    },
    [activeGameIds, beginJoin],
  );

  // IntentJoinServerGame asks before spectating a full game; useJoinGame would spectate silently.
  const joinListedGame = useCallback(
    (link: GameJoinLink, game: ServerInfo_Game) => {
      if (!activeGameIds.includes(game.gameId) && game.playerCount >= game.maxPlayers) {
        setFlow({ step: 'confirmSpectate', link, game });
        return;
      }
      startJoin(link, game, false);
    },
    [activeGameIds, startJoin],
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

  const joining = flow.step === 'joining' ? flow : null;
  const onLinkJoined = useCallback(
    (gameId: number) => {
      if (joining?.link.gameId === gameId) {
        setFlow(IDLE);
      }
    },
    [joining],
  );

  // A rejection of the link's join is this flow's to show.
  const joinFailed = joining !== null && joinError !== null;

  const dismissJoinError = () => {
    clearJoinError();
    setFlow(IDLE);
  };

  const cancelJoinPassword = () => {
    cancelPassword();
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
        onConfirm={() => flow.step === 'confirmSpectate' && startJoin(flow.link, flow.game, true)}
        onCancel={close}
      />
      <PromptDialog
        isOpen={joining !== null && passwordRequired}
        title={t('GameLink.confirm.title')}
        label={
          joining?.game.description
            ? t('GameLink.password.description', { description: joining.game.description })
            : t('GameLink.password.id', { gameId: joining?.link.gameId ?? 0 })
        }
        submitLabel={t('GameLink.join')}
        onSubmit={submitPassword}
        onCancel={cancelJoinPassword}
      />
      <AlertDialog
        isOpen={flow.step === 'notice'}
        title={flow.step === 'notice' ? flow.title : ''}
        message={flow.step === 'notice' ? flow.message : ''}
        onDismiss={close}
      />
      {joining && <NavigateOnLinkJoin onJoined={onLinkJoined} />}
      <AlertDialog
        isOpen={joinFailed}
        title={t('GameLink.confirm.title')}
        message={joinError?.message ?? ''}
        onDismiss={dismissJoinError}
      />
    </>
  );
}
