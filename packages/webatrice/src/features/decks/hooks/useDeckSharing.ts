import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { server, ServerCapability } from '@cockatrice/datatrice';
import type { SessionCommandFailedPayload } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import type { DeckSetVisibilityParams, DeckShareCreateParams, Response_DeckShareCreate } from '@cockatrice/sockatrice/generated';
import { useCommandFailureMessage, useReduxEffect } from '@app/hooks';
import { useAppSelector } from '@app/store';
import { useKnownHosts } from '@app/feature-widgets/known-hosts';

import { buildDeckShareLink, shareServerFromEndpoint } from '../deckSharing';
import type { DeckVisibility } from '../deckTree';

/** Whether the server offers share links and public decks (Servatrice 3.1). */
export function useDeckSharingSupported(): boolean {
  return useAppSelector((state) => server.Selectors.supports(state, ServerCapability.DECK_SHARING));
}

/** The live connection endpoint, independent of the currently selected known host. */
export function useShareServer(): { hostname: string; port: string; desktopPort?: string } | null {
  const webClient = useWebClient();
  const connected = useAppSelector(server.Selectors.getIsConnected);
  const knownHosts = useKnownHosts();
  const live = connected ? shareServerFromEndpoint(webClient.socket?.connectedEndpoint) : null;
  if (!live) {
    return null;
  }
  const protocol = new URL(live.hostname).protocol;
  const host = knownHosts.value?.hosts?.find(candidate => {
    // Sockatrice uses host verbatim when it contains a path, otherwise appends port.
    // The live protocol is authoritative; a saved host has no separate scheme field.
    const address = candidate.host.includes('/') ? candidate.host : `${candidate.host}:${candidate.port}`;
    return shareServerFromEndpoint(`${protocol}//${address}`)?.hostname === live.hostname;
  });
  return { ...live, desktopPort: host?.desktopPort };
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
  const pendingRef = useRef<{ requestId: string; server: NonNullable<typeof shareServer> } | null>(null);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => () => {
    pendingRef.current = null;
    activeIdRef.current = null;
  }, []);

  const finish = useCallback(async (share: Response_DeckShareCreate, request: NonNullable<typeof pendingRef.current>) => {
    const link = buildDeckShareLink(window.location.href, { token: share.token, ...request.server });
    setState({ status: 'created', link, expiresAt: share.expiresAt, itemCount: share.itemCount, copied: false });
    const copied = await copyShareLink(link);
    if (activeIdRef.current === request.requestId) {
      setState((current) => (current.status === 'created' && current.link === link ? { ...current, copied } : current));
    }
  }, []);

  useReduxEffect<{ share: Response_DeckShareCreate; requestId?: string }>(({ payload: { share, requestId } }) => {
    const request = pendingRef.current;
    if (!request || request.requestId !== requestId) {
      return;
    }
    pendingRef.current = null;
    void finish(share, request);
  }, server.Types.DECK_SHARE_CREATED, [finish]);

  useReduxEffect<SessionCommandFailedPayload>(({ payload: { command, responseCode, failure, requestId } }) => {
    if (command !== 'deckShareCreate' || !pendingRef.current || pendingRef.current.requestId !== requestId) {
      return;
    }
    pendingRef.current = null;
    activeIdRef.current = null;
    setState({
      status: 'failed',
      message: describeFailure(failure, t('DeckSharing.createFailed', { code: responseCode })),
    });
  }, server.Types.SESSION_COMMAND_FAILED, [describeFailure, t]);

  const create = (params: DeckShareCreateParams) => {
    if (pendingRef.current) {
      return;
    }
    // A link has to name its server; one without could never be opened.
    if (!shareServer) {
      setState({ status: 'failed', message: t('DeckSharing.noServer') });
      return;
    }
    const requestId = crypto.randomUUID();
    pendingRef.current = { requestId, server: shareServer };
    activeIdRef.current = requestId;
    setState({ status: 'pending' });
    webClient.request.session.deckShareCreate(params, requestId);
  };

  const reset = () => {
    pendingRef.current = null;
    activeIdRef.current = null;
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

  useReduxEffect<SessionCommandFailedPayload>(({ payload: { command, responseCode, failure } }) => {
    if (command === 'deckSetVisibility') {
      setError(describeFailure(failure, t('DeckSharing.visibilityFailed', { code: responseCode })));
    }
  }, server.Types.SESSION_COMMAND_FAILED, [describeFailure, t]);

  const toggle = (target: VisibilityTarget, visibility: DeckVisibility) => {
    const params: DeckSetVisibilityParams = { ...target, isPublic: visibility !== 'public' };
    webClient.request.session.deckSetVisibility(params);
  };

  return { toggle, error, clearError: () => setError(null) };
}
