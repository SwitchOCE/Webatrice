import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

function findTray(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>(TRAY_SELECTOR);
}

function trayHeight(el: HTMLElement | null): string {
  if (!el) {
    return '0px';
  }
  return getComputedStyle(el).getPropertyValue('--board-tray-h').trim() || el.dataset.boardTrayH || '0px';
}

export function readBoardTrayHeight(root: ParentNode = document): string {
  return trayHeight(findTray(root));
}

export function watchBoardTray(onChange: (height: string) => void, root: HTMLElement = document.body): () => void {
  let tray: HTMLElement | null = null;
  let resize: ResizeObserver | null = null;
  const style = new MutationObserver(() => onChange(trayHeight(tray)));
  const attach = (next: HTMLElement | null) => {
    if (next === tray) {
      return;
    }
    tray = next;
    style.disconnect();
    resize?.disconnect();
    if (tray) {
      style.observe(tray, { attributes: true, attributeFilter: ['style', 'data-board-tray-h'] });
      if (typeof ResizeObserver !== 'undefined') {
        resize = new ResizeObserver(() => onChange(trayHeight(tray)));
        resize.observe(tray);
      }
    }
    onChange(trayHeight(tray));
  };
  const finder = new MutationObserver(() => {
    if (!tray?.isConnected) {
      attach(findTray(root));
    }
  });
  finder.observe(root, { childList: true, subtree: true });
  const first = findTray(root);
  if (first) {
    attach(first);
  } else {
    onChange('0px');
  }
  return () => {
    finder.disconnect();
    style.disconnect();
    resize?.disconnect();
  };
}

function useBoardTrayOffset(active: boolean): string {
  const [offset, setOffset] = useState('0px');
  useLayoutEffect(() => {
    if (!active) {
      setOffset('0px');
      return undefined;
    }
    return watchBoardTray(setOffset);
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

  const { windows, bars } = useMemo(() => splitDock(dock.chats, selfName), [dock.chats, selfName]);
  const bottom = useBoardTrayOffset(gameId !== null && windows.length + bars.length > 0);

  return {
    visible: Boolean(selfName) && !onPopup && windows.length + bars.length > 0,
    windows,
    bars,
    bottom,
    focus: dock.focus,
  };
}
