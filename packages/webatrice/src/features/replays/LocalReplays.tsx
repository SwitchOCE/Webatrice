import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileVideo, Folder } from 'lucide-react';
import Button from '@mui/material/Button';

import { REPLAY_FILE_EXTENSION } from '@app/services';

import type { LocalReplays as LocalReplaysModel } from './useLocalReplays';

export interface LocalReplaysProps {
  model: LocalReplaysModel;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * "Local replays": the browser-side replay library, standing in for desktop's
 * local replay directory. Every pick is a fresh file choice (no persistent file
 * handles, for cross-browser parity).
 */
function LocalReplays({ model }: LocalReplaysProps) {
  const { t } = useTranslation();
  const watchInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const selected = model.selected;

  return (
    <section className="replays-pane" aria-labelledby="replays-local-title">
      <header className="replays-pane__header">
        <h2 id="replays-local-title">{t('Replays.local.title')}</h2>
        <nav className="replays-pane__path" aria-label={t('Replays.local.path')}>
          {model.path.map((crumb, i) => (
            <span key={crumb.id}>
              {i > 0 && <span aria-hidden> / </span>}
              {i === model.path.length - 1
                ? <span aria-current="location">{crumb.name}</span>
                : <button type="button" onClick={() => model.openFolder(crumb.id)}>{crumb.name}</button>}
            </span>
          ))}
        </nav>
      </header>
      <div className="replays-pane__toolbar">
        <Button size="small" disabled={selected?.kind !== 'replay'} onClick={model.watchSelected}>
          {t('Replays.action.watch')}
        </Button>
        <Button size="small" onClick={() => watchInputRef.current?.click()}>
          {t('Replays.action.openFile')}
        </Button>
        <Button size="small" onClick={() => importInputRef.current?.click()}>
          {t('Replays.action.import')}
        </Button>
        <Button size="small" disabled={selected?.kind !== 'replay'} onClick={model.exportSelected}>
          {t('Replays.action.export')}
        </Button>
        <Button size="small" onClick={model.requestNewFolder}>
          {t('Replays.action.newFolder')}
        </Button>
        <Button size="small" disabled={!selected} onClick={model.requestRename}>
          {t('Replays.action.rename')}
        </Button>
        <Button size="small" color="error" disabled={!selected} onClick={model.requestDelete}>
          {t('Replays.action.delete')}
        </Button>
        <input
          ref={watchInputRef}
          type="file"
          accept={REPLAY_FILE_EXTENSION}
          hidden
          data-testid="replay-watch-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) {
              model.watchFile(file);
            }
          }}
        />
        <input
          ref={importInputRef}
          type="file"
          accept={REPLAY_FILE_EXTENSION}
          multiple
          hidden
          data-testid="replay-import-files"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length) {
              model.importFiles(files);
            }
          }}
        />
      </div>
      <div className="replays-pane__body">
        {!model.loading && model.entries.length === 0 ? (
          <p className="replays-pane__empty">{t('Replays.local.empty')}</p>
        ) : (
          <table className="replays-table" aria-label={t('Replays.local.title')}>
            <thead>
              <tr>
                <th>{t('Replays.local.column.name')}</th>
                <th className="replays-table__num">{t('Replays.local.column.size')}</th>
                <th>{t('Replays.local.column.modified')}</th>
              </tr>
            </thead>
            <tbody>
              {model.entries.map((entry) => (
                <tr
                  key={entry.id}
                  aria-selected={entry.id === selected?.id}
                  data-testid={`local-replay-${entry.name}`}
                  onClick={() => model.select(entry.id ?? null)}
                  onDoubleClick={() => model.activate(entry)}
                >
                  <td>
                    <span className="replays-table__name">
                      {entry.kind === 'folder' ? <Folder size={14} aria-hidden /> : <FileVideo size={14} aria-hidden />}
                      {entry.name}
                    </span>
                  </td>
                  <td className="replays-table__num">{entry.kind === 'replay' ? formatSize(entry.size) : ''}</td>
                  <td>{new Date(entry.modifiedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default LocalReplays;
