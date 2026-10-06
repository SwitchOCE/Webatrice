import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { server } from '@cockatrice/datatrice';
import type { Event_UserMessage } from '@cockatrice/sockatrice/generated';

import { useNotify } from '@app/components';
import { getPreferencesSnapshot, playSound, useActionFeed } from '@app/hooks';
import { isPageHidden } from '@app/services';
import { RouteEnum } from '@app/types';
import { chatFilterVerdicts, visiblePrivateMessages } from '@app/utils';

/**
 * Global notifier for incoming private-chat messages (desktop TabMessage::processUserMessageEvent).
 * Renders nothing — observes incoming private-message actions, and for every NEW inbound
 * (senderName !== self) entry the Chat preferences let through:
 *   • plays the private-message sound unless that conversation is on screen,
 *   • raises a notification: an OS notification while the window is inactive and "Enable desktop
 *     notifications for private messages" is on, otherwise an in-app toast. Either one opens
 *     `/player/<senderName>` on click (TopBar marks player tabs sticky, so an existing chat tab is
 *     focused rather than duplicated).
 *
 * Nothing is raised while the user is reading that peer's Player page in a focused window — they
 * see the message live.
 *
 * Mounted once inside AppShell below the Router so `useNavigate` / `useLocation` work.
 */
export default function PrivateMessageNotifier() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useNotify();
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  // Use the same synchronous action feed as room preference verdicts in AppAlerts.
  // tab_supervisor.cpp:1386 decides before a subsequent user-left event can remove the sender.
  useActionFeed((action, _before, state) => {
    if (action.type !== server.Types.USER_MESSAGE) {
      return;
    }
    const { messageData } = action.payload as { messageData: Event_UserMessage };
    const selfName = state.server.user?.name ?? null;
    if (!selfName) {
      return;
    }
    const peer = messageData.senderName === selfName ? messageData.receiverName : messageData.senderName;
    const list = state.server.messages[peer] ?? [];
    const entry = list.at(-1);
    const prefs = getPreferencesSnapshot();
    const visible = visiblePrivateMessages(
      list,
      { selfName, peer: state.server.users[peer], peerIsBuddy: Boolean(state.server.buddyList[peer]) },
      prefs,
      chatFilterVerdicts,
    );
    if (!entry || entry.senderName === selfName || !visible.includes(entry)) {
      return;
    }
    const peerPath = generatePath(RouteEnum.PLAYER, { name: entry.senderName });
    const onPeerPage = matchPath({ path: RouteEnum.PLAYER, end: true }, pathnameRef.current)
      ?.params.name === entry.senderName;
    if (onPeerPage && !isPageHidden()) {
      return;
    }
    if (!onPeerPage) {
      playSound('private_message');
    }
    notify({
      title: t('PrivateMessageNotifier.title', { sender: entry.senderName }),
      body: entry.message,
      tag: `pm:${entry.senderName}`,
      system: prefs.showMessagePopups,
      toast: !onPeerPage,
      icon: MessageSquare,
      onActivate: () => navigate(peerPath),
    });
  });

  return null;
}
