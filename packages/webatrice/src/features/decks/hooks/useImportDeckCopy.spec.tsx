import { act } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';

import { server } from '@cockatrice/datatrice';
import { ServerInfo_DeckStorage_TreeItemSchema } from '@cockatrice/sockatrice/generated';

import { connectedState, createMockWebClient, renderWithProviders } from '../../../__test-utils__';
import { useImportDeckCopy } from './useImportDeckCopy';

const COD = '<cockatrice_deck version="1"><deckname>Burn</deckname><zone name="main"/></cockatrice_deck>';

let importCopy: (xml: string) => void;
function Probe({ onImported }: { onImported: (id: number) => void }) {
  importCopy = useImportDeckCopy(onImported);
  return null;
}

function setup() {
  const webClient = createMockWebClient();
  const onImported = vi.fn();
  const { store } = renderWithProviders(<Probe onImported={onImported} />, { preloadedState: connectedState, webClient });
  return { webClient, store, onImported };
}

const uploaded = (path: string, id: number, name: string) =>
  server.Actions.deckUpload({ path, treeItem: create(ServerInfo_DeckStorage_TreeItemSchema, { id, name }) });

describe('useImportDeckCopy', () => {
  it('uploads a copy to the storage root and hands on its new id', () => {
    const { webClient, store, onImported } = setup();
    act(() => importCopy(COD));
    expect(webClient.request.session.deckUpload).toHaveBeenCalledWith('', 0, COD);
    act(() => {
      store.dispatch(uploaded('', 12, 'Burn'));
    });
    expect(onImported).toHaveBeenCalledWith(12);
  });

  it('ignores uploads it did not send', () => {
    const { store, onImported } = setup();
    act(() => importCopy(COD));
    act(() => {
      store.dispatch(uploaded('Cube', 13, 'Burn'));
      store.dispatch(uploaded('', 14, 'Other'));
    });
    expect(onImported).not.toHaveBeenCalled();
  });

  it('sends nothing for an unreadable deck', () => {
    const { webClient } = setup();
    act(() => importCopy('nope'));
    expect(webClient.request.session.deckUpload).not.toHaveBeenCalled();
  });
});
