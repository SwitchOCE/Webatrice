import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Lock } from 'lucide-react';
import Button from '@mui/material/Button';

import type { ServerInfo_ReplayMatch } from '@cockatrice/sockatrice/generated';

import { useGridRows } from '@app/hooks';

import type { ServerReplays as ServerReplaysModel, ServerReplaySelection } from './useServerReplays';

export interface ServerReplaysProps {
  model: ServerReplaysModel;
  /** Local folder a "Save to local replays" lands in. */
  localFolderId: number;
}

function isSelected(selection: ServerReplaySelection | null, candidate: ServerReplaySelection): boolean {
  if (!selection || selection.kind !== candidate.kind || selection.gameId !== candidate.gameId) {
    return false;
  }
  return selection.kind === 'match' || (candidate.kind === 'replay' && selection.replayId === candidate.replayId);
}

function rowKey(node: ServerReplaySelection): string {
  return node.kind === 'match' ? `match:${node.gameId}` : `replay:${node.gameId}:${node.replayId}`;
}

function formatStarted(match: ServerInfo_ReplayMatch): string {
  return match.timeStarted ? new Date(match.timeStarted * 1000).toLocaleString() : '';
}

/**
 * "Server replay storage": the matches stored for this account, each expandable
 * into its replays (a game restarted after a win records one replay per game),
 * with desktop's remote actions on the selection.
 */
