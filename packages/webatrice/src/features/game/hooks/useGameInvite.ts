import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Send } from 'lucide-react';

import { games, server } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { usePushToast } from '@app/components';
import { useAppSelector } from '@app/store';
import { gameLinkServer, makeGameJoinLink } from '@app/utils';

export interface GameInvite {
  /** The desktop join link for this game; null when the game or server is unknown. */
  link: string | null;
  onlyBuddies: boolean;
  /** Self, players and spectators — never offered in the invite list. */
  excludeNames: ReadonlySet<string>;
  copyLink: () => void;
  sendInvite: (userName: string) => void;
}

/**
 * Copy game link / Invite to Game (desktop tab_game.cpp actCopyGameLink /
 * actInviteToGame + DlgInviteToGame::inviteCurrentUser). The invite is a
 * private message carrying the join link, prefixed with the game's
 * description and id, exactly as desktop sends it.
 */
export function useGameInvite(gameId: number): GameInvite {
  const { t } = useTranslation();
  const webClient = useWebClient();
  const pushToast = usePushToast();
  const game = useAppSelector((state) => games.Selectors.getGame(state, gameId));
  const selfName = useAppSelector((state) => server.Selectors.getUser(state)?.name ?? null);

  const target = webClient.connectTarget;
  const roomId = game?.info.roomId;
  const description = game?.info.description ?? '';
  const link = useMemo(() => {
    if (!target || roomId == null) {
      return null;
    }
    return makeGameJoinLink({ ...gameLinkServer(target), roomId, gameId, description });
  }, [target, roomId, gameId, description]);

  const players = game?.players;
  const excludeNames = useMemo(() => {
    const names = new Set<string>();
    if (selfName) {
      names.add(selfName);
    }
    for (const player of Object.values(players ?? {})) {
      const name = player.properties.userInfo?.name;
      if (name) {
        names.add(name);
      }
    }
    return names;
  }, [players, selfName]);

  const copyLink = useCallback(() => {
    if (!link) {
      return;
    }
    navigator.clipboard.writeText(link).then(
      () => pushToast(t('GameInvite.linkCopied'), { icon: Link }),
      () => pushToast(t('GameInvite.linkCopyFailed'), { icon: Link }),
    );
  }, [link, pushToast, t]);

  const sendInvite = useCallback(
    (userName: string) => {
      if (!link) {
        return;
      }
      const prefix = description
        ? t('GameInvite.messageWithDescription', { description, gameId })
        : t('GameInvite.message', { gameId });
      webClient.request.session.message(userName, `${prefix} ${link}`);
      pushToast(t('GameInvite.inviteSent', { name: userName }), { icon: Send });
    },
    [link, description, gameId, webClient, pushToast, t],
  );

  return {
    link,
    onlyBuddies: game?.info.onlyBuddies ?? false,
    excludeNames,
    copyLink,
    sendInvite,
  };
}
