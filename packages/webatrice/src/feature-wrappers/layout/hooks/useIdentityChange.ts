import { useEffect, useRef } from 'react';

import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { readLocalStorage, writeLocalStorage } from '@app/services';

/** Owner (`${serverName}::${userName}`) of the persisted sticky tabs. */
const STICKY_OWNER_KEY = 'webatrice.stickyTabs.owner';

/**
 * Calls `onChange` when a sign-in belongs to a different server or user than
 * the last one. Deck ids are per user on Servatrice, so deck tabs and caches
 * from the previous identity are stale.
 *
 * The identity is recorded after every sign-in. The first one ever, and a
 * sign-in as the same identity, report nothing. Runs on an identity change
 * only, not on every render or route hop; `onChange` sees the latest render.
 */
export function useIdentityChange(onChange: () => void): void {
  const serverName = useAppSelector(server.Selectors.getName);
  const userName = useAppSelector(server.Selectors.getUser)?.name;
  const identity = serverName && userName ? `${serverName}::${userName}` : null;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (identity == null) {
      return;
    }
    const previous = readLocalStorage(STICKY_OWNER_KEY);
    if (previous && previous !== identity) {
      onChangeRef.current();
    }
    writeLocalStorage(STICKY_OWNER_KEY, identity);
  }, [identity]);
}
