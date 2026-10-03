// The game's "Open deck in deck editor" handoff: a staged deck document opens
// in the real DeckEditor through the draft route, without a stored deck.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { generatePath, Route, Routes } from 'react-router-dom';

import { Command_DeckDownload_ext } from '@cockatrice/sockatrice/generated';
import { DeckEditor } from '@app/features/decks';
import { stageDeckDocument } from '@app/services';
import { RouteEnum } from '@app/types';

import { findLastSessionCommand } from '../helpers/command-capture';
import { renderFeatureScreen, simulateLoggedIn } from './helpers';

const GAME_DECK = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<cockatrice_deck version="1">',
  '<deckname>Burn</deckname>',
  '<zone name="main">',
  '<card number="4" name="Lightning Bolt" setShortName="M11" collectorNumber="149" uuid="bolt-uuid"/>',
  '</zone>',
  '</cockatrice_deck>',
].join('');

beforeEach(() => {
  vi.useRealTimers();
  simulateLoggedIn();
  // Card lookups miss Dexie and Scryfall alike: the deck renders by name.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
});

describe('deck draft route (integration)', () => {
  it('opens a staged game deck in the editor without downloading a stored deck', async () => {
    const route = generatePath(RouteEnum.DECK_DRAFT, { token: stageDeckDocument(GAME_DECK) });
    renderFeatureScreen(
      <Routes>
        <Route path={RouteEnum.DECK} element={<DeckEditor />} />
        <Route path={RouteEnum.DECK_DRAFT} element={<DeckEditor />} />
      </Routes>,
      route,
    );

    expect(await screen.findByDisplayValue('Burn', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getAllByText('Lightning Bolt').length).toBeGreaterThan(0);
    expect(() => findLastSessionCommand(Command_DeckDownload_ext)).toThrow();
  });
});
