import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { server } from '@cockatrice/datatrice';
import type { DeckSharingFailedPayload } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useCommandFailureMessage, useReduxEffect } from '@app/hooks';
import { useAppSelector } from '@app/store';

/**
 * The caller's own share links (`Command_DeckShareListMine`) and revoking one
 * (`Command_DeckShareRemove`). Servatrice offers both for reviewing links
 * before they expire; desktop has no view of them yet.
 */
export function useDeckShareLinks(active: boolean) {
  const webClient = useWebClient();
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  const shares = useAppSelector(server.Selectors.getDeckSharesMine);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setError(null);
    webClient.request.session.deckShareListMine();
  };

  useEffect(() => {
    if (active) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- list again each time the view opens
  }, [active]);

  useReduxEffect<DeckSharingFailedPayload>(({ payload: { command, responseCode, failure } }) => {
    if (command === 'deckShareListMine') {
      setError(describeFailure(failure, t('DeckShareLinks.listFailed', { code: responseCode })));
    } else if (command === 'deckShareRemove') {
      setError(describeFailure(failure, t('DeckShareLinks.revokeFailed', { code: responseCode })));
    }
  }, server.Types.DECK_SHARING_FAILED, [describeFailure, t]);

  const revoke = (shareId: number) => {
    setError(null);
    webClient.request.session.deckShareRemove(shareId);
  };

  return { shares, error, refresh, revoke };
}
