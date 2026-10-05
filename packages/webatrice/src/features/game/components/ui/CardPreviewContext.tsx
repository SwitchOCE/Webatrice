import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

/**
 * The one card-preview owner for a game: the right-rail hover preview, the
 * keyboard-focus preview and the middle-click zoom ("big preview", desktop's
 * card_zone.cpp middle-button hold).
 *
 * Game creates one store per mounted game and provides it here. Leaves publish
 * through the stable actions; only the preview surfaces subscribe to the cards,
 * so moving the pointer across the board re-renders the sidebar and the zoom
 * modal, never the cards that published.
 */

/** What a preview surface needs to draw a card, whichever zone it came from. */
export interface PreviewCard {
  name: string;
  /** Exact printing the deck chose, so the preview isn't Scryfall's default. */
  scryfallId?: string;
  /** Image override for the face currently shown (a transformed DFC's back):
   *  Scryfall's default image endpoint always returns the front face. */
  imageUri?: string;
  /** In-game P/T (`AttrPT`), shown by the text preview for cards Scryfall
   *  doesn't know, such as user-created tokens. */
  pt?: string;
  /** In-game annotation (`AttrAnnotation`), same reason as `pt`. */
  annotation?: string;
}

export interface CardPreviewActions {
  /** Publish the hovered card, or clear it with null. */
  setHoveredCard: (card: PreviewCard | null) => void;
  /** Publish the keyboard-focused card; it wins over the hovered card. */
  setFocusedCard: (card: PreviewCard | null) => void;
  openBigPreview: (card: PreviewCard) => void;
  closeBigPreview: () => void;
  /** Show a card in the card-info pane until the hovered card changes
   *  (desktop's cardInfoRequested, e.g. from "View related cards"). */
  showCardInfo: (card: PreviewCard) => void;
}

/** One showCardInfo call. A fresh object per call, so asking for the same
 *  card twice still notifies the pane. */
export interface CardInfoRequest {
  card: PreviewCard;
}

export interface CardPreviewStore extends CardPreviewActions {
  subscribe: (listener: () => void) => () => void;
  /** Focused card, else hovered card. */
  getPreviewCard: () => PreviewCard | null;
  getBigPreviewCard: () => PreviewCard | null;
  getCardInfoRequest: () => CardInfoRequest | null;
  /** Mark a request handled, so a pane that mounts later doesn't replay it. */
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

/**
 * Stable publish actions. Reading them never subscribes the caller to preview
 * changes. Outside a provider they are no-ops, so isolated component previews
 * don't crash.
 */
export function useCardPreviewActions(): CardPreviewActions {
  return useContext(CardPreviewContext) ?? NOOP_ACTIONS;
}

/** The card the preview pane shows: the focused card, else the hovered one. */
export function useCardPreview(): PreviewCard | null {
  const store = useContext(CardPreviewContext);
  return useSyncExternalStore(store?.subscribe ?? noSubscription, store?.getPreviewCard ?? noCard);
}

/** The card the middle-click zoom shows, or null when it is closed. */
export function useBigPreviewCard(): PreviewCard | null {
  const store = useContext(CardPreviewContext);
  return useSyncExternalStore(store?.subscribe ?? noSubscription, store?.getBigPreviewCard ?? noCard);
}

/** Handle each card-info request (see showCardInfo) once: `onRequest` runs
 *  for a new request, which is then consumed, so a remount doesn't replay it. */
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