function ServerReplays({ model, localFolderId }: ServerReplaysProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const enabled = model.availability === 'available';
  const hasMatch = model.selectedMatch != null;
  const hasReplay = model.selection?.kind === 'replay';

  const toggleExpanded = (gameId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(gameId)) {
        next.delete(gameId);
      } else {
        next.add(gameId);
      }
      return next;
    });
  };

  // Rows in display order: each match, then its replays while expanded.
  const nodes = new Map<string, ServerReplaySelection>();
  for (const match of model.matches) {
    const matchNode: ServerReplaySelection = { kind: 'match', gameId: match.gameId };
    nodes.set(rowKey(matchNode), matchNode);
    if (expanded.has(match.gameId)) {
      for (const replay of match.replayList) {
        const replayNode: ServerReplaySelection = { kind: 'replay', gameId: match.gameId, replayId: replay.replayId };
        nodes.set(rowKey(replayNode), replayNode);
      }
    }
  }
  const rows = useGridRows({
    keys: [...nodes.keys()],
    selectedKey: model.selection ? rowKey(model.selection) : null,
    onSelect: (key) => model.select(nodes.get(key)!),
    // Enter opens like a double-click: a match folds open or shut, a replay plays.
    onActivate: (key) => {
      const node = nodes.get(key)!;
      if (node.kind === 'match') {
        toggleExpanded(node.gameId);
      } else {
        model.watch(node);
      }
    },
    onExpand: (key) => {
      const node = nodes.get(key)!;
      if (node.kind === 'match' && !expanded.has(node.gameId)) {
        toggleExpanded(node.gameId);
      }
    },
    onCollapse: (key) => {
      const node = nodes.get(key)!;
      if (node.kind === 'replay') {
        rows.focusRow(rowKey({ kind: 'match', gameId: node.gameId }));
      } else if (expanded.has(node.gameId)) {
        toggleExpanded(node.gameId);
      }
    },
  });

  const renderBody = () => {
    if (model.availability === 'disconnected') {
      return <p className="replays-pane__empty">{t('Replays.server.disconnected')}</p>;
    }
    if (model.availability === 'unregistered') {
      return <p className="replays-pane__empty">{t('Replays.server.unregistered')}</p>;
    }
    if (model.loading && model.matches.length === 0) {
      return <p className="replays-pane__empty">{t('Replays.server.loading')}</p>;
    }
    if (model.matches.length === 0) {
      return <p className="replays-pane__empty">{t('Replays.server.empty')}</p>;
    }
    return (
      <table className="replays-table" role="treegrid" aria-label={t('Replays.server.title')}>
        <thead>
          <tr>
            <th className="replays-table__num">{t('Replays.server.column.id')}</th>
            <th>{t('Replays.server.column.name')}</th>
            <th>{t('Replays.server.column.players')}</th>
            <th>{t('Replays.server.column.keep')}</th>
            <th>{t('Replays.server.column.started')}</th>
            <th className="replays-table__num">{t('Replays.server.column.duration')}</th>
          </tr>
        </thead>
        <tbody>
          {model.matches.map((match) => {
            const matchNode: ServerReplaySelection = { kind: 'match', gameId: match.gameId };
            const open = expanded.has(match.gameId);
            return (
              <Fragment key={match.gameId}>
                <tr
                  {...rows.getRowProps(rowKey(matchNode))}
                  aria-level={1}
                  aria-expanded={open}
                  aria-selected={isSelected(model.selection, matchNode)}
                  data-testid={`replay-match-${match.gameId}`}
                  onClick={() => model.select(matchNode)}
                  onDoubleClick={() => toggleExpanded(match.gameId)}
                >
                  <td className="replays-table__num">
                    <button
                      type="button"
                      tabIndex={-1}
                      className="replays-table__expander"
                      aria-label={open ? t('Replays.server.collapse') : t('Replays.server.expand')}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleExpanded(match.gameId);
                      }}
                    >
                      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    {match.gameId}
                  </td>
                  <td>{match.gameName}</td>
                  <td>{match.playerNames.join(', ')}</td>
                  <td>
                    {match.doNotHide && (
                      <Lock size={14} aria-label={t('Replays.server.locked')} data-testid={`replay-locked-${match.gameId}`} />
                    )}
                  </td>
                  <td>{formatStarted(match)}</td>
                  <td className="replays-table__num">{match.length}</td>
                </tr>
                {open && match.replayList.map((replay) => {
                  const replayNode: ServerReplaySelection = { kind: 'replay', gameId: match.gameId, replayId: replay.replayId };
                  return (
                    <tr
                      key={replay.replayId}
                      {...rows.getRowProps(rowKey(replayNode))}
                      aria-level={2}
                      aria-selected={isSelected(model.selection, replayNode)}
                      className="replays-table__child"
                      data-testid={`replay-${replay.replayId}`}
                      onClick={() => model.select(replayNode)}
                      onDoubleClick={() => model.watch(replayNode)}
                    >
                      <td className="replays-table__num">{replay.replayId}</td>
                      <td>{replay.replayName}</td>
                      <td />
                      <td />
                      <td />
                      <td className="replays-table__num">{replay.duration}</td>
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <section className="replays-pane" aria-labelledby="replays-server-title">
      <header className="replays-pane__header">
        <h2 id="replays-server-title">{t('Replays.server.title')}</h2>
      </header>
      <div className="replays-pane__toolbar">
        <Button size="small" disabled={!enabled || !hasReplay} onClick={() => model.watch()}>
          {t('Replays.action.watch')}
        </Button>
        <Button size="small" disabled={!enabled || !hasMatch} onClick={model.download}>
          {t('Replays.action.download')}
        </Button>
        <Button size="small" disabled={!enabled || !hasMatch} onClick={() => model.saveToLibrary(localFolderId)}>
          {t('Replays.action.saveToLibrary')}
        </Button>
        <Button size="small" disabled={!enabled || !hasMatch} onClick={model.toggleKeep}>
          {t('Replays.action.toggleKeep')}
        </Button>
        <Button size="small" color="error" disabled={!enabled || !hasMatch} onClick={model.requestDelete}>
          {t('Replays.action.delete')}
        </Button>
        <Button size="small" disabled={!enabled || !hasMatch} onClick={model.getShareCode}>
          {t('Replays.action.getCode')}
        </Button>
        <Button size="small" disabled={!enabled} onClick={model.openSubmitPrompt}>
          {t('Replays.action.submitCode')}
        </Button>
      </div>
      <div className="replays-pane__body">{renderBody()}</div>
    </section>
  );
}

export default ServerReplays;
