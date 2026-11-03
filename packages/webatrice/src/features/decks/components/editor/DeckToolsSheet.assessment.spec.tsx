import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { getSettings, settingsStore } from '@app/hooks';
import { CommanderSpellbookIntegration } from '@app/types';

import { analyzeBracket, deckFingerprint } from '../../bracket';
import { writeBracketLookupsMode } from '../../bracketConsent';
import type { DeckCard } from '../../types';
import { DeckToolsSheet } from './DeckToolsSheet';

vi.mock('../../bracket', async (original) => ({
  ...await original<typeof import('../../bracket')>(), analyzeBracket: vi.fn(),
}));

const cards: DeckCard[] = [{ name: 'Sol Ring', quantity: 1, category: 'main', lookupSource: 'scryfall' }];

beforeEach(async () => {
  settingsStore.reset();
  await getSettings();
  vi.mocked(analyzeBracket).mockResolvedValue({
    report: {
      level: 2,
      signals: {
        turns: { matches: [], restricted: [] }, denial: { matches: [], restricted: [] },
        gameChangers: { matches: [] }, earlyCombos: [], lateCombos: [],
      },
    },
    unavailable: [],
  });
});
afterEach(() => settingsStore.reset());

it('recomputes an automatic bracket after edits with Stats active and while the sheet is collapsed', async () => {
  await act(() => writeBracketLookupsMode(CommanderSpellbookIntegration.Automatic));
  const persist = vi.fn();
  const { rerender } = render(<DeckToolsSheet cards={cards} format="commander" isMtg onAssessmentComputed={persist} />);
  await waitFor(() => expect(persist).toHaveBeenCalledWith(expect.objectContaining({ fingerprint: deckFingerprint(cards) })));
  expect(screen.getByRole('tab', { name: 'DeckEditor.tools.stats' })).toHaveAttribute('aria-selected', 'true');
  const edited = [{ ...cards[0], quantity: 2 }];
  rerender(<DeckToolsSheet cards={edited} format="commander" isMtg onAssessmentComputed={persist} />);
  await waitFor(() => expect(persist).toHaveBeenCalledWith(expect.objectContaining({ fingerprint: deckFingerprint(edited) })));
  fireEvent.click(screen.getByRole('button', { name: 'DeckEditor.tools.collapse' }));
  const collapsedEdit = [{ ...cards[0], quantity: 3 }];
  rerender(<DeckToolsSheet cards={collapsedEdit} format="commander" isMtg onAssessmentComputed={persist} />);
  await waitFor(() => expect(persist).toHaveBeenCalledWith(expect.objectContaining({ fingerprint: deckFingerprint(collapsedEdit) })));
  expect(analyzeBracket).toHaveBeenCalledTimes(3);
});

it.each([
  CommanderSpellbookIntegration.Unprompted, CommanderSpellbookIntegration.Enabled, CommanderSpellbookIntegration.Disabled,
])('does not assess in the background without automatic consent (mode %s)', async (mode) => {
  await act(() => writeBracketLookupsMode(mode));
  const { rerender } = render(<DeckToolsSheet cards={cards} format="commander" isMtg />);
  rerender(<DeckToolsSheet cards={[{ ...cards[0], quantity: 2 }]} format="commander" isMtg />);
  expect(analyzeBracket).not.toHaveBeenCalled();
});
