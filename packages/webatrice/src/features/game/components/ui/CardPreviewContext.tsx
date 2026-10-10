import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

export interface PreviewCard {
  name: string;
  scryfallId?: string;
  imageUri?: string;
  pt?: string;
  annotation?: string;
}

export interface CardPreviewActions {
  setHoveredCard: (card: PreviewCard | null) => void;
  setFocusedCard: (card: PreviewCard | null) => void;
  openBigPreview: (card: PreviewCard) => void;
  closeBigPreview: () => void;
  showCardInfo: (card: PreviewCard) => void;
}

export interface CardInfoRequest {
  card: PreviewCard;
}

export interface CardPreviewStore extends CardPreviewActions {
  subscribe: (listener: () => void) => () => void;
  getPreviewCard: () => PreviewCard | null;
  getBigPreviewCard: () => PreviewCard | null;
  getCardInfoRequest: () => CardInfoRequest | null;
  consumeCardInfoRequest: (request: CardInfoRequest) => void;
}

export function createCardPreviewStore(): CardPreviewStore {
  let hovered: PreviewCard | null = null;
  let focused: PreviewCard | null = null;
  let big: PreviewCard | null = null;
  let infoRequest: CardInfoRequest | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getPreviewCard: () => focused ?? hovered,
    getBigPreviewCard: () => big,
    getCardInfoRequest: () => infoRequest,
    setHoveredCard: (card) => {
      if (card !== hovered) {
        hovered = card;
        emit();
      }
    },
    setFocusedCard: (card) => {
      if (card !== focused) {
        focused = card;
        emit();
      }
    },
    openBigPreview: (card) => {
      big = card;
      emit();
    },
    closeBigPreview: () => {
      if (big) {
        big = null;
        emit();
      }
    },
    showCardInfo: (card) => {
      infoRequest = { card };
      emit();
    },
    consumeCardInfoRequest: (request) => {
      if (infoRequest === request) {
        infoRequest = null;
        emit();
      }
    },
  };
}

const CardPreviewContext = createContext<CardPreviewStore | null>(null);

export function CardPreviewProvider({ store, children }: { store: CardPreviewStore; children: ReactNode }) {
  return <CardPreviewContext.Provider value={store}>{children}</CardPreviewContext.Provider>;
}

const NOOP_ACTIONS: CardPreviewActions = {
  setHoveredCard: () => {},
  setFocusedCard: () => {},
  openBigPreview: () => {},
  closeBigPreview: () => {},
  showCardInfo: () => {},
};

const noSubscription = () => () => {};
const noCard = () => null;

export function useCardPreviewActions(): CardPreviewActions {
  return useContext(CardPreviewContext) ?? NOOP_ACTIONS;
}

export function useCardPreview(): PreviewCard | null {
  const store = useContext(CardPreviewContext);
  return useSyncExternalStore(store?.subscribe ?? noSubscription, store?.getPreviewCard ?? noCard);
}

export function useBigPreviewCard(): PreviewCard | null {
  const store = useContext(CardPreviewContext);
  return useSyncExternalStore(store?.subscribe ?? noSubscription, store?.getBigPreviewCard ?? noCard);
}

export function useCardInfoRequest(onRequest: (card: PreviewCard) => void): void {
  const store = useContext(CardPreviewContext);
  const request = useSyncExternalStore(store?.subscribe ?? noSubscription, store?.getCardInfoRequest ?? noCard);
  useEffect(() => {
    if (request && store) {
      store.consumeCardInfoRequest(request);
      onRequest(request.card);
    }
  }, [request, store, onRequest]);
}
