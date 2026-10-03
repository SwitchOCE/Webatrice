import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { server } from '@cockatrice/datatrice';
import { useAppSelector } from '@app/store';
import { RouteEnum } from '@app/types';

import { captureDeckShareLink, takePendingDeckShareLink } from '../deckSharing';

/**
 * Opens a share link the page was loaded with (`#share=…&hostname=…&port=…`)
 * once the user is logged in, the way desktop's `IntentOpenSharedDeck` waits
 * for its connection. The link is read from the address once, on mount, and
 * kept in memory only until then.
 *
 * Mounted once in AppShell, after the routes, so its navigation lands after
 * the login page's own redirect to the server tab. Renders nothing.
 */
export function DeckShareLinkRedirect() {
  const navigate = useNavigate();
  const isConnected = useAppSelector(server.Selectors.getIsConnected);
  // Read the address before anything else navigates (once, on first render).
  useState(captureDeckShareLink);

  useEffect(() => {
    if (!isConnected) {
      return;
    }
    const query = takePendingDeckShareLink();
    if (query !== null) {
      navigate({ pathname: RouteEnum.SHARED_DECK, search: `?${query}` });
    }
  }, [isConnected, navigate]);

  return null;
}
