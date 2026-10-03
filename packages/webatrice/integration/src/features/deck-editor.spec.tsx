import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { create, isFieldSet } from '@bufbuild/protobuf';

import { DeckEditor, clearBracketSourceCaches, clearDeckEditorCache, clearDecksListCache } from '@app/features/decks';
import { parseCod } from '@app/services';
import { RouteEnum, type ParsedDeck } from '@app/types';
import {
  Command_DeckDownload_ext,
  Command_DeckList_ext,
  Command_DeckUpload_ext,
  Command_DeckUploadSchema,
  Response_DeckUploadSchema,
  Response_DeckUpload_ext,
  ServerInfo_DeckStorage_TreeItemSchema,
} from '@cockatrice/sockatrice/generated';

import { connectAndLogin } from '../helpers/setup';
import { findAllSessionCommands, findLastSessionCommand } from '../helpers/command-capture';
import { buildResponse, buildResponseMessage, deliverMessage } from '../helpers/protobuf-builders';
import { renderFeatureScreen } from './helpers';
import {
  LocationProbe,
  type FetchOverride,
  codXml,
  fetchCalls,
  respondToDeckDownload,
  stubImagePreload,
  stubThirdPartyFetch,
} from './deckHelpers';

// Characterization of the deck editor route: the deck is downloaded over the
// real Sockatrice command path, every edit lands as an autosaved
// Command_DeckUpload whose `.cod` payload is decoded and asserted, and the
// third-party lookups (Scryfall, Commander Spellbook) are served by a fake.

const DECK_ID = 5;

const MODERN_DECK = codXml({
  name: 'Burn',
  format: 'modern',
  main: [
    { name: 'Lightning Bolt', quantity: 1, set: 'm11', num: '149' },
    { name: 'Sol Ring', quantity: 1 },
    { name: 'Forest', quantity: 10 },
  ],
  side: [{ name: 'Llanowar Elves', quantity: 1 }],
});

const COMMANDER_DECK = codXml({
  name: 'Superfriends',
  format: 'commander',
  main: [
    { name: 'Atraxa, Grand Unifier', quantity: 1, commander: true },
    { name: 'Lightning Bolt', quantity: 1, set: 'm11', num: '149' },
    { name: 'Sol Ring', quantity: 1 },
    { name: 'Forest', quantity: 10 },
  ],
  side: [{ name: 'Llanowar Elves', quantity: 1 }],
});

const GROUP_LABELS = /^(Commander|Creature|Planeswalker|Battle|Instant|Sorcery|Enchantment|Artifact|Land|Other|Sideboard)\d+$/;

let fetchMock: ReturnType<typeof stubThirdPartyFetch>;

