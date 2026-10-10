import { useEffect, useMemo, useRef, useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import {
  currentMaxExpandedChats,
  dispatchChatDock,
  getPreferencesSnapshot,
  useActionFeed,
  useChatDockState,
  type DockedChat,
} from '@app/hooks';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

import { incomingChatPeer } from './incomingChat';
import { splitDock } from './splitDock';

const TRAY_SELECTOR = '[style*="--board-tray-h"], [data-board-tray-h]';
const TRAY_POLL_MS = 500;

export function readBoardTrayHeight(root: ParentNode = document): string {
  const el = root.querySelector<HTMLElement>(TRAY_SELECTOR);
  if (!el) {
    return '0px';
  }
  return getComputedStyle(el).getPropertyValue('--board-tray-h').trim() || el.dataset.boardTrayH || '0px';
}

function useBoardTrayOffset(active: boolean): string {
  const [offset, setOffset] = useState('0px');
  useEffect(() => {
    if (!active) {
      setOffset('0px');
      return undefined;
    }
    const read = () => setOffset(readBoardTrayHeight());
    read();
    const id = window.setInterval(read, TRAY_POLL_MS);
    return () => window.clearInterval(id);
  }, [active]);
  return offset;
}

export interface ChatDockView {
  visible: boolean;
  windows: DockedChat[];
  bars: DockedChat[];
  bottom: string;
  focus: { name: string; seq: number } | null;
}

export function useChatDockController(): ChatDockView {
  const selfName = useAppSelector((state) => server.Selectors.getUser(state)?.name ?? null);
  const dock = useChatDockState();
  const { pathname } = useLocation();
  const gameId = matchPath({ path: RouteEnum.GAME, end: true }, pathname)?.params.gameId ?? null;
  const onPopup = matchPath({ path: RouteEnum.CARD_PREVIEW_POPUP, end: true }, pathname) !== null;

  const sessionUser = useRef(selfName);
  useEffect(() => {
    if (sessionUser.current !== selfName) {
      sessionUser.current = selfName;
      dispatchChatDock({ type: 'reset' });
    }
  }, [selfName]);
  useEffect(() => () => dispatchChatDock({ type: 'reset' }), []);

  useEffect(() => {
    const onResize = () => dispatchChatDock({ type: 'fit', max: currentMaxExpandedChats() });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (gameId !== null) {
      dispatchChatDock({ type: 'collapseAll' });
    }
  }, [gameId]);

  useActionFeed((action, _before, after) => {
    const peer = incomingChatPeer(action, after, getPreferencesSnapshot());
    if (peer) {
      dispatchChatDock({ type: 'receive', name: peer });
    }
  });

  const bottom = useBoardTrayOffset(gameId !== null);
  const { windows, bars } = useMemo(() => splitDock(dock.chats, selfName), [dock.chats, selfName]);

  return {
    visible: Boolean(selfName) && !onPopup && windows.length + bars.length > 0,
    windows,
    bars,
    bottom,
    focus: dock.focus,
  };
}
