import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { Decks, clearDeckEditorCache, clearDecksListCache } from '@app/features/decks';
import { parseCod } from '@app/services';
import { RouteEnum } from '@app/types';
import {
  Command_DeckDel_ext,
  Command_DeckDelDir_ext,
  Command_DeckDownload_ext,
  Command_DeckList_ext,
  Command_DeckNewDir_ext,
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

async function loadTree(items = [
  deckFile(1, 'Older Deck', NOW_SECONDS - 7200),
  deckFile(2, 'Newer Deck', NOW_SECONDS - 60),
]) {
  renderDecks();
  await waitFor(() => expect(findAllSessionCommands(Command_DeckList_ext).length).toBeGreaterThan(0));
  act(() => {
    respondToDeckList(items);
  });
}

const NESTED_TREE = [
  deckFile(1, 'Older Deck', NOW_SECONDS - 7200),
  deckFolder('Tournament', [
    deckFile(2, 'Newer Deck', NOW_SECONDS - 60),
    deckFolder('Old', [deckFile(3, 'Oldest Deck', NOW_SECONDS - 86400 * 3)]),
  ]),
];

function acknowledge(cmdId: number) {
  act(() => {
    deliverMessage(buildResponseMessage(buildResponse({ cmdId })));
  });
}

describe('Decks (integration)', () => {
  it('renders the My Decks heading when the user is connected', () => {
    renderDecks();
    expect(screen.getByRole('heading', { level: 1, name: 'Decks.list.title' })).toBeInTheDocument();
    expect(screen.getByText('Decks.list.loading')).toBeInTheDocument();
  });

  it('requests the deck tree and lists the decks at the root, newest first', async () => {
    await loadTree();

    expect(await screen.findByText('Decks.list.deckCount')).toBeInTheDocument();
    const names = screen.getAllByText(/^(Older|Newer) Deck$/).map((el) => el.textContent);
    expect(names).toEqual(['Newer Deck', 'Older Deck']);
    expect(screen.getAllByText('Decks.list.created')).toHaveLength(2);
  });

  describe('folders (desktop TabDeckStorage remote tree)', () => {
    it('keeps the hierarchy: folder rows open a folder, the breadcrumb goes back up', async () => {
      await loadTree(NESTED_TREE);

      expect(await screen.findByText('Decks.list.deckCount')).toBeInTheDocument();
      expect(screen.getByText('Older Deck')).toBeInTheDocument();
      expect(screen.queryByText('Newer Deck')).toBeNull();
      expect(sentDeckDownloadIds()).toEqual([1]);

      fireEvent.click(screen.getByText('Tournament'));
      expect(await screen.findByText('Newer Deck')).toBeInTheDocument();
      expect(screen.queryByText('Older Deck')).toBeNull();
      expect(screen.getByText('Old')).toBeInTheDocument();
      await waitFor(() => expect(sentDeckDownloadIds().sort()).toEqual([1, 2]));

      fireEvent.click(screen.getByRole('button', { name: /DeckFolders.root/ }));
      expect(await screen.findByText('Older Deck')).toBeInTheDocument();
    });

    it('creates a folder inside the shown folder with Command_DeckNewDir', async () => {
      await loadTree(NESTED_TREE);
      fireEvent.click(await screen.findByText('Tournament'));

      fireEvent.click(screen.getByRole('button', { name: /DeckFolders.newFolder/ }));
      fireEvent.change(screen.getByRole('textbox', { name: 'CreateFolder.label' }), { target: { value: 'Side/Plans' } });
      fireEvent.click(screen.getByRole('button', { name: /CreateFolder.create/ }));

      await waitFor(() => expect(findAllSessionCommands(Command_DeckNewDir_ext)).toHaveLength(1));
      const { cmdId, value } = findLastSessionCommand(Command_DeckNewDir_ext);
      expect([value.path, value.dirName]).toEqual(['Tournament', 'Side-Plans']);
      acknowledge(cmdId);
      expect(await screen.findByText('Side-Plans')).toBeInTheDocument();
    });

    it('deletes a folder after naming what goes with it, through Command_DeckDelDir', async () => {
      await loadTree(NESTED_TREE);

      fireEvent.click(await screen.findByRole('button', { name: 'DeckFolders.deleteFolderNamed' }));
      const dialog = screen.getByRole('alertdialog', { name: 'DeleteFolder.title' });
      expect(within(dialog).getByText('DeleteFolder.scope')).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: 'DeleteFolder.delete' }));

      const { cmdId, value } = findLastSessionCommand(Command_DeckDelDir_ext);
      expect(value.path).toBe('Tournament');
      acknowledge(cmdId);
      await waitFor(() => expect(screen.queryByText('Tournament')).toBeNull());
      expect(screen.getByText('Decks.list.deckCount')).toBeInTheDocument();
      expect(screen.getByText('Older Deck')).toBeInTheDocument();
    });

    it('creates a deck inside the shown folder', async () => {
      await loadTree(NESTED_TREE);
      fireEvent.click(await screen.findByText('Tournament'));

      fireEvent.click(screen.getAllByRole('button', { name: /Decks\.list\.newDeck/ })[0]);
      fireEvent.change(screen.getByPlaceholderText('CreateDeckDialog.namePlaceholder'), { target: { value: 'Side Brew' } });
      fireEvent.click(screen.getByRole('button', { name: 'Common.action.create' }));

      const { cmdId, value } = findLastSessionCommand(Command_DeckUpload_ext);
      expect(value.path).toBe('Tournament');
      act(() => {
        deliverMessage(buildResponseMessage(buildResponse({
          cmdId,
          ext: Response_DeckUpload_ext,
          value: create(Response_DeckUploadSchema, {
            newFile: create(ServerInfo_DeckStorage_TreeItemSchema, { id: 9, name: 'Side Brew' }),
          }),
        })));
      });
      expect(await screen.findByTestId('location')).toHaveTextContent('/deck/9');
    });

    it('moves a deck: uploads the copy into the target folder, then deletes the original', async () => {
      await loadTree(NESTED_TREE);
      const xml = codXml({ name: 'Older Deck', format: 'modern' });
      await waitFor(() => expect(sentDeckDownloadIds()).toEqual([1]));
      act(() => {
        respondToDeckDownload(1, xml);
      });

      fireEvent.click(screen.getByRole('button', { name: 'DeckFolders.moveDeckNamed' }));
      fireEvent.change(screen.getByRole('combobox', { name: 'MoveDeck.target' }), { target: { value: 'Tournament/Old' } });
      const listRequestsBefore = findAllSessionCommands(Command_DeckList_ext).length;
      fireEvent.click(screen.getByRole('button', { name: /MoveDeck.move/ }));

      await waitFor(() => expect(findAllSessionCommands(Command_DeckList_ext)).toHaveLength(listRequestsBefore + 1));
      expect(sentDeckDownloadIds()).toEqual([1]);
      expect(findAllSessionCommands(Command_DeckUpload_ext)).toHaveLength(0);
      act(() => {
        respondToDeckList(NESTED_TREE);
      });
      await waitFor(() => expect(sentDeckDownloadIds()).toEqual([1, 1]));
      expect(findAllSessionCommands(Command_DeckUpload_ext)).toHaveLength(0);
      act(() => {
        respondToDeckDownload(1, xml);
      });

      const upload = findLastSessionCommand(Command_DeckUpload_ext);
      expect([upload.value.path, upload.value.deckId, upload.value.deckList]).toEqual(['Tournament/Old', 0, xml]);
      expect(findAllSessionCommands(Command_DeckDel_ext)).toHaveLength(0);
      act(() => {
        deliverMessage(buildResponseMessage(buildResponse({
          cmdId: upload.cmdId,
          ext: Response_DeckUpload_ext,
          value: create(Response_DeckUploadSchema, {
            newFile: deckFile(12, 'Older Deck'),
          }),
        })));
      });

      const del = findLastSessionCommand(Command_DeckDel_ext);
      expect(del.value.deckId).toBe(1);
      acknowledge(del.cmdId);
      await waitFor(() => expect(screen.queryByText('Older Deck')).toBeNull());
      expect(screen.queryByTestId('location')).toBeNull();
      expect(screen.getByText('Decks.list.deckCount')).toBeInTheDocument();
    });
  });

  it('downloads every deck once and groups rows by the format each file declares', async () => {
    await loadTree();

    await waitFor(() => expect(sentDeckDownloadIds().sort()).toEqual([1, 2]));
    expect(screen.getByRole('heading', { level: 2, name: /Common\.status\.loading/ })).toBeInTheDocument();

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
    expect(sections.map((h) => h.textContent)).toEqual(['DeckFormat.commander1', 'DeckFormat.modern1']);
    expect(screen.getByText('Decks.badge.bracketShort')).toHaveAttribute('title', 'Decks.badge.bracket');
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
    expect(sections.map((h) => h.textContent)).toEqual(['DeckSummary.section.other1', 'DeckSummary.section.unknown1']);
    expect(screen.getByText('Netrunner')).toBeInTheDocument();
  });

  it('opens a deck in the editor route when its row is clicked', async () => {
    await loadTree();
    fireEvent.click(await screen.findByText('Older Deck'));
    expect(screen.getByTestId('location')).toHaveTextContent('/deck/1');
  });

  it('asks for confirmation, then deletes the deck through Command_DeckDel', async () => {
    await loadTree();

    const deleteOlder = async () => within((await screen.findByText('Older Deck')).closest('li')!)
      .getByRole('button', { name: 'Decks.list.deleteDeckNamed' });
    fireEvent.click(await deleteOlder());
    const dialog = screen.getByRole('alertdialog', { name: 'DeleteDeckDialog.title' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Common.action.cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(findAllSessionCommands(Command_DeckDel_ext)).toHaveLength(0);

    fireEvent.click(await deleteOlder());
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Common.action.delete' }));

    const { cmdId, value } = findLastSessionCommand(Command_DeckDel_ext);
    expect(value.deckId).toBe(1);
    act(() => {
      deliverMessage(buildResponseMessage(buildResponse({ cmdId })));
    });
    await waitFor(() => expect(screen.queryByText('Older Deck')).toBeNull());
    expect(screen.getByText('Decks.list.deckCount')).toBeInTheDocument();
    expect(screen.getByText('Newer Deck')).toBeInTheDocument();
  });

  it('creates a named deck in the chosen format at the storage root and opens it', async () => {
    await loadTree();

    fireEvent.click(screen.getAllByRole('button', { name: /Decks\.list\.newDeck/ })[0]);
    fireEvent.change(screen.getByPlaceholderText('CreateDeckDialog.namePlaceholder'), { target: { value: '  Fresh Brew  ' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'modern' } });
    fireEvent.click(screen.getByRole('button', { name: 'Common.action.create' }));

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

    fireEvent.click(screen.getByRole('button', { name: /Decks\.list\.import/ }));
    expect(screen.getByRole('heading', { name: 'ImportDeckDialog.title' })).toBeInTheDocument();
    const nameInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(nameInput, { target: { value: 'Pasted' } });
    fireEvent.change(screen.getByPlaceholderText('ImportDeckDialog.placeholder'), {
      target: { value: 'Deck\n2 Sol Ring\n1 Mystery Card\n\nSideboard\n1 Lightning Bolt\nnot a card line' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ImportDeckDialog.next' }));

    expect(await screen.findByText('ImportDeckDialog.review.matched')).toBeInTheDocument();
    expect(screen.getByText('ImportDeckDialog.review.missing')).toBeInTheDocument();
    expect(screen.getAllByText('ImportDeckDialog.review.unknown')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'ImportDeckDialog.importCards' }));

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

    fireEvent.click(screen.getByRole('button', { name: /Decks\.list\.import/ }));
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
    expect(screen.getByText('ImportDeckDialog.file.cachedPrice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ImportDeckDialog.importFile' }));

    await waitFor(() => expect(findAllSessionCommands(Command_DeckUpload_ext)).toHaveLength(1));
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
    fireEvent.click(screen.getByRole('button', { name: 'Decks.list.refreshLabel' }));
    expect(findAllSessionCommands(Command_DeckList_ext)).toHaveLength(listRequestsBefore + 1);
    act(() => {
      respondToDeckList([deckFile(1, 'Older Deck'), deckFile(2, 'Newer Deck')]);
    });
    await waitFor(() => expect(findAllSessionCommands(Command_DeckDownload_ext)).toHaveLength(4));
  });

  it('switches between card and compact rows and remembers the choice', async () => {
    await loadTree();

    const compact = screen.getByRole('button', { name: 'Decks.list.view.compact' });
    expect(compact).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(compact);
    expect(compact).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('decks:viewMode')).toBe('compact');
    expect(store.getState().server.backendDecks).not.toBeNull();
  });
});
