import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { Decks, clearDeckEditorCache, clearDecksListCache } from '@app/features/decks';
import { parseCod } from '@app/services';
import { RouteEnum } from '@app/types';
import {
  Command_DeckDel_ext,
  Command_DeckDownload_ext,
  Command_DeckList_ext,
  Command_DeckUpload_ext,
  Command_DeckUploadSchema,
  Response_DeckUploadSchema,
  Response_DeckUpload_ext,
  ServerInfo_DeckStorage_TreeItemSchema,
} from '@cockatrice/sockatrice/generated';
import { create, isFieldSet } from '@bufbuild/protobuf';

import { connectAndLogin } from '../helpers/setup';
import { findAllSessionCommands, findLastSessionCommand } from '../helpers/command-capture';
import { buildResponse, buildResponseMessage, deliverMessage } from '../helpers/protobuf-builders';
import { renderFeatureScreen, store } from './helpers';
import {
  LocationProbe,
  codXml,
  deckFile,
  deckFolder,
  respondToDeckDownload,
  respondToDeckList,
  sentDeckDownloadIds,
  stubThirdPartyFetch,
} from './deckHelpers';

// Characterization of the MyDecks route: every assertion pins either a real
// Sockatrice command on the (mocked) socket or user-visible output, so the
// deck-feature refactor can prove it preserved behaviour.

function renderDecks() {
  return renderFeatureScreen(
    <Routes>
      <Route path={RouteEnum.DECKS} element={<Decks />} />
      <Route path={RouteEnum.DECK} element={<LocationProbe />} />
    </Routes>,
    RouteEnum.DECKS,
  );
}

const NOW_SECONDS = Math.floor(Date.now() / 1000);

