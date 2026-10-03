import { act, fireEvent, screen } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';

import { server } from '@cockatrice/datatrice';
import { Response_DeckShareListSchema, ServerInfo_DeckShareItemSchema } from '@cockatrice/sockatrice/generated';

import { connected31State, connectedState, renderWithProviders } from '../../__test-utils__';
import SharedDeck from './SharedDeck';

const knownHost = vi.hoisted(() => ({ host: 'server.example', port: '4748' }));
vi.mock('@app/feature-widgets/known-hosts', () => ({
  useKnownHosts: () => ({ status: 'loaded', value: { hosts: [], selectedHost: knownHost } }),
}));

const COD = '<cockatrice_deck version="1"><deckname>Burn</deckname><zone name="main">'
  + '<card number="4" name="Lightning Bolt"/></zone></cockatrice_deck>';

function renderPage(query = 'share=tok&hostname=server.example&port=4747', preloadedState = connected31State) {
  return renderWithProviders(<SharedDeck />, { preloadedState, route: `/decks/shared?${query}` });
}

describe('SharedDeck', () => {
  it('lists the share, opens a deck read-only and imports a copy', () => {
    const { store, webClient } = renderPage();
    expect(webClient.request.session.deckShareList).toHaveBeenCalledWith('tok');
    expect(screen.getByText('SharedDeck.loading')).toBeInTheDocument();

    act(() => {
      store.dispatch(server.Actions.deckShareListed({
        token: 'tok',
        share: create(Response_DeckShareListSchema, {
          name: 'Cube',
          expiresAt: 1800000000n,
          items: [create(ServerInfo_DeckShareItemSchema, { id: 2, name: 'Burn', gameFormat: 'modern', colorIdentity: 'R' })],
        }),
      }));
    });
    expect(screen.getByText('SharedDeck.share')).toBeInTheDocument();
    expect(screen.getByText('SharedDeck.from')).toBeInTheDocument();
    expect(screen.getByText('SharedDeck.expires')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'SharedDeck.openDeckNamed' }));
    expect(webClient.request.session.deckShareDownload).toHaveBeenCalledWith('tok', 2);
    act(() => {
      store.dispatch(server.Actions.deckShareDownloaded({ token: 'tok', itemId: 2, deck: COD }));
    });
    expect(screen.getByText('Lightning Bolt')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ReadOnlyDeck.import/ }));
    expect(webClient.request.session.deckUpload).toHaveBeenCalledWith('', 0, COD);
  });

  it('names what is missing from an incomplete link, like desktop', () => {
    const { webClient } = renderPage('share=tok&port=4747');
    expect(screen.getByRole('alert')).toHaveTextContent('OpenShareLink.problem.hostname');
    expect(webClient.request.session.deckShareList).not.toHaveBeenCalled();
  });

  it('says which server a link for another server needs', () => {
    const { webClient } = renderPage('share=tok&hostname=elsewhere.example&port=4747');
    expect(screen.getByRole('alert')).toHaveTextContent('SharedDeck.otherServer');
    expect(webClient.request.session.deckShareList).not.toHaveBeenCalled();
  });

  it('asks nothing of a server without share links', () => {
    const { webClient } = renderPage(undefined, connectedState);
    expect(screen.getByRole('alert')).toHaveTextContent('SharedDeck.notFound');
    expect(webClient.request.session.deckShareList).not.toHaveBeenCalled();
  });

  it('shows desktop\'s message for a missing or expired share', () => {
    const { store } = renderPage();
    act(() => {
      store.dispatch(server.Actions.deckSharingFailed({ command: 'deckShareList', target: 'tok', responseCode: 15 }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('SharedDeck.notFound');
  });
});
