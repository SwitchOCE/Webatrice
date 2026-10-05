import { act, waitFor } from '@testing-library/react';

import { lookupCards, parseCod } from '@app/services';
import { connectedState, createMockWebClient, renderWithProviders } from '../../../__test-utils__';
import { useDeckImportFlow, type DeckImportFlow } from './useDeckImportFlow';
import { useDeckList } from './useDeckList';

vi.mock('@app/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/services')>()),
  lookupCards: vi.fn(),
}));

let flow: DeckImportFlow;
function Probe() {
  const list = useDeckList({ onDeckCreated: () => {} });
  flow = useDeckImportFlow(true, list.importDeck);
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lookupCards).mockResolvedValue(new Map([
    ['Lightning Bolt', { found: true, source: 'scryfall', name: 'Lightning Bolt', colors: ['R'], printings: [] }],
    ['Negate', { found: true, source: 'scryfall', name: 'Negate', colors: ['U'], printings: [] }],
  ]));
});

it.each(['paste', 'file'])('uploads the computed color identity on the first %s import', async (source) => {
  const webClient = createMockWebClient();
  renderWithProviders(<Probe />, { preloadedState: connectedState, webClient });
  if (source === 'paste') {
    act(() => flow.setText('4 Lightning Bolt\nSB: 2 Negate'));
    await act(() => flow.resolve());
    act(() => flow.confirmPaste());
  } else {
    const xml = '<cockatrice_deck version="1"><deckname>Desktop</deckname>'
      + '<zone name="main"><card name="Lightning Bolt" number="4"/></zone>'
      + '<zone name="side"><card name="Negate" number="2"/></zone></cockatrice_deck>';
    act(() => flow.pickFile(new File([xml], 'desktop.cod')));
    await waitFor(() => expect(flow.file).not.toBeNull());
    await act(async () => {
      await flow.confirmFile();
    });
  }
  expect(webClient.request.session.deckUpload).toHaveBeenCalledOnce();
  const args = vi.mocked(webClient.request.session.deckUpload).mock.calls[0];
  expect(args[4]).toBe('UR');
  expect(parseCod(args[2]).cards.map((c) => c.quantity)).toEqual([4, 2]);
  expect(lookupCards).toHaveBeenCalledOnce();
});