beforeEach(() => {
  vi.useRealTimers();
  clearDecksListCache();
  clearDeckEditorCache();
  window.localStorage.clear();
  stubThirdPartyFetch();
  connectAndLogin();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadTree() {
  renderDecks();
  // The page (and the TopBar's tab titles) request the tree on mount.
  await waitFor(() => expect(findAllSessionCommands(Command_DeckList_ext).length).toBeGreaterThan(0));
  act(() => {
    respondToDeckList([
      deckFile(1, 'Older Deck', NOW_SECONDS - 7200),
      deckFolder('Tournament', [deckFile(2, 'Newer Deck', NOW_SECONDS - 60)]),
    ]);
  });
}

describe('Decks (integration)', () => {
  it('renders the My Decks heading when the user is connected', () => {
    renderDecks();
    expect(screen.getByRole('heading', { level: 1, name: 'My Decks' })).toBeInTheDocument();
    expect(screen.getByText('Loading decks…')).toBeInTheDocument();
  });

  it('requests the deck tree and lists every file in it, newest first, with its folder path', async () => {
    await loadTree();

    expect(await screen.findByText('2 decks on this server')).toBeInTheDocument();
    const names = screen.getAllByText(/^(Older|Newer) Deck$/).map((el) => el.textContent);
    expect(names).toEqual(['Newer Deck', 'Older Deck']);
    expect(screen.getByText('Tournament')).toBeInTheDocument();
    expect(screen.getByText('Created 1m ago')).toBeInTheDocument();
    expect(screen.getByText('Created 2h ago')).toBeInTheDocument();
  });

  it('downloads every deck once and groups rows by the format each file declares', async () => {
    await loadTree();

    await waitFor(() => expect(sentDeckDownloadIds().sort()).toEqual([1, 2]));
    // Rows wait under "Loading…" until their XML lands.
    expect(screen.getByRole('heading', { level: 2, name: /Loading…/ })).toBeInTheDocument();

    act(() => {
      respondToDeckDownload(1, codXml({ name: 'Older Deck', format: 'modern', comments: { priceUsd: 12.5 } }));
      respondToDeckDownload(2, codXml({
        name: 'Newer Deck',
        format: 'commander',
        bracketLevel: 3,
        comments: { priceUsd: 40, priceMissingCount: 2 },
      }));
    });

    const sections = await screen.findAllByRole('heading', { level: 2 });
    expect(sections.map((h) => h.textContent)).toEqual(['Commander1', 'Modern1']);
    expect(screen.getByText('B3')).toHaveAttribute('title', 'Commander Bracket 3');
    expect(screen.getByText('$12.50')).toBeInTheDocument();
    expect(screen.getByText('$40.00+')).toBeInTheDocument();
    expect(sentDeckDownloadIds()).toHaveLength(2);
  });

  it('files decks without a format under "Unknown format" and custom formats under "Other"', async () => {
    await loadTree();
    await waitFor(() => expect(sentDeckDownloadIds()).toHaveLength(2));
    act(() => {
      respondToDeckDownload(1, codXml({ name: 'Older Deck' }));
      respondToDeckDownload(2, codXml({ name: 'Newer Deck', format: 'netrunner' }));
    });

    const sections = await screen.findAllByRole('heading', { level: 2 });
    expect(sections.map((h) => h.textContent)).toEqual(['Other1', 'Unknown format1']);
    expect(screen.getByText('Netrunner')).toBeInTheDocument();
  });

  it('opens a deck in the editor route when its row is clicked', async () => {
    await loadTree();
    fireEvent.click(await screen.findByText('Older Deck'));
    expect(screen.getByTestId('location')).toHaveTextContent('/deck/1');
  });

  it('asks for confirmation, then deletes the deck through Command_DeckDel', async () => {
    await loadTree();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Older Deck' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete deck?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(findAllSessionCommands(Command_DeckDel_ext)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Older Deck' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));

    const { cmdId, value } = findLastSessionCommand(Command_DeckDel_ext);
    expect(value.deckId).toBe(1);
    act(() => {
      deliverMessage(buildResponseMessage(buildResponse({ cmdId })));
    });
    await waitFor(() => expect(screen.queryByText('Older Deck')).toBeNull());
    expect(screen.getByText('1 deck on this server')).toBeInTheDocument();
  });

  it('creates a named deck in the chosen format at the storage root and opens it', async () => {
    await loadTree();

    fireEvent.click(screen.getAllByRole('button', { name: /New deck/ })[0]);
    fireEvent.change(screen.getByPlaceholderText('Untitled Deck'), { target: { value: '  Fresh Brew  ' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'modern' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    const { cmdId, value } = findLastSessionCommand(Command_DeckUpload_ext);
    expect(value.path).toBe('');
    expect(isFieldSet(value, Command_DeckUploadSchema.field.path)).toBe(true);
    expect(value.deckId).toBe(0);
    const parsed = parseCod(value.deckList);
    expect(parsed.name).toBe('Fresh Brew');
    expect(parsed.format).toBe('modern');
    expect(parsed.cards).toEqual([]);

    act(() => {
      deliverMessage(buildResponseMessage(buildResponse({
        cmdId,
        ext: Response_DeckUpload_ext,
        value: create(Response_DeckUploadSchema, {
          newFile: create(ServerInfo_DeckStorage_TreeItemSchema, { id: 9, name: 'Fresh Brew' }),
        }),
      })));
    });
    expect(await screen.findByTestId('location')).toHaveTextContent('/deck/9');
  });

  it('imports a pasted decklist after resolving its cards, keeping unknown cards', async () => {
    await loadTree();

    fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    expect(screen.getByRole('heading', { name: 'Import a deck' })).toBeInTheDocument();
    const nameInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(nameInput, { target: { value: 'Pasted' } });
    fireEvent.change(screen.getByPlaceholderText(/Paste your deck list/), {
      target: { value: 'Deck\n2 Sol Ring\n1 Mystery Card\n\nSideboard\n1 Lightning Bolt\nnot a card line' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next: check cards' }));

    expect(await screen.findByText(/3 matched/)).toBeInTheDocument();
    expect(screen.getByText(/1 unknown \(imported with warning\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Import 3 cards/ }));

    const { value } = findLastSessionCommand(Command_DeckUpload_ext);
    expect(value.deckId).toBe(0);
    const parsed = parseCod(value.deckList);
    expect(parsed.name).toBe('Pasted');
    expect(parsed.format).toBe('commander');
    expect(parsed.cards.map((c) => [c.name, c.quantity, c.category])).toEqual([
      ['Sol Ring', 2, 'main'],
      ['Mystery Card', 1, 'main'],
      ['Lightning Bolt', 1, 'sideboard'],
    ]);
  });

  it('imports a .cod file as-is, preserving its metadata and format', async () => {
    await loadTree();

    fireEvent.click(screen.getByRole('button', { name: /Import/ }));
    const file = new File(
      [codXml({
        name: 'From Desktop',
        format: 'legacy',
        comments: { priceUsd: 99, description: 'kept' },
        main: [{ name: 'Lightning Bolt', quantity: 4, set: 'm11', num: '149' }],
      })],
      'desktop.cod',
      { type: 'application/xml' },
    );
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText('desktop.cod')).toBeInTheDocument();
    expect(screen.getByText('$99.00 cached from source')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Import file/ }));

    const { value } = findLastSessionCommand(Command_DeckUpload_ext);
    const parsed = parseCod(value.deckList);
    expect(parsed.name).toBe('From Desktop');
    expect(parsed.format).toBe('legacy');
    expect(parsed.meta.description).toBe('kept');
    expect(parsed.meta.priceUsd).toBe(99);
    expect(parsed.cards).toEqual([
      expect.objectContaining({ name: 'Lightning Bolt', quantity: 4, set: 'm11', collectorNumber: '149' }),
    ]);
  });

  it('refresh drops the cached summaries and re-requests the tree and every deck', async () => {
    await loadTree();
    await waitFor(() => expect(sentDeckDownloadIds()).toHaveLength(2));
    act(() => {
      respondToDeckDownload(1, codXml({ name: 'Older Deck', format: 'modern' }));
      respondToDeckDownload(2, codXml({ name: 'Newer Deck', format: 'modern' }));
    });

    const listRequestsBefore = findAllSessionCommands(Command_DeckList_ext).length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh deck list' }));
    expect(findAllSessionCommands(Command_DeckList_ext)).toHaveLength(listRequestsBefore + 1);
    act(() => {
      respondToDeckList([deckFile(1, 'Older Deck'), deckFile(2, 'Newer Deck')]);
    });
    await waitFor(() => expect(findAllSessionCommands(Command_DeckDownload_ext)).toHaveLength(4));
  });

  it('switches between card and compact rows and remembers the choice', async () => {
    await loadTree();

    const compact = screen.getByRole('button', { name: 'Compact view' });
    expect(compact).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(compact);
    expect(compact).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('decks:viewMode')).toBe('compact');
    expect(store.getState().server.backendDecks).not.toBeNull();
  });
});
