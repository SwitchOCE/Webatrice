import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useDeckStorageDetails } from '../../hooks/useDeckStorageDetails';
import { DeckRow } from './DeckRow';
import { DeckStorageDetails } from './DeckStorageDetails';

vi.mock('../../hooks/useDeckStorageDetails', () => ({ useDeckStorageDetails: vi.fn() }));
const save = vi.fn();
beforeEach(() => {
  save.mockResolvedValue(true);
  vi.mocked(useDeckStorageDetails).mockReturnValue({
    deck: { name: 'Deck', format: 'modern', meta: { v: 1, updatedAt: '' }, bannerCard: 'Island',
      cards: [{ name: 'Swamp', category: 'main', quantity: 1, lookupSource: 'unknown' }],
      tagsXml: '<tags><tag>Ramp</tag></tags>' },
    disabled: false, error: null, saving: false, save, activate: vi.fn(),
  });
});

it.each(['compact', 'card'] as const)('edits the banner directly on the %s storage preview without opening the editor', (mode) => {
  const onOpen = vi.fn();
  render(<DeckRow deck={{ id: 7, name: 'Deck', path: '', creationTime: 0, visibility: 'private' }}
    summary={undefined} mode={mode} onOpen={onOpen} onDelete={vi.fn()}
    details={<DeckStorageDetails deckId={7} xml="xml" onSaved={vi.fn()} />} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'DeckBanner.label' }), { target: { value: '["Swamp",""]' } });
  expect(save).toHaveBeenCalledWith({ banner: { name: 'Swamp', providerId: undefined } });
  expect(onOpen).not.toHaveBeenCalled();
});

it('opens tag editing from the preview and commits only on OK', async () => {
  render(<DeckStorageDetails deckId={7} xml="xml" onSaved={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'DeckStorageDetails.editTags' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'DeckTags.add' }), { target: { value: 'Control' } });
  fireEvent.click(screen.getByRole('button', { name: 'DeckTags.add' }));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Common.action.cancel' }));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'DeckStorageDetails.editTags' }));
  expect(screen.queryByText('Control')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'DeckStorageDetails.ok' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ tags: ['Ramp'] }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('keeps the tag dialog open when persistence fails', async () => {
  save.mockResolvedValue(false);
  render(<DeckStorageDetails deckId={7} xml="xml" onSaved={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'DeckStorageDetails.editTags' }));
  fireEvent.click(screen.getByRole('button', { name: 'DeckStorageDetails.ok' }));
  await waitFor(() => expect(save).toHaveBeenCalled());
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('activates details on keyboard focus or pointer entry, without activating on render', () => {
  const details = vi.mocked(useDeckStorageDetails).getMockImplementation()!(7, 'xml', vi.fn());
  vi.mocked(useDeckStorageDetails).mockReturnValue({ ...details, deck: null, disabled: true });
  render(<DeckStorageDetails deckId={7} xml="xml" onSaved={vi.fn()} />);
  expect(details.activate).not.toHaveBeenCalled();
  const group = screen.getByRole('group', { name: 'DeckStorageDetails.editTags' });
  expect(group).toHaveAttribute('tabindex', '0');
  fireEvent.focus(group);
  expect(details.activate).toHaveBeenCalledOnce();
  fireEvent.pointerEnter(group);
  expect(details.activate).toHaveBeenCalledTimes(2);
});
