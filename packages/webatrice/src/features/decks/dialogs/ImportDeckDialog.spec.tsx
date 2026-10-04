import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { lookupCards, parseCod } from '@app/services';

import { ImportDeckDialog } from './ImportDeckDialog';

vi.mock('@app/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/services')>()),
  lookupCards: vi.fn(),
}));

const COD = '<cockatrice_deck version="1"><deckname>From File</deckname><format>legacy</format>'
  + '<comments>{"v":1,"updatedAt":"x","priceUsd":5}</comments>'
  + '<zone name="main"><card number="4" name="Lightning Bolt"/></zone></cockatrice_deck>';

describe('ImportDeckDialog', () => {
  it('rejects a paste with no recognisable cards', () => {
    render(<ImportDeckDialog open onClose={() => {}} onImport={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('ImportDeckDialog.placeholder'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'ImportDeckDialog.next' }));
    expect(screen.getByText('DeckImport.error.noCards')).toBeInTheDocument();
    expect(lookupCards).not.toHaveBeenCalled();
  });

  it('resolves a paste, reviews matched and unknown cards, then imports the .cod', async () => {
    vi.mocked(lookupCards).mockResolvedValue(new Map([
      ['Sol Ring', { found: true, source: 'scryfall', name: 'Sol Ring', printings: [] }],
    ]));
    const onImport = vi.fn();
    render(<ImportDeckDialog open onClose={() => {}} onImport={onImport} />);

    fireEvent.change(screen.getByPlaceholderText('ImportDeckDialog.placeholder'), {
      target: { value: '1 Sol Ring\n2 Nope\n???' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ImportDeckDialog.next' }));

    expect(await screen.findByText('ImportDeckDialog.review.matched')).toBeInTheDocument();
    expect(screen.getByText('ImportDeckDialog.review.missing')).toBeInTheDocument();
    expect(screen.getByText(/ImportDeckDialog.review.ignored/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Common.action.back' }));
    expect(screen.getByPlaceholderText('ImportDeckDialog.placeholder')).toHaveValue('1 Sol Ring\n2 Nope\n???');
    fireEvent.click(screen.getByRole('button', { name: 'ImportDeckDialog.next' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ImportDeckDialog.importCards' }));

    expect(screen.getByText('ImportDeckDialog.importing')).toBeInTheDocument();
    const deck = parseCod(onImport.mock.calls[0][0]);
    expect(deck.cards.map((c) => [c.name, c.quantity])).toEqual([['Sol Ring', 1], ['Nope', 2]]);
  });

  it('summarizes an uploaded .cod and imports it with its own name and format', async () => {
    vi.mocked(lookupCards).mockResolvedValue(new Map());
    const onImport = vi.fn();
    render(<ImportDeckDialog open onClose={() => {}} onImport={onImport} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([COD], 'bolt.cod')] } });

    expect(await screen.findByText('bolt.cod')).toBeInTheDocument();
    expect(screen.getByText('ImportDeckDialog.file.cards · ImportDeckDialog.file.main')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('From File');
    fireEvent.click(screen.getByRole('button', { name: 'ImportDeckDialog.importFile' }));
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());

    const deck = parseCod(onImport.mock.calls[0][0]);
    expect(deck.name).toBe('From File');
    expect(deck.format).toBe('legacy');
    expect(deck.meta.priceUsd).toBe(5);
  });

  it('reports a file that is not a .cod and lets the user clear a picked file', async () => {
    render(<ImportDeckDialog open onClose={() => {}} onImport={() => {}} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [new File(['<nope/>'], 'x.cod')] } });
    expect(await screen.findByText('DeckImport.error.invalidCodReason')).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [new File([COD], 'bolt.cod')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'ImportDeckDialog.clearFile' }));
    await waitFor(() => expect(screen.queryByText('bolt.cod')).toBeNull());
    expect(screen.getByPlaceholderText('ImportDeckDialog.placeholder')).toBeInTheDocument();
  });
});
