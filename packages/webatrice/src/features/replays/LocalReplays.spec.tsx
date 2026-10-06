import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { toBinary } from '@bufbuild/protobuf';

import { GameReplaySchema } from '@cockatrice/sockatrice/generated';
import { REPLAY_LIBRARY_ROOT, ReplayFileDTO, ReplayNameTakenError } from '@app/services';
import { RouteEnum } from '@app/types';

import { disconnectedState, makeStoreState, renderWithProviders } from '../../__test-utils__';
import { buildReplay, sayContainer } from '../../services/replay/__mocks__/fixtures';
import Replays from './Replays';
import { MAX_REPLAY_FILE_BYTES } from './replayFiles';

vi.mock('../../hooks/useSettings');

function entry(id: number, name: string, kind: 'folder' | 'replay' = 'replay', parentId = REPLAY_LIBRARY_ROOT) {
  return Object.assign(new ReplayFileDTO(), {
    id, name, kind, parentId, size: kind === 'replay' ? 2048 : 0, modifiedAt: '2026-10-01T12:00:00.000Z',
  });
}

const replayBytes = () => toBinary(GameReplaySchema, buildReplay([sayContainer(0)]));

/** Library contents by folder id. */
let library: Record<number, ReplayFileDTO[]>;

function renderReplays() {
  // Local replays work offline: no login needed.
  return renderWithProviders(
    <Routes>
      <Route path={RouteEnum.REPLAYS} element={<Replays />} />
      <Route path={RouteEnum.REPLAY} element={<div data-testid="replay-view" />} />
    </Routes>,
    { route: RouteEnum.REPLAYS, preloadedState: makeStoreState(disconnectedState) },
  );
}

function localPane() {
  return within(screen.getByRole('region', { name: 'Replays.local.title' }));
}

beforeEach(() => {
  library = {
    [REPLAY_LIBRARY_ROOT]: [entry(1, 'zeta.cor'), entry(2, 'Tournament', 'folder'), entry(3, 'alpha.cor')],
    2: [entry(4, 'round1.cor', 'replay', 2)],
  };
  vi.spyOn(ReplayFileDTO, 'listFolder').mockImplementation(async (parentId = REPLAY_LIBRARY_ROOT) => library[parentId] ?? []);
  vi.spyOn(ReplayFileDTO, 'getAll').mockImplementation(async () => Object.values(library).flat());
  vi.spyOn(ReplayFileDTO, 'readData').mockResolvedValue(replayBytes());
});

