import { useRef } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { server } from '@cockatrice/datatrice';
import type { Event_UserMessage } from '@cockatrice/sockatrice/generated';

import { afterChatRender, useNotify } from '@app/components';
import { getPreferencesSnapshot, playSound, useActionFeed } from '@app/hooks';
import { isPageInactive } from '@app/services';
import { RouteEnum } from '@app/types';
import { chatFilterVerdicts, visiblePrivateMessages } from '@app/utils';

export default function PrivateMessageNotifier() {
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
    const sender = entry.senderName;
    const announce = (shown: boolean) => {
      const read = shown && !isPageInactive();
      if (!shown) {
        playSound('private_message');
      }
      notify({
        entry: { kind: 'message', actor: sender, body: entry.message, target: { type: 'chat', userName: sender } },
        tag: `pm:${sender}`,
        system: prefs.showMessagePopups && !read,
        toast: !shown,
        read,
      });
    };
    const onPeerPage = matchPath({ path: RouteEnum.PLAYER, end: true }, pathnameRef.current)?.params.name === sender;
    if (onPeerPage) {
      announce(true);
    } else {
      afterChatRender(sender, announce);
    }
  });

  return null;
}
