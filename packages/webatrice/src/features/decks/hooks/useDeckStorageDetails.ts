import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from 'react-redux';
import { useTranslation } from 'react-i18next';

import { server, type CommandFailedPayload } from '@cockatrice/datatrice';
import { useWebClient } from '@cockatrice/datatrice/react';
import { useCommandFailureMessage, useReduxEffect, useRequestTracker } from '@app/hooks';
import { parseCod, patchDeckDetails } from '@app/services';
import { useAppSelector, type RootState } from '@app/store';

import { deleteCachedDeck } from '../deckEditorCache';
import { setDeckBanner, setDeckTags } from '../deckEdits';
import { deckSaveSignature } from '../deckPersistence';
import { getDeckSaveRegistry } from '../deckSaveRegistry';
import type { BannerCandidate } from '../deckTags';
import { hydrateDeck } from '../hydrate';
import type { HydratedDeck } from '../types';

export function useDeckStorageDetails(
  deckId: number, xml: string, onSaved: (deckId: number, xml: string) => void, colorIdentity?: string,
) {
  const { t } = useTranslation();
  const client = useWebClient();
  const store = useStore<RootState>();
  const connected = useAppSelector(server.Selectors.getIsConnected);
  const registry = useMemo(() => getDeckSaveRegistry(store, client), [store, client]);
  const snapshot = useSyncExternalStore(registry.subscribe, useCallback(() => registry.getSnapshot(deckId), [registry, deckId]));
  const requests = useRequestTracker();
  const describeFailure = useCommandFailureMessage();
  const [deck, setDeck] = useState<HydratedDeck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const source = useRef<{ deck: HydratedDeck; xml: string } | null>(null);
  const hydration = useRef<Promise<HydratedDeck | null> | null>(null);
  const download = useRef<((xml: string | null) => void) | null>(null);

  useEffect(() => {
    setDeck(null);
    setError(null);
    setSaving(false);
    source.current = null;
    hydration.current = null;
    busy.current = false;
    return () => {
      requests.cancel();
      download.current?.(null);
      download.current = null;
    };
  }, [deckId, connected, requests]);

  const activate = (): Promise<HydratedDeck | null> => {
    if (!connected) {
      return Promise.resolve(null);
    }
    if (source.current) {
      return Promise.resolve(source.current.deck);
    }
    if (hydration.current) {
      return hydration.current;
    }
    registry.connect();
    const request = requests.begin();
    hydration.current = (async () => {
      try {
        const hydrated = await hydrateDeck(parseCod(xml));
        if (requests.isCurrent(request)) {
          registry.initialize(deckId, deckSaveSignature(hydrated));
          source.current = { deck: hydrated, xml };
          setDeck(hydrated);
          return hydrated;
        }
      } catch {
        if (requests.isCurrent(request)) {
          setError(t('DeckStorageDetails.loadFailed'));
        }
      } finally {
        if (requests.isCurrent(request)) {
          hydration.current = null;
        }
      }
      return null;
    })();
    return hydration.current;
  };

  useReduxEffect<{ deckId: number; deck: string; requestId?: string }>(
    ({ payload }) => {
      if (payload.deckId === deckId && requests.isCurrent(payload.requestId) && requests.settle(payload.requestId)) {
        download.current?.(payload.deck);
        download.current = null;
      }
    }, server.Types.DECK_DOWNLOADED, [deckId, requests],
  );
  useReduxEffect<CommandFailedPayload & { deckId: number }>(
    ({ payload }) => {
      if (payload.deckId === deckId && requests.isCurrent(payload.requestId) && requests.settle(payload.requestId)) {
        setError(describeFailure(payload.failure, t('DeckStorageDetails.loadFailed')));
        download.current?.(null);
        download.current = null;
      }
    }, server.Types.DECK_DOWNLOAD_FAILED, [deckId, requests, describeFailure, t],
  );

  const save = async (edit: { banner: BannerCandidate | null } | { tags: readonly string[] }): Promise<boolean> => {
    const current = registry.getSnapshot(deckId);
    if (!source.current || !connected || busy.current || (current.isModified && !(error && current.saveState === 'failed'))
      || current.pending.size > 0) {
      return false;
    }
    const request = requests.begin();
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      let base = source.current;
      if (current.savedSignature != null && current.savedSignature !== deckSaveSignature(base.deck)) {
        const freshXml = await new Promise<string | null>((resolve) => {
          download.current = resolve;
          requests.track(request);
          client.request.session.deckDownload(deckId, request);
        });
        if (freshXml == null || !requests.isCurrent(request)) {
          return false;
        }
        base = { xml: freshXml, deck: await hydrateDeck(parseCod(freshXml)) };
        const latest = registry.getSnapshot(deckId);
        if (!requests.isCurrent(request) || latest.pending.size > 0 || latest.isModified
          || latest.savedSignature !== current.savedSignature) {
          return false;
        }
      }
      const next = 'banner' in edit ? setDeckBanner(base.deck, edit.banner) : setDeckTags(base.deck, edit.tags);
      const document = patchDeckDetails(base.xml, 'banner' in edit ? edit : { tagsXml: next.tagsXml });
      deleteCachedDeck(deckId);
      const saved = await registry.saveNow(deckId, next, { xml: document, colorIdentity });
      if (saved) {
        onSaved(deckId, document);
      }
      if (!requests.isCurrent(request)) {
        return false;
      }
      if (!saved) {
        const failure = registry.getSnapshot(deckId).lastFailure;
        setError(describeFailure(failure?.failure, t('DeckStorageDetails.saveFailed')));
        return false;
      }
      source.current = { deck: next, xml: document };
      setDeck(next);
      return true;
    } catch {
      if (requests.isCurrent(request)) {
        setError(t('DeckStorageDetails.loadFailed'));
      }
      return false;
    } finally {
      if (requests.isCurrent(request)) {
        busy.current = false;
        setSaving(false);
      }
    }
  };
  return { deck, error, saving, activate, disabled: !connected || !deck || saving || snapshot.pending.size > 0
    || (snapshot.isModified && !(error && snapshot.saveState === 'failed')), save };
}
