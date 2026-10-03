import { useWebClient } from '@cockatrice/datatrice/react';
import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';

import { useContextMenu, type ContextMenuTrigger } from '../Menu';

export interface UserDisplay {
  /** The user's context menu: right-click, Shift+F10 or the Menu key on the name open it. */
  menu: ContextMenuTrigger;
  isABuddy: boolean;
  isIgnored: boolean;
  onAddBuddy: () => void;
  onRemoveBuddy: () => void;
  onAddIgnore: () => void;
  onRemoveIgnore: () => void;
}

export function useUserDisplay(userName: string): UserDisplay {
  const buddyList = useAppSelector((state) => server.Selectors.getBuddyList(state));
  const ignoreList = useAppSelector((state) => server.Selectors.getIgnoreList(state));
  const menu = useContextMenu();
  const webClient = useWebClient();

  const isABuddy = Boolean(buddyList[userName]);
  const isIgnored = Boolean(ignoreList[userName]);

  const onAddBuddy = () => {
    webClient.request.session.addToBuddyList(userName);
    menu.close();
  };
  const onRemoveBuddy = () => {
    webClient.request.session.removeFromBuddyList(userName);
    menu.close();
  };
  const onAddIgnore = () => {
    webClient.request.session.addToIgnoreList(userName);
    menu.close();
  };
  const onRemoveIgnore = () => {
    webClient.request.session.removeFromIgnoreList(userName);
    menu.close();
  };

  return {
    menu,
    isABuddy,
    isIgnored,
    onAddBuddy,
    onRemoveBuddy,
    onAddIgnore,
    onRemoveIgnore,
  };
}
