import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@app/dialogs';
import { refreshCardDataPreferences } from '@app/hooks';
import {
  ALL_STORES,
  CARD_DATA_STORES,
  clearCardData,
  clearScryfallCache,
  isPersistentStorageSupported,
  requestPersistentStorage,
  SCRYFALL_CACHE_STORES,
  type Stores,
} from '@app/services';
import { toBcp47 } from '@app/utils';

import type { CustomControlProps } from '../registry';
import { refreshStorageStatus, useStorageStatus, type StorageStatus } from './useStorageStatus';

/** Bytes as the largest unit that keeps the number at or above 1, in the UI's locale. */
export function formatBytes(bytes: number, language: string): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(toBcp47(language) || undefined, {
    style: 'unit',
    unit: units[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}

const total = (status: StorageStatus, stores: readonly Stores[]) =>
  stores.reduce((sum, store) => sum + (status.counts[store] ?? 0), 0);

/** Origin usage against quota (navigator.storage.estimate), with every table's row count. */
export function StorageUsageControl({ labelId, describedBy }: CustomControlProps) {
  const { t, i18n } = useTranslation();
  const status = useStorageStatus();
  const { usage } = status;
  const percent = usage && usage.quota > 0 ? Math.min(100, (usage.usage / usage.quota) * 100) : 0;

  return (
    <div className="settings-storage" role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
      {!status.loaded ? (
        <span className="settings-storage__note">{t('SettingsStorage.loading')}</span>
      ) : usage ? (
        <>
          <span>
            {t('SettingsStorage.usage.value', {
              used: formatBytes(usage.usage, i18n.language),
              quota: formatBytes(usage.quota, i18n.language),
            })}
          </span>
          <progress className="settings-storage__meter" max={100} value={percent} aria-labelledby={labelId} />
        </>
      ) : (
        <span className="settings-storage__note">{t('SettingsStorage.usage.unavailable')}</span>
      )}
      {status.loaded && (
        <dl className="settings-storage__tables">
          {ALL_STORES.map((store) => (
            <div key={store} className="settings-storage__table">
              <dt>{t(`SettingsStorage.table.${store}`)}</dt>
              <dd>{(status.counts[store] ?? 0).toLocaleString(toBcp47(i18n.language) || undefined)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Asks the browser not to evict this origin's data (navigator.storage.persist). */
export function PersistentStorageControl({ id, labelId, describedBy, disabled }: CustomControlProps) {
  const { t } = useTranslation();
  const { persisted } = useStorageStatus();
  const [refused, setRefused] = useState(false);

  const request = async () => {
    const granted = await requestPersistentStorage();
    setRefused(!granted);
    await refreshStorageStatus();
  };

  const state = persisted ? 'granted' : refused ? 'refused' : 'default';

  return (
    <span className="settings-permission" role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
      <span className="settings-permission__status" data-permission={state === 'refused' ? 'denied' : state}>
        {t(`SettingsStorage.persistent.status.${state}`)}
      </span>
      {!persisted && isPersistentStorageSupported() && (
        <button id={id} type="button" className="settings-button" disabled={disabled} onClick={request}>
          <ShieldCheck size={14} aria-hidden />
          {t('SettingsStorage.persistent.request')}
        </button>
      )}
    </span>
  );
}

interface ClearStoresControlProps extends CustomControlProps {
  stores: readonly Stores[];
  clear: () => Promise<void>;
  /** i18n prefix holding `count`, `button` and, when the clear needs confirming, `confirm.*`. */
  keyPrefix: string;
  confirm: boolean;
}

function ClearStoresControl({ id, labelId, describedBy, disabled, stores, clear, keyPrefix, confirm }: ClearStoresControlProps) {
  const { t } = useTranslation();
  const status = useStorageStatus();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const count = total(status, stores);

  const run = async () => {
    setConfirming(false);
    setBusy(true);
    setFailed(false);
    try {
      await clear();
    } catch {
      setFailed(true);
    }
    await refreshStorageStatus();
    setBusy(false);
  };

  return (
    <span className="settings-permission" role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
      <span className="settings-permission__status" data-permission={failed ? 'denied' : undefined}>
        {failed ? t('SettingsStorage.clearFailed') : t(`${keyPrefix}.count`, { count })}
      </span>
      <button
        id={id}
        type="button"
        className="settings-button"
        disabled={disabled || busy || !status.loaded || count === 0}
        onClick={() => (confirm ? setConfirming(true) : void run())}
      >
        <Trash2 size={14} aria-hidden />
        {t(`${keyPrefix}.button`)}
      </button>
      {confirm && (
        <ConfirmDialog
          isOpen={confirming}
          title={t(`${keyPrefix}.confirm.title`)}
          message={t(`${keyPrefix}.confirm.message`)}
          confirmLabel={t(`${keyPrefix}.button`)}
          cancelLabel={t('SettingsStorage.cancel')}
          destructive
          onConfirm={() => void run()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </span>
  );
}

/** Card lookups cached from Scryfall; refetched on demand, so no confirmation. */
export function ClearScryfallCacheControl(props: CustomControlProps) {
  return (
    <ClearStoresControl
      {...props}
      stores={SCRYFALL_CACHE_STORES}
      clear={clearScryfallCache}
      keyPrefix="SettingsStorage.scryfallCache"
      confirm={false}
    />
  );
}

/**
 * Deletes the card database, then reloads the card-data preferences so set names and the deck
 * editor's lookup cache stop serving the deleted cards.
 */
async function deleteCardData(): Promise<void> {
  await clearCardData();
  await refreshCardDataPreferences();
}

/** The imported card database; only a fresh import brings it back, so it asks first. */
export function ClearCardDataControl(props: CustomControlProps) {
  return (
    <ClearStoresControl
      {...props}
      stores={CARD_DATA_STORES}
      clear={deleteCardData}
      keyPrefix="SettingsStorage.cardData"
      confirm
    />
  );
}
