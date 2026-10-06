import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { AtSign, UserCheck } from 'lucide-react';
import { games, rooms, server, type GamesState, type Message } from '@cockatrice/datatrice';
import { Event_RoomSay_RoomMessageType, type ServerInfo_User } from '@cockatrice/sockatrice/generated';

import { useNotify } from '@app/components';
import { getPreferencesSnapshot, playSound, settingsStore, useActionFeed } from '@app/hooks';
import { isPageInactive, requestAttention, soundEngine } from '@app/services';
import type { RootState } from '@app/store';
import { RouteEnum } from '@app/types';
import { chatFilterVerdicts, findChatAlert, isPrivilegedUser, isRoomMessageVisible, parseHighlightWords } from '@app/utils';

import { gameEventSound, isGameAttentionEvent, type ObservedAction } from './gameEventSound';

const GAME_ACTION_PREFIX = `${games.Types.GAME_JOINED.split('/')[0]}/`;

/**
 * App-wide sound and notification feedback for server events, as desktop's tabs give it whether
 * or not they are on screen: game event sounds and the taskbar-style tab marker
 * (MessageLogWidget, TabSupervisor::tabUserEvent), room mentions and alert words (ChatView,
 * TabRoom::actShowMentionPopup) and buddies signing on or off (TabAccount, TabSupervisor).
 * Private messages have their own notifier. Renders nothing; mounted once inside the Router.
 */
export default function AppAlerts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  useEffect(() => settingsStore.subscribe(() => {
    if (!getPreferencesSnapshot().soundEnabled) {
      soundEngine.stop();
    }
  }), []);

  useActionFeed((action, before, after) => {
    if (action.type?.startsWith(GAME_ACTION_PREFIX)) {
      onGameEvent(action, before.games, after.games);
    } else if (action.type === rooms.Types.ADD_MESSAGE) {
      onRoomMessage(action.payload as { roomId: number; message: Message }, after);
    } else if (action.type === server.Types.USER_JOINED) {
      onUserJoined((action.payload as { user: ServerInfo_User }).user.name, before);
    } else if (action.type === server.Types.USER_LEFT) {
      onUserLeft((action.payload as { name: string }).name, before);
    }
  });

  function onGameEvent(action: ObservedAction, before: GamesState, after: GamesState) {
    const sound = gameEventSound(action, before, after);
    if (sound) {
      playSound(sound);
    }
    const prefs = getPreferencesSnapshot();
    if (!prefs.notificationsEnabled || !isGameAttentionEvent(action.type)) {
      return;
    }
    const { gameId } = action.payload as { gameId: number };
    const spectating = (after.games[gameId] ?? before.games[gameId])?.spectator ?? false;
    if (!spectating || prefs.spectatorNotificationsEnabled) {
      requestAttention();
    }
  }

  function onRoomMessage({ roomId, message }: { roomId: number; message: Message }, state: RootState) {
    const prefs = getPreferencesSnapshot();
    const users = state.rooms.rooms[roomId]?.users ?? {};
    // Desktop filters a line once, as it arrives: settle its verdict now, against the sender and
    // preferences of this moment, and RoomChat shows what was decided. Ignored senders never get
    // here: Datatrice drops them before ADD_MESSAGE. Client notices (flood, not sent) are added
    // by their own action and raise nothing.
    const stored = state.rooms.messages[roomId]?.at(-1) ?? message;
    const filter = { roomHistory: prefs.roomHistory, ignoreUnregisteredUsers: prefs.ignoreUnregisteredUsers };
    if (!isRoomMessageVisible(stored, users, filter, chatFilterVerdicts)) {
      return;
    }
    const selfName = state.server.user?.name ?? null;
    // History replays old lines on join; desktop's alerts are for new ones.
    if (message.messageType === Event_RoomSay_RoomMessageType.ChatHistory || !message.name || message.name === selfName) {
      return;
    }
    const alert = findChatAlert(message.message, {
      selfName,
      userNames: Object.keys(state.server.users),
      mentions: prefs.chatMention,
      highlightWords: parseHighlightWords(prefs.chatHighlightWords),
      senderIsModerator: isPrivilegedUser(users[message.name]),
    });
    if (!alert) {
      return;
    }
    requestAttention();
    if (alert === 'word') {
      return;
    }
    playSound(alert === 'mention' ? 'chat_mention' : 'all_mention');

    const roomPath = generatePath(RouteEnum.ROOM, { roomId: String(roomId) });
    const onRoomPage = matchPath({ path: RouteEnum.ROOM, end: true }, pathnameRef.current)
      ?.params.roomId === String(roomId);
    if (!prefs.showMentionPopups || (onRoomPage && !isPageInactive())) {
      return;
    }
    notify({
      title: t('AppAlerts.mention', { sender: message.name }),
      body: message.message,
      tag: `mention:${roomId}`,
      system: true,
      toast: !onRoomPage,
      icon: AtSign,
      onActivate: () => navigate(roomPath),
    });
  }

  function onUserJoined(name: string, before: RootState) {
    if (!before.server.buddyList[name]) {
      return;
    }
    playSound('buddy_join');
    const prefs = getPreferencesSnapshot();
    if (!prefs.notificationsEnabled || !prefs.buddyConnectNotificationsEnabled) {
      return;
    }
    requestAttention();
    notify({
      title: t('AppAlerts.buddySignedOn', { name }),
      tag: `buddy:${name}`,
      system: true,
      toast: true,
      icon: UserCheck,
      onActivate: () => navigate(generatePath(RouteEnum.PLAYER, { name })),
    });
  }

  function onUserLeft(name: string, before: RootState) {
    if (before.server.buddyList[name]) {
      playSound('buddy_leave');
    }
  }

  return null;
}
