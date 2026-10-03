import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  Wifi,
  WifiOff,
  Plus,
  Pencil,
  Check,
  AlertCircle,
  Loader2,
  RefreshCw,
  Globe,
} from 'lucide-react';

import { HostDTO } from '@app/services';
import { LoadingState } from '@app/hooks';
import { getHostPort } from '@app/utils';

import KnownHostDialog from './KnownHostDialog';
import { TestConnection, useKnownHostsComponent } from './useKnownHostsComponent';
import { publicServerOptions, refreshPublicServers, usePublicServers } from './usePublicServers';

interface KnownHostsProps {
  value: HostDTO | undefined;
  onChange: (host: HostDTO | undefined) => void;
  error?: string;
  touched?: boolean;
  disabled?: boolean;
}

const KnownHosts = ({ onChange, error, touched, disabled }: KnownHostsProps) => {
  const { t } = useTranslation();
  const {
    hosts,
    selectedHost,
    testConnectionStatus,
    dialogState,
    onPick,
    onPickPublicServer,
    refreshConnection,
    openAddKnownHostDialog,
    openEditKnownHostDialog,
    closeKnownHostDialog,
    handleDialogRemove,
    handleDialogSubmit,
  } = useKnownHostsComponent({ onChange });

  const [open, setOpen] = useState(false);
  const publicServers = usePublicServers(open);
  const rootRef = useRef<HTMLDivElement>(null);
  const hostLabelId = useId();

  // Close the dropdown when the user clicks outside.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const showError = Boolean(touched && error);

  return (
    <div ref={rootRef} className="relative">
      <div className="block">
        <span className="flex items-center justify-between text-xs font-medium text-text-muted mb-1">
          <span id={hostLabelId}>{t('KnownHosts.label')}</span>
          {showError && (
            <span className="flex items-center gap-1 text-[0.7rem] text-danger">
              <AlertCircle size={11} />
              {error}
            </span>
          )}
        </span>
        <div
          className={[
            'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-bg-elevated border transition-colors',
            showError ? 'border-danger' : 'border-border-control hover:border-text-muted',
            'focus-within:outline-none focus-within:ring-1 focus-within:border-accent focus-within:ring-accent',
            disabled ? 'opacity-60' : '',
          ].join(' ')}
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            aria-labelledby={hostLabelId}
            className={[
              'flex-1 min-w-0 flex items-center gap-2 text-left bg-transparent focus:outline-none',
              disabled ? 'cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            {selectedHost ? (
              <SelectedHost host={selectedHost} status={testConnectionStatus} />
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </button>
          {selectedHost && (
            <button
              type="button"
              disabled={disabled || testConnectionStatus === TestConnection.TESTING}
              onClick={(e) => {
                e.stopPropagation();
                refreshConnection();
              }}
              className={[
                'shrink-0 p-1 rounded text-text-muted transition-colors',
                disabled || testConnectionStatus === TestConnection.TESTING
                  ? 'cursor-not-allowed'
                  : 'hover:text-text-primary hover:bg-border-subtle cursor-pointer',
              ].join(' ')}
              title={t('KnownHosts.refresh')}
              aria-label={t('KnownHosts.refresh')}
            >
              <RefreshCw
                size={13}
                className={testConnectionStatus === TestConnection.TESTING ? 'animate-spin' : ''}
              />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((o) => !o)}
            aria-label={t('KnownHosts.toggle')}
            className={[
              'shrink-0 text-text-muted focus:outline-none',
              disabled ? 'cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            <ChevronDown
              size={14}
              className={['transition-transform', open ? 'rotate-180' : ''].join(' ')}
            />
          </button>
        </div>
      </div>

      {open && (
        <div
          className={[
            'absolute z-30 mt-1 w-full max-h-72 overflow-y-auto',
            'rounded-md bg-bg-surface border border-border-subtle shadow-glow py-1',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openAddKnownHostDialog();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-accent hover:bg-bg-elevated transition-colors"
          >
            <Plus size={14} /> {t('KnownHosts.add')}
          </button>
          <div className="my-1 border-t border-border-subtle" />
          {hosts.map((host) => {
            const hostPort = getHostPort(host);
            const isSelected = selectedHost?.id === host.id;
            return (
              <div
                key={host.id}
                className={[
                  'group flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors',
                  isSelected
                    ? 'bg-accent/20 text-text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
                ].join(' ')}
                onClick={() => {
                  if (host.id != null) {
                    void onPick(host.id);
                    setOpen(false);
                  }
                }}
              >
                <span className="w-4 shrink-0 flex justify-center">
                  {isSelected && <Check size={12} className="text-accent" />}
                </span>
                <span className="shrink-0">
                  {testConnectionStatus === TestConnection.FAILED && isSelected ? (
                    <WifiOff size={14} className="text-danger" />
                  ) : testConnectionStatus === TestConnection.SUCCESS && isSelected ? (
                    <Wifi size={14} className="text-success" />
                  ) : testConnectionStatus === TestConnection.TESTING && isSelected ? (
                    <Loader2 size={14} className="text-warning animate-spin" />
                  ) : (
                    <Wifi size={14} className="text-text-muted" />
                  )}
                </span>
                <span className="flex-1 min-w-0 truncate">
                  <span className="font-medium">{host.name}</span>
                  <span className="text-text-muted ml-1.5 text-xs tabular-nums">
                    {hostPort.host}:{hostPort.port}
                  </span>
                </span>
                {host.editable && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      openEditKnownHostDialog(host);
                    }}
                    className={[
                      'p-1 rounded text-text-muted hover:text-text-primary',
                      'hover:bg-border-subtle opacity-0 group-hover:opacity-100 transition-opacity',
                    ].join(' ')}
                    title="Edit host"
                    aria-label="Edit host"
                  >
                    <Pencil size={12} />
                  </button>
                )}
              </div>
            );
          })}
          <div className="my-1 border-t border-border-subtle" />
          <div className="flex items-center justify-between px-3 py-1 text-xs font-medium text-text-muted">
            <span>{t('KnownHosts.public.title')}</span>
            <button
              type="button"
              onClick={refreshPublicServers}
              disabled={publicServers.status === LoadingState.LOADING}
              className="p-1 rounded hover:text-text-primary hover:bg-border-subtle disabled:cursor-not-allowed"
              title={t('KnownHosts.public.refresh')}
              aria-label={t('KnownHosts.public.refresh')}
            >
              <RefreshCw size={12} className={publicServers.status === LoadingState.LOADING ? 'animate-spin' : ''} />
            </button>
          </div>
          {publicServers.status === LoadingState.LOADING && (
            <div className="px-3 py-1.5 text-xs text-text-muted">{t('KnownHosts.public.loading')}</div>
          )}
          {publicServers.status === LoadingState.ERROR && (
            <div className="px-3 py-1.5 text-xs text-danger">{t('KnownHosts.public.error')}</div>
          )}
          {publicServers.status === LoadingState.READY && publicServers.value?.stale && (
            <div className="px-3 py-1.5 text-xs text-text-muted">{t('KnownHosts.public.stale')}</div>
          )}
          {publicServers.status === LoadingState.READY
            && publicServerOptions(publicServers.value?.servers ?? [], hosts).map(({ server, unavailableReason }) => {
              const reason = unavailableReason && t(`KnownHosts.public.unavailable.${unavailableReason}`);
              return (
                <button
                  key={server.host}
                  type="button"
                  disabled={Boolean(reason)}
                  title={reason || server.site}
                  onClick={() => {
                    setOpen(false);
                    void onPickPublicServer(server);
                  }}
                  className={[
                    'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors',
                    reason
                      ? 'text-text-muted cursor-not-allowed'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated',
                  ].join(' ')}
                >
                  <span className="w-4 shrink-0" />
                  <Globe size={14} className="shrink-0 text-text-muted" />
                  <span className="flex-1 min-w-0 truncate">
                    <span className="font-medium">{server.name}</span>
                    <span className="text-text-muted ml-1.5 text-xs">
                      {reason ?? [server.location, `${server.host}:${server.websocketPort}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              );
            })}
        </div>
      )}

      <KnownHostDialog
        isOpen={dialogState.open}
        host={dialogState.edit ?? undefined}
        onRemove={handleDialogRemove}
        onSubmit={handleDialogSubmit}
        handleClose={closeKnownHostDialog}
      />
    </div>
  );
};

/** Compact "selected host" summary shown in the closed dropdown
 *  button — connection-status icon + `Name (host:port)`. Keeps the
 *  Login form's Host input readable without expanding the dropdown. */
function SelectedHost({
  host,
  status,
}: {
  host: HostDTO;
  status: TestConnection | null;
}) {
  const hostPort = getHostPort(host);
  const StatusIcon =
    status === TestConnection.FAILED
      ? WifiOff
      : status === TestConnection.TESTING
        ? Loader2
        : Wifi;
  const statusColor =
    status === TestConnection.FAILED
      ? 'text-danger'
      : status === TestConnection.SUCCESS
        ? 'text-success'
        : status === TestConnection.TESTING
          ? 'text-warning animate-spin'
          : 'text-text-muted';
  return (
    <>
      <StatusIcon size={14} className={statusColor + ' shrink-0'} />
      <span className="truncate text-text-primary">
        {host.name}{' '}
        <span className="text-text-muted text-xs tabular-nums">
          ({hostPort.host}:{hostPort.port})
        </span>
      </span>
    </>
  );
}

export default KnownHosts;