beforeEach(() => {
  vi.useRealTimers();
  clearDeckEditorCache();
  clearDecksListCache();
  clearBracketSourceCaches();
  fetchMock = stubThirdPartyFetch();
  stubImagePreload();
  connectAndLogin();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openDeck(xml: string) {
  renderFeatureScreen(
    <Routes>
      <Route path={RouteEnum.DECK} element={<DeckEditor />} />
      <Route path={RouteEnum.DECKS} element={<LocationProbe />} />
    </Routes>,
    `/deck/${DECK_ID}`,
  );
  await waitFor(() => expect(findLastSessionCommand(Command_DeckDownload_ext).value.deckId).toBe(DECK_ID));
  act(() => {
    respondToDeckDownload(DECK_ID, xml);
  });
  await screen.findByPlaceholderText('Quick add — type a card name', {}, { timeout: 5000 });
}

function groupHeadings(): string[] {
  return screen
    .getAllByRole('heading', { level: 3 })
    .map((h) => h.textContent ?? '')
    .filter((t) => GROUP_LABELS.test(t));
}

function uploads(): ParsedDeck[] {
  return findAllSessionCommands(Command_DeckUpload_ext).map((c) => parseCod(c.value.deckList));
}

/** Waits for an autosave whose decoded `.cod` satisfies `predicate`. */
async function autosaved(predicate: (deck: ParsedDeck) => boolean): Promise<ParsedDeck> {
  let match: ParsedDeck | undefined;
  await waitFor(() => {
    match = uploads().find(predicate);
    expect(match).toBeDefined();
  }, { timeout: 3000 });
  return match!;
}

function card(deck: ParsedDeck, name: string) {
  return deck.cards.find((c) => c.name === name);
}

function rowActions(cardName: string) {
  const nameButton = screen.getByRole('button', { name: cardName });
  return within(nameButton.parentElement!).getByRole('button', { name: 'Card actions' });
}

describe('DeckEditor (integration)', () => {
  it('downloads the deck by id and renders grouped rows, counts and the sidebar', async () => {
    await openDeck(MODERN_DECK);

    expect(screen.getByDisplayValue('Burn')).toBeInTheDocument();
    expect(screen.getByText('12 cards · 1 sideboard')).toBeInTheDocument();
    expect(groupHeadings()).toEqual(['Instant1', 'Artifact1', 'Land10', 'Sideboard1']);
    expect(screen.getByRole('combobox')).toHaveValue('modern');
    expect(screen.queryByText('Bracket estimate')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Mana curve' })).toBeInTheDocument();
  });

  it('shows the commander section and persists a computed bracket and price for commander decks', async () => {
    await openDeck(COMMANDER_DECK);

    expect(groupHeadings()).toEqual(['Commander1', 'Instant1', 'Artifact1', 'Land10', 'Sideboard1']);
    expect(await screen.findByText('DeckBracket.title', {}, { timeout: 3000 })).toBeInTheDocument();

    const spellbook = fetchCalls(fetchMock, 'https://backend.commanderspellbook.com/find-my-combos/');
    expect(spellbook).toHaveLength(1);
    expect(JSON.parse(String(spellbook[0][1]?.body)).main).toEqual(expect.arrayContaining([
      { card: 'Sol Ring', quantity: 1 },
      { card: 'Llanowar Elves', quantity: 1 },
    ]));

    const saved = await autosaved((d) => d.bracketAssessment?.level === 1 && d.meta.priceUsd === 24.75);
    expect(saved.meta.bracketLevel).toBe(1);
    expect(saved.bracketAssessment?.fingerprint).toMatch(/^[0-9a-z]{8}$/);
  });

  describe('bracket assessment with a third-party outage (DATA-001)', () => {
    function withOutage(override: FetchOverride) {
      vi.unstubAllGlobals();
      stubImagePreload();
      let outage = true;
      fetchMock = stubThirdPartyFetch((url, init) => (outage ? override(url, init) : undefined));
      return () => {
        outage = false;
      };
    }

    function bracketUploads() {
      return uploads().filter((d) => d.bracketAssessment || d.meta.bracketLevel != null);
    }

    it('shows a partial estimate, never persists it, and saves the bracket once a retry succeeds', async () => {
      const recover = withOutage((url) =>
        url.startsWith('https://backend.commanderspellbook.com/')
          ? ({ ok: false, status: 503, json: async () => ({}) } as Response)
          : undefined);
      await openDeck(COMMANDER_DECK);

      expect(await screen.findByText('DeckBracket.partialTitle', {}, { timeout: 3000 })).toBeInTheDocument();
      expect(screen.getByText('DeckBracket.sourceUnavailable')).toBeInTheDocument();
      // The price still autosaves; the degraded bracket never does.
      await autosaved((d) => d.meta.priceUsd === 24.75);
      expect(bracketUploads()).toEqual([]);

      recover();
      fireEvent.click(screen.getByRole('button', { name: /DeckBracket\.retry/ }));

      expect(await screen.findByText('DeckBracket.title', {}, { timeout: 3000 })).toBeInTheDocument();
      expect(screen.queryByText('DeckBracket.partialNotice')).toBeNull();
      const saved = await autosaved((d) => d.bracketAssessment?.level === 1);
      expect(saved.meta.bracketLevel).toBe(1);
    });

    it('treats a malformed Game Changers response as incomplete, not as "no Game Changers"', async () => {
      withOutage((url) =>
        url.includes('is%3Agamechanger')
          ? ({
            ok: true,
            status: 200,
            json: async () => {
              throw new SyntaxError('bad json');
            },
          } as unknown as Response)
          : undefined);
      await openDeck(COMMANDER_DECK);

      expect(await screen.findByText('DeckBracket.partialTitle', {}, { timeout: 3000 })).toBeInTheDocument();
      await autosaved((d) => d.meta.priceUsd === 24.75);
      expect(bracketUploads()).toEqual([]);
    });

    it('drops a stale saved assessment instead of leaving it as current', async () => {
      withOutage((url) =>
        url.startsWith('https://backend.commanderspellbook.com/')
          ? Promise.reject(new TypeError('Failed to fetch'))
          : undefined);
      await openDeck(codXml({
        name: 'Stale',
        format: 'commander',
        bracketLevel: 4,
        main: [{ name: 'Sol Ring' }],
      }));

      expect(await screen.findByText('DeckBracket.partialTitle', {}, { timeout: 3000 })).toBeInTheDocument();
      const saved = await autosaved((d) => d.meta.priceUsd === 1.5);
      expect(saved.bracketAssessment).toBeUndefined();
      expect(saved.meta.bracketLevel).toBeUndefined();
    });
  });

  it('autosaves edits as an update of the same deck id without a storage path', async () => {
    await openDeck(MODERN_DECK);

    fireEvent.change(screen.getByDisplayValue('Burn'), { target: { value: 'Burn v2' } });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    await autosaved((d) => d.name === 'Burn v2');
    const upload = findAllSessionCommands(Command_DeckUpload_ext)
      .find((c) => parseCod(c.value.deckList).name === 'Burn v2')!;
    expect(upload.value.deckId).toBe(DECK_ID);
    expect(isFieldSet(upload.value, Command_DeckUploadSchema.field.path)).toBe(false);

    const listRequestsBefore = findAllSessionCommands(Command_DeckList_ext).length;
    act(() => {
      deliverMessage(buildResponseMessage(buildResponse({
        cmdId: upload.cmdId,
        ext: Response_DeckUpload_ext,
        value: create(Response_DeckUploadSchema, {
          newFile: create(ServerInfo_DeckStorage_TreeItemSchema, { id: DECK_ID, name: 'Burn v2' }),
        }),
      })));
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    // The ack's tree item updates the deck tree in place; no list refetch.
    expect(findAllSessionCommands(Command_DeckList_ext).length).toBe(listRequestsBefore);
  });

  it('does not upload when nothing changed', async () => {
    await openDeck(MODERN_DECK);
    // Opening caches the computed price into the deck: one real change.
    await autosaved((d) => d.meta.priceUsd !== undefined);
    const before = uploads().length;

    fireEvent.change(screen.getByDisplayValue('Burn'), { target: { value: 'Burn v2' } });
    fireEvent.change(screen.getByDisplayValue('Burn v2'), { target: { value: 'Burn' } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 800));
    });
    expect(uploads()).toHaveLength(before);
  });

  it('writes a default format back for legacy decks that have none', async () => {
    await openDeck(codXml({ name: 'Legacy', main: [{ name: 'Sol Ring' }] }));

    const saved = await autosaved((d) => d.format === 'commander');
    expect(saved.name).toBe('Legacy');
  });

  it('quick add looks the card up, appends a mainboard row, and increments an existing one', async () => {
    await openDeck(MODERN_DECK);

    const quickAdd = screen.getByPlaceholderText('Quick add — type a card name');
    fireEvent.change(quickAdd, { target: { value: 'Atra' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Atraxa, Grand Unifier' }));

    await waitFor(() => expect(groupHeadings()).toContain('Creature1'));
    const added = await autosaved((d) => card(d, 'Atraxa, Grand Unifier')?.category === 'main');
    expect(card(added, 'Atraxa, Grand Unifier')?.quantity).toBe(1);
    expect(quickAdd).toHaveValue('');

    fireEvent.change(quickAdd, { target: { value: 'Sol' } });
    // Enter adds the highlighted suggestion once it has loaded (the row's
    // own "Sol Ring" name button is the other match).
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Sol Ring' })).toHaveLength(2));
    fireEvent.keyDown(quickAdd, { key: 'Enter' });
    await waitFor(() => expect(groupHeadings()).toContain('Artifact2'));
    const incremented = await autosaved((d) => card(d, 'Sol Ring')?.quantity === 2);
    expect(incremented.cards.filter((c) => c.name === 'Sol Ring')).toHaveLength(1);
  });

  it('moves a card to the sideboard and back, changes quantity, and removes it from the row menu', async () => {
    await openDeck(MODERN_DECK);

    fireEvent.click(rowActions('Sol Ring'));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Move to sideboard' }));
    await waitFor(() => expect(groupHeadings()).toEqual(['Instant1', 'Land10', 'Sideboard2']));
    await autosaved((d) => card(d, 'Sol Ring')?.category === 'sideboard');

    fireEvent.click(rowActions('Sol Ring'));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Move to main' }));
    await autosaved((d) => card(d, 'Sol Ring')?.category === 'main');

    fireEvent.click(rowActions('Sol Ring'));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('button', { name: 'Increase quantity' }));
    await autosaved((d) => card(d, 'Sol Ring')?.quantity === 2);

    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Remove' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sol Ring' })).toBeNull());
    await autosaved((d) => !card(d, 'Sol Ring'));
  });

  it('lists every Scryfall printing in the picker and stores the chosen one', async () => {
    await openDeck(MODERN_DECK);

    fireEvent.click(rowActions('Lightning Bolt'));
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Change printing' }));

    expect(screen.getByRole('heading', { name: 'Choose printing' })).toBeInTheDocument();
    fireEvent.click(await screen.findByTitle('LEA · Lightning Bolt'));
    expect(screen.queryByRole('heading', { name: 'Choose printing' })).toBeNull();

    const saved = await autosaved((d) => card(d, 'Lightning Bolt')?.set === 'lea');
    expect(card(saved, 'Lightning Bolt')).toEqual(expect.objectContaining({
      collectorNumber: '161',
      scryfallId: 'id-bolt-lea',
    }));
  });

  it('persists a format change from the sidebar picker', async () => {
    await openDeck(MODERN_DECK);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'legacy' } });
    await autosaved((d) => d.format === 'legacy');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'other' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Netrunner, Playtest'), { target: { value: 'Cube' } });
    await autosaved((d) => d.format === 'Cube');
  });

  it('advanced search composes filters into a Scryfall query and adds the clicked result', async () => {
    await openDeck(MODERN_DECK);

    fireEvent.change(screen.getByPlaceholderText('Quick add — type a card name'), { target: { value: 'bolt' } });
    fireEvent.click(screen.getByRole('button', { name: /Advanced search/ }));
    const search = screen.getByPlaceholderText('Search cards — Scryfall syntax works here too');
    expect(search).toHaveValue('bolt');

    fireEvent.click(screen.getByRole('button', { name: 'Red' }));
    fireEvent.click(screen.getByRole('button', { name: 'Instant' }));
    expect(await screen.findByText('bolt c:r t:instant')).toBeInTheDocument();
    await waitFor(() => {
      const queries = fetchCalls(fetchMock, 'https://api.scryfall.com/cards/search?')
        .map(([url]) => new URL(String(url)).searchParams.get('q'));
      expect(queries).toContain('bolt c:r t:instant');
    });

    fireEvent.click(await screen.findByTitle('Add Lightning Bolt to deck'));
    await autosaved((d) => card(d, 'Lightning Bolt')?.quantity === 2);

    fireEvent.click(screen.getByRole('button', { name: /Back to deck/ }));
    expect(groupHeadings()).toContain('Instant2');
  });

  it('opens the card detail dialog and edits quantity without closing it', async () => {
    await openDeck(MODERN_DECK);

    fireEvent.click(screen.getByRole('button', { name: 'Lightning Bolt' }));
    expect(await screen.findByText('Lightning Bolt deals 3 damage to any target.')).toBeInTheDocument();
    expect(screen.getByText('M11 · #149')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    await autosaved((d) => card(d, 'Lightning Bolt')?.quantity === 2);
    expect(screen.getByText('Lightning Bolt deals 3 damage to any target.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move to sideboard' }));
    await autosaved((d) => card(d, 'Lightning Bolt')?.category === 'sideboard');
    expect(screen.queryByText('Lightning Bolt deals 3 damage to any target.')).toBeNull();
  });

  it('exports the deck as plain text and as a Cockatrice .cod', async () => {
    await openDeck(MODERN_DECK);

    fireEvent.click(screen.getByRole('button', { name: /Export deck/ }));
    expect(screen.getAllByRole('textbox').some((el) => (el as HTMLTextAreaElement).value
      === '// Deck\n1 Lightning Bolt\n1 Sol Ring\n10 Forest\n\n// Sideboard\n1 Llanowar Elves')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Cockatrice \(\.cod\)/ }));
    const cod = screen.getAllByRole('textbox')
      .map((el) => (el as HTMLTextAreaElement).value)
      .find((v) => v.startsWith('<?xml'))!;
    const parsed = parseCod(cod);
    expect(parsed.name).toBe('Burn');
    expect(parsed.cards.map((c) => c.name)).toEqual(['Lightning Bolt', 'Sol Ring', 'Forest', 'Llanowar Elves']);
  });

  it('shows the not-found shell for an unreadable deck and links back to My Decks', async () => {
    renderFeatureScreen(
      <Routes>
        <Route path={RouteEnum.DECK} element={<DeckEditor />} />
        <Route path={RouteEnum.DECKS} element={<LocationProbe />} />
      </Routes>,
      `/deck/${DECK_ID}`,
    );
    await waitFor(() => expect(findLastSessionCommand(Command_DeckDownload_ext).value.deckId).toBe(DECK_ID));
    act(() => {
      respondToDeckDownload(DECK_ID, 'not xml');
    });

    expect(await screen.findByText('Deck not found')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Back to My Decks/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(RouteEnum.DECKS);
  });
});
