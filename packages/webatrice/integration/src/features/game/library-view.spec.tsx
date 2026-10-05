import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { create } from '@bufbuild/protobuf';
import { describe, expect, it } from 'vitest';

import { games } from '@cockatrice/datatrice';
import {
  Command_DumpZone_ext,
  Command_Shuffle_ext,
  Response_DumpZone_ext,
  Response_DumpZoneSchema,
  ServerInfo_CardSchema,
  ServerInfo_ZoneSchema,
} from '@cockatrice/sockatrice/generated';
import { Game } from '@app/features/game';
import { store, connectRaw } from '../../helpers/setup';
import { findAllGameCommands, findLastGameCommand } from '../../helpers/command-capture';
import { buildResponse, buildResponseMessage, deliverMessage } from '../../helpers/protobuf-builders';
import { renderFeatureScreen } from '../helpers';
import { buildEventGameJoined, buildEventGameStateChanged, registerGameBoardHooks } from './helpers';

registerGameBoardHooks();

// "View library" end to end: the library pile's menu sends Command_DumpZone, the
// Response_DumpZone snapshot fills the game-level ZoneViewDialog, and closing
// the view shuffles the library (the default) and drops the snapshot.

async function renderBoard() {
  connectRaw();
  renderFeatureScreen(<Game />);
  act(() => {
    store.dispatch(games.Actions.gameJoined({ data: buildEventGameJoined({ gameId: 42, localPlayerId: 1, hostId: 1 }) }));
    store.dispatch(games.Actions.gameStateChanged({ gameId: 42, data: buildEventGameStateChanged([1, 2], 1) }));
  });
  return waitFor(() => screen.getAllByTitle(/^Library — 40/)[0]);
}

function openViewLibrary(library: HTMLElement) {
  act(() => {
    fireEvent.contextMenu(library, { clientX: 10, clientY: 10 });
  });
  act(() => {
    fireEvent.click(screen.getByRole('menuitem', { name: /^View library/ }));
  });
}

function answerDump(names: string[]) {
  const { cmdId } = findLastGameCommand(Command_DumpZone_ext);
  act(() => deliverMessage(buildResponseMessage(buildResponse({
    cmdId,
    ext: Response_DumpZone_ext,
    value: create(Response_DumpZoneSchema, {
      zoneInfo: create(ServerInfo_ZoneSchema, {
        name: 'deck',
        type: 2,
        cardCount: names.length,
        cardList: names.map((name, id) => create(ServerInfo_CardSchema, { id, name })),
      }),
    }),
  }))));
}

function libraryView(): HTMLElement {
  return screen.getByRole('heading', { name: /^P1's library/ }).closest<HTMLElement>('.pointer-events-auto.resize')!;
}

describe('View library', () => {
  it('dumps the whole library and lists the server snapshot', async () => {
    openViewLibrary(await renderBoard());

    const dumps = findAllGameCommands(Command_DumpZone_ext);
    expect(dumps).toHaveLength(1);
    expect(dumps[0].gameId).toBe(42);
    expect(dumps[0].value).toMatchObject({ playerId: 1, zoneName: 'deck', numberCards: -1 });

    answerDump(['Island', 'Ponder']);

    await waitFor(() => expect(libraryView().querySelectorAll('[data-card][data-card-id]')).toHaveLength(2));
    expect(within(libraryView()).getByText('Ponder')).toBeInTheDocument();
  });

  it('shuffles on close and drops the snapshot from the store', async () => {
    openViewLibrary(await renderBoard());
    answerDump(['Island']);
    await waitFor(() => expect(libraryView()).toBeInTheDocument());

    act(() => {
      fireEvent.click(within(libraryView()).getByRole('button', { name: 'ZoneViewPanel.close' }));
    });

    const shuffles = findAllGameCommands(Command_Shuffle_ext);
    expect(shuffles).toHaveLength(1);
    expect(shuffles[0].value).toMatchObject({ zoneName: 'deck', start: 0, end: -1 });
    expect(games.Selectors.getZone(store.getState(), 42, 1, 'deck')?.revealedCards ?? []).toEqual([]);
    expect(screen.queryByRole('heading', { name: /^P1's library/ })).not.toBeInTheDocument();
  });
});
