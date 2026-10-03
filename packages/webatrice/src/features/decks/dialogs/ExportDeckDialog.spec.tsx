import { act, fireEvent, render, screen } from '@testing-library/react';

import type { HydratedDeck } from '../types';
import { DeckDialogFrame } from './DeckDialogFrame';
import { ExportDeckDialog } from './ExportDeckDialog';

const deck: HydratedDeck = {
  name: 'Mono Red Burn',
  meta: { v: 1, updatedAt: '2026-01-01T00:00:00.000Z' },
  format: 'modern',
  cards: [
    { name: 'Lightning Bolt', quantity: 4, category: 'main', lookupSource: 'scryfall', set: 'm11', collectorNumber: '149' },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExportDeckDialog', () => {
  it('renders nothing while closed', () => {
    render(<ExportDeckDialog open={false} onClose={vi.fn()} deck={deck} />);
    expect(screen.queryByText('Export deck')).toBeNull();
  });

  it('previews each format', () => {
    render(<ExportDeckDialog open onClose={vi.fn()} deck={deck} />);
    const preview = screen.getByRole('textbox');
    expect(preview).toHaveValue('// Deck\n4 Lightning Bolt');

    fireEvent.click(screen.getByRole('button', { name: /MTG Arena/ }));
    expect(preview).toHaveValue('Deck\n4 Lightning Bolt (M11) 149');

    fireEvent.click(screen.getByRole('button', { name: /Cockatrice \(\.cod\)/ }));
    expect((preview as HTMLTextAreaElement).value).toContain('<cockatrice_deck');
    expect(screen.getByRole('button', { name: /Download \.cod/ })).toBeInTheDocument();
  });

  it('copies the preview to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ExportDeckDialog open onClose={vi.fn()} deck={deck} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(writeText).toHaveBeenCalledWith('// Deck\n4 Lightning Bolt');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('downloads the preview under a slugged file name', () => {
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function assertName(this: HTMLAnchorElement) {
      expect(this.download).toBe('mono-red-burn.txt');
    });
    render(<ExportDeckDialog open onClose={vi.fn()} deck={deck} />);

    fireEvent.click(screen.getByRole('button', { name: /Download \.txt/ }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('closes from the button and from Escape', () => {
    const onClose = vi.fn();
    render(<ExportDeckDialog open onClose={onClose} deck={deck} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('DeckDialogFrame', () => {
  it('portals its panel into the body and closes on a backdrop click', () => {
    const onClose = vi.fn();
    const { container } = render(<DeckDialogFrame onClose={onClose} titleId="t"><p>panel</p></DeckDialogFrame>);
    expect(container).toBeEmptyDOMElement();
    const panel = screen.getByText('panel');
    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(panel.previousElementSibling!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is a modal dialog labelled by the panel heading', () => {
    render(<DeckDialogFrame onClose={() => {}} titleId="frame-title"><h2 id="frame-title">Title</h2></DeckDialogFrame>);
    const dialog = screen.getByRole('dialog', { name: 'Title' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
