import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePath, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { server } from '@cockatrice/datatrice';

import { useNotify } from '@app/components';
import { getPreferencesSnapshot, playSound, usePrivateMessageFilter } from '@app/hooks';
import { isPageHidden } from '@app/services';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';
import { visiblePrivateMessages } from '@app/utils';

/**
 * Global notifier for incoming private-chat messages (desktop TabMessage::processUserMessageEvent).
 * Renders nothing — subscribes to `state.server.messages`, and for every NEW inbound
 * (senderName !== self) entry the Chat preferences let through:
 *   • plays the private-message sound unless that conversation is on screen,
 *   • raises a notification: an OS notification while the tab is hidden and "Enable desktop
 *     notifications for private messages" is on, otherwise an in-app toast. Either one opens
 *     `/player/<senderName>` on click (TopBar marks player tabs sticky, so an existing chat tab is
 *     focused rather than duplicated).
 *
 * Nothing is raised while the user is reading that peer's Player page in a visible tab — they
 * see the message live.
 *
 * Mounted once inside AppShell below the Router so `useNavigate` / `useLocation` work.
 */
export default function PrivateMessageNotifier() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useNotify();
  const messagesMap = useAppSelector((state) => state.server.messages);
  const selfName = useAppSelector((state) => state.server.user?.name ?? null);
  const onlineUsers = useAppSelector(server.Selectors.getUsers);
  const buddyList = useAppSelector(server.Selectors.getBuddyList);
  const filter = usePrivateMessageFilter();

  // Per-peer "already-seen count" of messages. First observation is a
  // baseline — we don't want to notify every historical message the
  // moment the notifier mounts, only NEW arrivals. `selfName` gates
  // the whole thing (nothing to compare against pre-login) and reset
  // when it changes (login as a different user).
  const seenCountRef = useRef<Map<string, number>>(new Map());
  const initializedRef = useRef(false);
  const lastSelfRef = useRef<string | null>(null);

  // Keep the "am I looking at this peer's chat?" check inside the
  // effect via a ref so the effect doesn't re-run every path change
  // (which would race the seen-count bookkeeping).
  const pathnameRef = useRef(location.pathname);
  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!selfName) {
      seenCountRef.current = new Map();
      initializedRef.current = false;
      lastSelfRef.current = null;
      return;
    }
    // Identity change (logout → login-as-other-user): re-baseline so
    // we don't notify the new user's pre-existing history.
    if (lastSelfRef.current !== selfName) {
      seenCountRef.current = new Map();
      initializedRef.current = false;
      lastSelfRef.current = selfName;
    }

    for (const [peer, list] of Object.entries(messagesMap)) {
      const previousCount = seenCountRef.current.get(peer) ?? 0;
      const currentCount = list.length;
      seenCountRef.current.set(peer, currentCount);
      // First pass across the whole map is baseline-only. Subsequent
      // passes look only at the new tail.
      if (!initializedRef.current || currentCount <= previousCount) {
        continue;
      }

      const visible = new Set(visiblePrivateMessages(
        list,
        { selfName, peer: onlineUsers[peer], peerIsBuddy: Boolean(buddyList[peer]) },
        filter,
      ));
      for (const entry of list.slice(previousCount)) {
        // Skip messages we sent (server echoes them back) and ones the
        // Chat preferences filter out.
        if (entry.senderName === selfName || !visible.has(entry)) {
          continue;
        }
        const peerPath = generatePath(RouteEnum.PLAYER, { name: entry.senderName });
        const onPeerPage = matchPath({ path: RouteEnum.PLAYER, end: true }, pathnameRef.current)
          ?.params.name === entry.senderName;
        if (onPeerPage && !isPageHidden()) {
          continue;
        }
        if (!onPeerPage) {
          playSound('private_message');
        }
        notify({
          title: t('PrivateMessageNotifier.title', { sender: entry.senderName }),
          body: entry.message,
          tag: `pm:${entry.senderName}`,
          system: getPreferencesSnapshot().showMessagePopups,
          toast: !onPeerPage,
          // Chat-related glyph — the default success checkmark reads
          // as "action confirmed", wrong for an incoming ping.
          icon: MessageSquare,
          onActivate: () => navigate(peerPath),
        });
      }
    }
    initializedRef.current = true;
  }, [messagesMap, selfName, onlineUsers, buddyList, filter, navigate, notify, t]);

  return null;
}
