import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { server, ServerCapability } from '@cockatrice/datatrice';
import type { DeckSharingFailedPayload } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { DeckSetVisibilityParams, DeckShareCreateParams, Response_DeckShareCreate } from '@cockatrice/sockatrice/generated';
import { useKnownHosts } from '@app/feature-widgets/known-hosts';
import { useCommandFailureMessage, useReduxEffect } from '@app/hooks';
import { useAppSelector } from '@app/store';
import { getHostPort } from '@app/utils';

import { buildDeckShareLink } from '../deckSharing';
import type { DeckVisibility } from '../deckTree';

/** Whether the server offers share links and public decks (Servatrice 3.1). */
export function useDeckSharingSupported(): boolean {
  return useAppSelector((state) => server.Selectors.supports(state, ServerCapability.DECK_SHARING));
}

/**
 * The host and WebSocket port this session logged into (the selected known
 * host, which login connects to), named by the share links it creates.
 */
export function useShareServer(): { hostname: string; port: string } | null {
  const selectedHost = useKnownHosts().value?.selectedHost;
  if (!selectedHost) {
    return null;
  }
  const { host, port } = getHostPort(selectedHost);
  return { hostname: host, port };
}

export type DeckShareCreateState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'created'; link: string; expiresAt: bigint; itemCount: number; copied: boolean }
  | { status: 'failed'; message: string };

/** Desktop `DeckShareUtils::copyShareLinkToClipboard`; a browser may refuse it. */
export async function copyShareLink(link: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a share link (desktop `DlgShareDeck` / `TabDeckStorage::actShareSelection`):
 * send `Command_DeckShareCreate`, then build the link and copy it to the
 * clipboard. One request at a time; an answer nobody here asked for is ignored.
 */
export function useDeckShareCreate() {
  const webClient = useWebClient();
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  const shareServer = useShareServer();
  const [state, setState] = useState<DeckShareCreateState>({ status: 'idle' });
  const pendingRef = useRef(false);

  const finish = useCallback(async (share: Response_DeckShareCreate) => {
    if (!shareServer) {
      setState({ status: 'failed', message: t('DeckSharing.noServer') });
      return;
    }
    const link = buildDeckShareLink(window.location.href, { token: share.token, ...shareServer });
    setState({ status: 'created', link, expiresAt: share.expiresAt, itemCount: share.itemCount, copied: false });
    const copied = await copyShareLink(link);
    setState((current) => (current.status === 'created' && current.link === link ? { ...current, copied } : current));
  }, [shareServer, t]);

  useReduxEffect<{ share: Response_DeckShareCreate }>(({ payload: { share } }) => {
    if (!pendingRef.current) {
      return;
    }
    pendingRef.current = false;
    void finish(share);
  }, server.Types.DECK_SHARE_CREATED, [finish]);

  useReduxEffect<DeckSharingFailedPayload>(({ payload: { command, responseCode, failure } }) => {
    if (command !== 'deckShareCreate' || !pendingRef.current) {
      return;
    }
    pendingRef.current = false;
    setState({
      status: 'failed',
      message: describeFailure(failure, t('DeckSharing.createFailed', { code: responseCode })),
    });
  }, server.Types.DECK_SHARING_FAILED, [describeFailure, t]);

  const create = (params: DeckShareCreateParams) => {
    if (pendingRef.current) {
      return;
    }
    // A link has to name its server; one without could never be opened.
    if (!shareServer) {
      setState({ status: 'failed', message: t('DeckSharing.noServer') });
      return;
    }
    pendingRef.current = true;
    setState({ status: 'pending' });
    webClient.request.session.deckShareCreate(params);
  };

  const reset = () => {
    pendingRef.current = false;
    setState({ status: 'idle' });
  };

  return { state, create, reset };
}

/** What a visibility toggle targets: one stored deck, or a folder by path. */
export type VisibilityTarget = { deckId: number } | { folderPath: string };

/**
 * Desktop "Publish/unpublish deck": flip the node's own public bit. A failure
 * is reported once, with the server's response code.
 */
export function useDeckVisibility() {
  const webClient = useWebClient();
  const { t } = useTranslation();
  const describeFailure = useCommandFailureMessage();
  const [error, setError] = useState<string | null>(null);

  useReduxEffect<DeckSharingFailedPayload>(({ payload: { command, responseCode, failure } }) => {
    if (command === 'deckSetVisibility') {
      setError(describeFailure(failure, t('DeckSharing.visibilityFailed', { code: responseCode })));
    }
  }, server.Types.DECK_SHARING_FAILED, [describeFailure, t]);

  const toggle = (target: VisibilityTarget, visibility: DeckVisibility) => {
    const params: DeckSetVisibilityParams = { ...target, isPublic: visibility !== 'public' };
    webClient.request.session.deckSetVisibility(params);
  };

  return { toggle, error, clearError: () => setError(null) };
}