describe('Local replays', () => {
  it('lists folders before replays, by name', async () => {
    renderReplays();

    await localPane().findByTestId('local-replay-zeta.cor');
    const names = localPane().getAllByRole('row').slice(1).map((row) => row.getAttribute('data-testid'));
    expect(names).toEqual(['local-replay-Tournament', 'local-replay-alpha.cor', 'local-replay-zeta.cor']);
    // Sizes use the UI language's unit names, not hard-coded English ones.
    expect(localPane().getByTestId('local-replay-zeta.cor')).toHaveTextContent('2 kB');
  });

  it('opens a folder on double-click and walks back up via the path', async () => {
    renderReplays();

    fireEvent.doubleClick(await localPane().findByTestId('local-replay-Tournament'));
    expect(await localPane().findByTestId('local-replay-round1.cor')).toBeInTheDocument();
    expect(localPane().getByRole('navigation')).toHaveTextContent('Replays.local.root / Tournament');

    fireEvent.click(localPane().getByRole('button', { name: 'Replays.local.root' }));
    expect(await localPane().findByTestId('local-replay-zeta.cor')).toBeInTheDocument();
  });

  it('watches a library replay on double-click', async () => {
    renderReplays();

    fireEvent.doubleClick(await localPane().findByTestId('local-replay-alpha.cor'));

    expect(await screen.findByTestId('replay-view')).toBeInTheDocument();
    expect(ReplayFileDTO.readData).toHaveBeenCalledWith(3);
  });

  it('is operable from the keyboard: arrows and Home/End select, Enter opens', async () => {
    renderReplays();
    const folder = await localPane().findByTestId('local-replay-Tournament');
    expect(localPane().getByRole('grid')).toBeInTheDocument();
    expect(folder).toHaveAttribute('tabindex', '0');
    expect(localPane().getByTestId('local-replay-alpha.cor')).toHaveAttribute('tabindex', '-1');

    folder.focus();
    fireEvent.keyDown(folder, { key: 'End' });
    const last = localPane().getByTestId('local-replay-zeta.cor');
    expect(last).toHaveFocus();
    expect(last).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(last, { key: 'ArrowUp' });
    const alpha = localPane().getByTestId('local-replay-alpha.cor');
    expect(alpha).toHaveFocus();
    expect(localPane().getByRole('button', { name: 'Replays.action.watch' })).toBeEnabled();

    fireEvent.keyDown(alpha, { key: 'Enter' });
    expect(await screen.findByTestId('replay-view')).toBeInTheDocument();
    expect(ReplayFileDTO.readData).toHaveBeenCalledWith(3);
  });

  it('enters a folder with Enter', async () => {
    renderReplays();
    const folder = await localPane().findByTestId('local-replay-Tournament');

    fireEvent.keyDown(folder, { key: 'Enter' });

    expect(await localPane().findByTestId('local-replay-round1.cor')).toBeInTheDocument();
  });

  it('reports a library read failure when watching or exporting', async () => {
    vi.mocked(ReplayFileDTO.readData).mockRejectedValue(new Error('IndexedDB unavailable'));
    renderReplays();

    fireEvent.doubleClick(await localPane().findByTestId('local-replay-alpha.cor'));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Replays.local.readFailed');
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(localPane().getByTestId('local-replay-alpha.cor'));
    fireEvent.click(localPane().getByRole('button', { name: 'Replays.action.export' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Replays.local.readFailed');
  });

  it('reports a stored entry that is not a replay', async () => {
    vi.mocked(ReplayFileDTO.readData).mockResolvedValue(new Uint8Array([0xff, 0xff]));
    renderReplays();

    fireEvent.doubleClick(await localPane().findByTestId('local-replay-alpha.cor'));

    expect(await screen.findByRole('dialog')).toHaveTextContent('Replays.local.invalidFile');
  });

  it('creates a folder in the current folder', async () => {
    const addFolder = vi.spyOn(ReplayFileDTO, 'addFolder').mockResolvedValue(9);
    renderReplays();
    await localPane().findByTestId('local-replay-zeta.cor');

    fireEvent.click(localPane().getByRole('button', { name: 'Replays.action.newFolder' }));
    fireEvent.change(screen.getByLabelText('Replays.local.newFolderName'), { target: { value: 'Casual' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(addFolder).toHaveBeenCalledWith(REPLAY_LIBRARY_ROOT, 'Casual'));
  });

  it('renames the selected entry, editing only the name before .cor', async () => {
    const rename = vi.spyOn(ReplayFileDTO, 'rename').mockResolvedValue();
    renderReplays();

    fireEvent.click(await localPane().findByTestId('local-replay-zeta.cor'));
    fireEvent.click(localPane().getByRole('button', { name: 'Replays.action.rename' }));
    const input = screen.getByLabelText('Replays.local.newName');
    expect(input).toHaveValue('zeta');
    expect(screen.getByRole('dialog')).toHaveTextContent('Replays.local.renameFileTitle');

    fireEvent.change(input, { target: { value: 'final' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(rename).toHaveBeenCalledWith(1, 'final.cor'));
  });

  it('reports a rename that clashes with a sibling', async () => {
    const rename = vi.spyOn(ReplayFileDTO, 'rename').mockImplementation(async (_id, name) => {
      if (name === 'alpha.cor') {
        throw new ReplayNameTakenError(name);
      }
    });
    renderReplays();

    fireEvent.click(await localPane().findByTestId('local-replay-zeta.cor'));
    fireEvent.click(localPane().getByRole('button', { name: 'Replays.action.rename' }));
    fireEvent.change(screen.getByLabelText('Replays.local.newName'), { target: { value: 'alpha' } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'OK' }));

    expect(await screen.findByText('Replays.local.nameTaken')).toBeInTheDocument();
    expect(rename).toHaveBeenCalledWith(1, 'alpha.cor');
  });

  it('deletes the selection only after confirming', async () => {
    const remove = vi.spyOn(ReplayFileDTO, 'delete').mockResolvedValue();
    renderReplays();

    fireEvent.click(await localPane().findByTestId('local-replay-Tournament'));
    fireEvent.click(localPane().getByRole('button', { name: 'Replays.action.delete' }));
    expect(remove).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Replays.local.deleteMessage');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replays.action.delete' }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith([2]));
  });

  it('imports picked .cor files into the current folder and rejects anything else', async () => {
    const addReplay = vi.spyOn(ReplayFileDTO, 'addReplay').mockResolvedValue(10);
    renderReplays();
    await localPane().findByTestId('local-replay-zeta.cor');

    fireEvent.change(screen.getByTestId('replay-import-files'), {
      target: {
        files: [
          new File([replayBytes() as BlobPart], 'replay_31.cor'),
          new File(['1 Island'], 'deck.cor'),
        ],
      },
    });

    await waitFor(() => expect(addReplay).toHaveBeenCalledTimes(1));
    expect(addReplay).toHaveBeenCalledWith(REPLAY_LIBRARY_ROOT, 'replay_31.cor', expect.any(Uint8Array));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Replays.local.invalidFiles');
  });

  it('checks each imported file and reports every problem by kind, importing the rest', async () => {
    const addReplay = vi.spyOn(ReplayFileDTO, 'addReplay').mockImplementation(async (_parent, name) => {
      if (name === 'broken.cor') {
        throw new Error('QuotaExceededError');
      }
      return 10;
    });
    const huge = new File([replayBytes() as BlobPart], 'huge.cor');
    Object.defineProperty(huge, 'size', { value: MAX_REPLAY_FILE_BYTES + 1 });
    renderReplays();
    await localPane().findByTestId('local-replay-zeta.cor');

    fireEvent.change(screen.getByTestId('replay-import-files'), {
      target: {
        files: [
          new File([replayBytes() as BlobPart], 'good.cor'),
          new File([replayBytes() as BlobPart], 'replay.txt'),
          huge,
          new File([replayBytes() as BlobPart], 'broken.cor'),
        ],
      },
    });

    const dialog = await screen.findByRole('dialog');
    expect(addReplay.mock.calls.map(([, name]) => name)).toEqual(['good.cor', 'broken.cor']);
    expect(dialog).toHaveTextContent('Replays.local.invalidFiles');
    expect(dialog).toHaveTextContent('Replays.local.tooLarge');
    expect(dialog).toHaveTextContent('Replays.local.importFailed');
  });

  it('refuses to watch a picked file without the .cor extension', async () => {
    renderReplays();

    fireEvent.change(screen.getByTestId('replay-watch-file'), {
      target: { files: [new File([replayBytes() as BlobPart], 'replay.txt')] },
    });

    expect(await screen.findByRole('dialog')).toHaveTextContent('Replays.local.invalidFile');
    expect(screen.queryByTestId('replay-view')).not.toBeInTheDocument();
  });

  it('watches a picked file without adding it to the library', async () => {
    const addReplay = vi.spyOn(ReplayFileDTO, 'addReplay');
    renderReplays();

    fireEvent.change(screen.getByTestId('replay-watch-file'), {
      target: { files: [new File([replayBytes() as BlobPart], 'from-disk.cor')] },
    });

    expect(await screen.findByTestId('replay-view')).toBeInTheDocument();
    expect(addReplay).not.toHaveBeenCalled();
  });

  it('shows a useful error for a picked file that is not a replay', async () => {
    renderReplays();

    fireEvent.change(screen.getByTestId('replay-watch-file'), {
      target: { files: [new File(['not a replay'], 'notes.txt')] },
    });

    expect(await screen.findByRole('dialog')).toHaveTextContent('Replays.local.invalidFile');
    expect(screen.queryByTestId('replay-view')).not.toBeInTheDocument();
  });
});
