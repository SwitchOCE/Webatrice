import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { server } from '@cockatrice/datatrice';
import type { Event_UserMessage } from '@cockatrice/sockatrice/generated';

import { useNotify } from '@app/components';
import { getPreferencesSnapshot, playSound, useActionFeed } from '@app/hooks';
import { isPageInactive } from '@app/services';
import { RouteEnum } from '@app/types';
import { chatFilterVerdicts, visiblePrivateMessages } from '@app/utils';

export default function PrivateMessageNotifier() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useNotify();
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

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
    if (onPeerPage && !isPageInactive()) {
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
